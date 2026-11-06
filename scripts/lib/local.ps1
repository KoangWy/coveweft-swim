# Shared helpers for scripts/demo.ps1 and scripts/reset.ps1 (Windows).
# Dot-source this file; it does not run anything on its own.
# Written for Windows PowerShell 5.1 and PowerShell 7.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$script:RootDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:EnvFile = Join-Path $script:RootDir '.env.local'
$script:EnvExample = Join-Path $script:RootDir '.env.example'
$script:AppImage = 'coveweft-swim-app:local'
$script:AppContainer = 'coveweft-swim-app'
$script:AppPort = if ($env:APP_PORT) { $env:APP_PORT } else { '3000' }
$script:AppUrl = "http://localhost:$($script:AppPort)"
$script:SupabaseStatus = @{}
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Write-Step([string]$Message) {
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Info([string]$Message) {
    Write-Host "    $Message"
}

function Write-Ok([string]$Message) {
    Write-Host "    $Message" -ForegroundColor Green
}

function Stop-WithError([string]$Message, [string[]]$Hints = @()) {
    Write-Host ''
    Write-Host "Error: $Message" -ForegroundColor Red
    foreach ($hint in $Hints) {
        Write-Host "       $hint"
    }
    exit 1
}

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# Runs a native command, shows its output, and returns its exit code without
# letting stderr output turn into a terminating error in Windows PowerShell 5.1.
function Invoke-Native([scriptblock]$Command) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Command | Out-Host
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
}

# Returns the output of a native command, ignoring stderr. Windows PowerShell
# 5.1 turns redirected stderr into errors, which would stop the script.
function Get-NativeOutput([scriptblock]$Command) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        return (& $Command 2>$null)
    } finally {
        $ErrorActionPreference = $previous
    }
}

# Checks that Docker is installed and running and that the Supabase CLI is
# available. Every failure prints the next step to take.
function Test-Prerequisites {
    Write-Step 'Checking prerequisites'

    if ($script:AppPort -notmatch '^[0-9]{1,5}$' -or [int]$script:AppPort -lt 1 -or [int]$script:AppPort -gt 65535) {
        Stop-WithError "APP_PORT must be a TCP port number, not '$($script:AppPort)'." @(
            'Pick another port, for example:',
            '  $env:APP_PORT = "3100"; .\scripts\demo.ps1'
        )
    }

    if (-not (Test-Command 'docker')) {
        Stop-WithError 'Docker is not installed.' @(
            'Install Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/',
            'Use the WSL 2 backend, then open a new PowerShell window.'
        )
    }
    $code = Invoke-Native { docker info *> $null }
    if ($code -ne 0) {
        Stop-WithError 'Docker is installed but not running.' @(
            'Start Docker Desktop and wait until it reports that the engine is running.'
        )
    }
    $dockerVersion = Get-NativeOutput { docker version --format '{{.Server.Version}}' }
    Write-Ok "Docker $dockerVersion"

    if (-not (Test-Command 'supabase')) {
        Stop-WithError 'The Supabase CLI is not installed.' @(
            'Install it with Scoop:',
            '  scoop bucket add supabase https://github.com/supabase/scoop-bucket.git',
            '  scoop install supabase',
            'See https://supabase.com/docs/guides/local-development/cli/getting-started'
        )
    }
    $supabaseVersion = Get-NativeOutput { supabase --version } | Select-Object -First 1
    Write-Ok "Supabase CLI $supabaseVersion"

    if (-not (Test-Command 'tar.exe')) {
        Stop-WithError 'tar.exe was not found.' @(
            'It ships with Windows 10 (1803) and later. Update Windows or install bsdtar.'
        )
    }
}

# Reads `project_id` from supabase/config.toml. The CLI names its containers
# and network after it.
function Get-ProjectId {
    $config = Join-Path $script:RootDir 'supabase\config.toml'
    foreach ($line in [IO.File]::ReadAllLines($config)) {
        if ($line -match '^project_id\s*=\s*"([^"]+)"\s*$') {
            return $Matches[1]
        }
    }
    Stop-WithError 'Could not read project_id from supabase/config.toml.'
}

function Test-SupabaseRunning {
    Push-Location $script:RootDir
    try {
        $code = Invoke-Native { supabase status *> $null }
        return ($code -eq 0)
    } finally {
        Pop-Location
    }
}

# Starts the local Supabase stack unless it is already running. The first
# start creates the database and applies the migrations and seed.
function Start-Supabase {
    Write-Step 'Starting local Supabase'
    if (Test-SupabaseRunning) {
        Write-Ok 'Already running'
        return
    }
    Write-Info 'The first start downloads the Supabase images and can take several minutes.'
    Push-Location $script:RootDir
    try {
        $code = Invoke-Native { supabase start }
    } finally {
        Pop-Location
    }
    if ($code -ne 0) {
        Stop-WithError 'supabase start failed.' @(
            'Check that ports 54321-54324 are free and that Docker has enough memory (4 GB or more).',
            "Then run the script again; run 'supabase stop' first if the stack is half started."
        )
    }
    Write-Ok 'Supabase is running'
}

function Read-SupabaseStatus {
    Push-Location $script:RootDir
    try {
        $lines = Get-NativeOutput { supabase status -o env }
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($code -ne 0) {
        Stop-WithError "Could not read 'supabase status'." @("Run 'supabase status' to see what is wrong.")
    }
    $values = @{}
    foreach ($line in $lines) {
        if ($line -match '^([A-Z0-9_]+)="?([^"]*)"?$') {
            $values[$Matches[1]] = $Matches[2]
        }
    }
    $script:SupabaseStatus = $values
}

# Parses an env file into an ordered list of lines and a key/value map.
function Read-EnvFile([string]$Path) {
    $values = @{}
    if (-not (Test-Path $Path)) {
        return $values
    }
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        if ($line -match '^\s*#' -or $line -notmatch '=') {
            continue
        }
        $index = $line.IndexOf('=')
        $name = $line.Substring(0, $index).Trim()
        $value = $line.Substring($index + 1).Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$name] = $value
    }
    return $values
}

function Get-EnvValue([string]$Key, [string]$Path = $script:EnvFile) {
    $values = Read-EnvFile $Path
    if ($values.ContainsKey($Key)) {
        return $values[$Key]
    }
    return ''
}

# Sets KEY=VALUE in .env.local, replacing an existing line or appending one.
# The file is written as UTF-8 without a byte order mark so that Docker reads
# the first key correctly.
function Set-EnvValue([string]$Key, [string]$Value) {
    $lines = New-Object System.Collections.Generic.List[string]
    $done = $false
    foreach ($line in [IO.File]::ReadAllLines($script:EnvFile)) {
        if (-not $done -and $line -notmatch '^\s*#' -and $line -match '=') {
            $name = $line.Substring(0, $line.IndexOf('=')).Trim()
            if ($name -eq $Key) {
                $lines.Add("$Key=$Value")
                $done = $true
                continue
            }
        }
        $lines.Add($line)
    }
    if (-not $done) {
        $lines.Add("$Key=$Value")
    }
    [IO.File]::WriteAllLines($script:EnvFile, $lines, $script:Utf8NoBom)
}

function Get-AiKeyState {
    if (Get-EnvValue 'AI_PRIMARY_API_KEY') {
        return 'primary key set'
    }
    return 'not set, the assistant will report that it is not configured'
}

# Creates .env.local from .env.example on the first run. Later runs refresh
# only the values that come from the local Supabase stack and fill in keys
# that are missing or empty, so AI keys and other edits are kept.
function Write-EnvFile {
    Write-Step 'Writing .env.local'
    Read-SupabaseStatus

    $apiUrl = $script:SupabaseStatus['API_URL']
    $publishableKey = $script:SupabaseStatus['PUBLISHABLE_KEY']
    $secretKey = $script:SupabaseStatus['SECRET_KEY']
    if (-not $publishableKey -or -not $secretKey) {
        Stop-WithError "'supabase status' did not print PUBLISHABLE_KEY and SECRET_KEY." @(
            'Update the Supabase CLI to a current version and run the script again.'
        )
    }

    if (Test-Path $script:EnvFile) {
        Write-Info 'Keeping your existing .env.local and refreshing the local Supabase values.'
    } else {
        $example = [IO.File]::ReadAllLines($script:EnvExample)
        [IO.File]::WriteAllLines($script:EnvFile, $example, $script:Utf8NoBom)
        Write-Info 'Created .env.local from .env.example.'
    }

    Set-EnvValue 'NEXT_PUBLIC_SUPABASE_URL' $apiUrl
    Set-EnvValue 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' $publishableKey
    Set-EnvValue 'SUPABASE_SECRET_KEY' $secretKey
    if (-not (Get-EnvValue 'SUPABASE_URL_INTERNAL')) {
        Set-EnvValue 'SUPABASE_URL_INTERNAL' $apiUrl
    }

    # Fill keys added to .env.example after .env.local was created.
    $defaults = Read-EnvFile $script:EnvExample
    $current = Read-EnvFile $script:EnvFile
    foreach ($key in $defaults.Keys) {
        if ($defaults[$key] -and -not $current[$key]) {
            Set-EnvValue $key $defaults[$key]
        }
    }

    Write-Ok ".env.local is ready (AI keys: $(Get-AiKeyState))"
}

# Writes a copy of .env.local that `docker run --env-file` can read: no
# comments and no quotes. The server-side Supabase URL points at the API
# gateway on the Supabase Docker network, and the app and media URLs follow
# APP_PORT because the container serves the extracted media itself.
function Write-ContainerEnv([string]$Path, [string]$InternalUrl) {
    $values = Read-EnvFile $script:EnvFile
    $values['SUPABASE_URL_INTERNAL'] = $InternalUrl
    $values['NEXT_PUBLIC_APP_URL'] = $script:AppUrl
    $values['MEDIA_BASE_URL'] = "$($script:AppUrl)/media"
    $lines = foreach ($key in $values.Keys) { "$key=$($values[$key])" }
    [IO.File]::WriteAllLines($Path, [string[]]$lines, $script:Utf8NoBom)
}

# Creates the demo customer and administrator inside the app image, so the
# host does not need Node.js.
function Invoke-Provisioning([string]$Network, [string]$ContainerEnv) {
    Write-Step 'Provisioning demo accounts'
    $code = Invoke-Native {
        docker run --rm --network $Network --env-file $ContainerEnv $script:AppImage node scripts/provision-demo.mjs
    }
    if ($code -ne 0) {
        Stop-WithError 'Could not create the demo accounts.' @("Check that Supabase is running ('supabase status').")
    }
}

function Write-Accounts {
    Write-Host ''
    Write-Host 'Demo accounts (local only)' -ForegroundColor Cyan
    Write-Host "    Customer       $(Get-EnvValue 'DEMO_CUSTOMER_EMAIL') / $(Get-EnvValue 'DEMO_CUSTOMER_PASSWORD')"
    Write-Host "    Administrator  $(Get-EnvValue 'DEMO_ADMIN_EMAIL') / $(Get-EnvValue 'DEMO_ADMIN_PASSWORD')"
}

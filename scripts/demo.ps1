<#
.SYNOPSIS
Runs the COVEWEFT Swim demo locally on Windows.

.DESCRIPTION
Needs only Docker Desktop and the Supabase CLI. The script starts the local
Supabase stack, writes .env.local, applies pending migrations, loads the
catalog seed, downloads and verifies the studio media, creates the demo
accounts, and runs the app in a container on the Supabase Docker network.

Running it again keeps the database and the media cache, so later runs are
faster. Use scripts\reset.ps1 to reload the database.

Optional environment variables:
  APP_PORT            host port for the app (default 3000)
  GITHUB_TOKEN        token with read access, needed while the media release
                      is in a private repository
  MEDIA_ARCHIVE_PATH  path to an already downloaded media archive
  MEDIA_CACHE_DIR     where the extracted media is kept (default .media-cache)
  MEDIA_REPOSITORY    GitHub repository that hosts the media release

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo.ps1
#>
[CmdletBinding()]
param()

. (Join-Path $PSScriptRoot 'lib\local.ps1')

$MediaRepository = if ($env:MEDIA_REPOSITORY) { $env:MEDIA_REPOSITORY } else { 'KoangWy/coveweft-swim' }
$MediaCacheDir = if ($env:MEDIA_CACHE_DIR) { $env:MEDIA_CACHE_DIR } else { Join-Path $RootDir '.media-cache' }
$StartedAt = Get-Date

# The previous app container is replaced on every run, so remove it before
# checking that the port is free.
function Test-AppPort {
    Invoke-Native { docker rm -f $AppContainer *> $null } | Out-Null
    $listener = $null
    try {
        $listener = Get-NetTCPConnection -LocalPort ([int]$AppPort) -State Listen -ErrorAction SilentlyContinue
    } catch {
        $listener = $null
    }
    if ($listener) {
        Stop-WithError "Port $AppPort is already in use." @(
            'Stop the program that listens on it, or pick another port:',
            '  $env:APP_PORT = "3100"; .\scripts\demo.ps1'
        )
    }
}

function Invoke-Migrations {
    Write-Step 'Applying pending migrations'
    Push-Location $RootDir
    try {
        $code = Invoke-Native { supabase migration up }
    } finally {
        Pop-Location
    }
    if ($code -ne 0) {
        Stop-WithError 'Could not apply the migrations.' @(
            "Run 'supabase migration list' to compare the local files with the database."
        )
    }
    Write-Ok 'Database schema is up to date'
}

# The seed only inserts rows that are missing, so it is safe on every run and
# keeps orders, stock changes, and admin edits. It is copied into the database
# container instead of piped, so PowerShell does not re-encode the UTF-8 file.
function Import-Seed([string]$DbContainer) {
    Write-Step 'Loading the catalog seed'
    $seed = Join-Path $RootDir 'supabase\seed.sql'
    $code = Invoke-Native { docker cp $seed "${DbContainer}:/tmp/coveweft-seed.sql" *> $null }
    if ($code -ne 0) {
        Stop-WithError "Could not copy the seed into $DbContainer."
    }
    $code = Invoke-Native {
        docker exec $DbContainer psql --quiet --no-psqlrc -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/coveweft-seed.sql > $null
    }
    if ($code -ne 0) {
        Stop-WithError 'The catalog seed failed.' @('Run scripts\reset.ps1 to rebuild the local database.')
    }
    Invoke-Native { docker exec $DbContainer rm -f /tmp/coveweft-seed.sql } | Out-Null
    Write-Ok 'Catalog is loaded'
}

function Get-GitHubToken {
    if ($env:GITHUB_TOKEN) {
        return $env:GITHUB_TOKEN
    }
    $token = Get-EnvValue 'GITHUB_TOKEN'
    if (-not $token -and (Test-Command 'gh')) {
        $token = Get-NativeOutput { gh auth token }
        if ($LASTEXITCODE -ne 0) {
            $token = ''
        }
    }
    return "$token".Trim()
}

function Invoke-Download([string]$Url, [string]$Target, [hashtable]$Headers) {
    if (Test-Command 'curl.exe') {
        $arguments = @('-fL', '--retry', '3', '--progress-bar', '-C', '-', '-o', $Target)
        foreach ($name in $Headers.Keys) {
            $arguments += @('-H', "${name}: $($Headers[$name])")
        }
        $arguments += $Url
        # curl drops the Authorization header when it follows the redirect to
        # the storage host.
        return (Invoke-Native { curl.exe @arguments })
    }
    try {
        Invoke-WebRequest -Uri $Url -Headers $Headers -OutFile $Target -UseBasicParsing
        return 0
    } catch {
        Write-Info $_.Exception.Message
        return 1
    }
}

function Get-MediaArchive([string]$Tag, [string]$AssetName, [string]$Target) {
    $token = Get-GitHubToken
    if ($token) {
        Write-Info "Downloading $AssetName through the GitHub API."
        $apiHeaders = @{ Authorization = "Bearer $token"; Accept = 'application/vnd.github+json' }
        try {
            $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$MediaRepository/releases/tags/$Tag" -Headers $apiHeaders
        } catch {
            Stop-WithError "Could not read release $Tag of $MediaRepository." @('Check that GITHUB_TOKEN can read the repository.')
        }
        $asset = $release.assets | Where-Object { $_.name -eq $AssetName } | Select-Object -First 1
        if (-not $asset) {
            Stop-WithError "Release $Tag has no asset named $AssetName."
        }
        $code = Invoke-Download $asset.url $Target @{ Authorization = "Bearer $token"; Accept = 'application/octet-stream' }
        if ($code -ne 0) {
            Stop-WithError 'The media download failed.' @('Run the script again; it resumes the download.')
        }
    } else {
        Write-Info "Downloading $AssetName from the public release."
        $url = "https://github.com/$MediaRepository/releases/download/$Tag/$AssetName"
        $code = Invoke-Download $url $Target @{}
        if ($code -ne 0) {
            Stop-WithError 'The media download failed.' @(
                'If the repository is still private, set a token with read access and run again:',
                '  $env:GITHUB_TOKEN = "<token>"; .\scripts\demo.ps1',
                "Or download $AssetName yourself and pass it in:",
                "  `$env:MEDIA_ARCHIVE_PATH = 'C:\path\to\$AssetName'; .\scripts\demo.ps1"
            )
        }
    }
}

function Get-Sha256([string]$Path) {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

# Downloads the release archive for MEDIA_VERSION, checks it against
# MEDIA_ARCHIVE_SHA256, and extracts it into MEDIA_CACHE_DIR\<version>. A
# version that was already extracted and verified is skipped.
function Initialize-Media {
    Write-Step 'Preparing studio media'
    $version = Get-EnvValue 'MEDIA_VERSION'
    $expected = (Get-EnvValue 'MEDIA_ARCHIVE_SHA256').ToLowerInvariant()
    if (-not $version -or -not $expected) {
        Stop-WithError 'MEDIA_VERSION and MEDIA_ARCHIVE_SHA256 must be set in .env.local.' @('Copy them from .env.example.')
    }

    $mediaDir = Join-Path $MediaCacheDir $version
    $marker = Join-Path $mediaDir '.verified'
    if ((Test-Path $marker) -and (Test-Path (Join-Path $mediaDir 'studio')) -and
        ([IO.File]::ReadAllText($marker).Trim() -eq $expected)) {
        Write-Ok "Media $version is already verified in $mediaDir"
        return $mediaDir
    }

    New-Item -ItemType Directory -Force -Path $MediaCacheDir | Out-Null
    $assetName = "coveweft-media-$version.tar.gz"
    $downloaded = $null
    if ($env:MEDIA_ARCHIVE_PATH) {
        $archive = $env:MEDIA_ARCHIVE_PATH
        if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
            Stop-WithError "MEDIA_ARCHIVE_PATH does not point to a file: $archive"
        }
        Write-Info "Using the local archive $archive"
    } else {
        $archive = Join-Path $MediaCacheDir "$assetName.part"
        if (-not (Test-Path $archive) -or (Get-Sha256 $archive) -ne $expected) {
            Get-MediaArchive "media-$version" $assetName $archive
        }
        $downloaded = $archive
    }

    Write-Info 'Verifying SHA-256'
    $actual = Get-Sha256 $archive
    if ($actual -ne $expected) {
        if ($downloaded) {
            Remove-Item -Force $downloaded
        }
        Stop-WithError 'The media archive does not match MEDIA_ARCHIVE_SHA256.' @(
            "expected $expected",
            "actual   $actual",
            'The partial download was removed; run the script again to download it from scratch.'
        )
    }

    Write-Info 'Extracting'
    $staging = "$mediaDir.extracting"
    foreach ($path in @($staging, $mediaDir)) {
        if (Test-Path $path) {
            Remove-Item -Recurse -Force $path
        }
    }
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    $code = Invoke-Native { tar.exe -xzf $archive -C $staging }
    if ($code -ne 0) {
        Stop-WithError 'Could not extract the media archive.'
    }

    $manifest = Join-Path $RootDir "data\media\manifest-$version.json"
    if (Test-Path $manifest) {
        $manifestText = [IO.File]::ReadAllText($manifest)
        if ($manifestText -match '"imageCount"\s*:\s*(\d+)') {
            $expectedFiles = [int]$Matches[1] * 3
            $files = @(Get-ChildItem -Path (Join-Path $staging 'studio') -Recurse -File -Filter '*.webp').Count
            if ($files -ne $expectedFiles) {
                Stop-WithError "The archive holds $files files; the manifest expects $expectedFiles."
            }
        }
    }

    [IO.File]::WriteAllText((Join-Path $staging '.verified'), $expected, $Utf8NoBom)
    Move-Item -Path $staging -Destination $mediaDir
    if ($downloaded) {
        Remove-Item -Force $downloaded
    }
    Write-Ok "Media $version is ready in $mediaDir"
    return $mediaDir
}

function Build-AppImage {
    Write-Step 'Building the app image'
    Write-Info 'The first build installs dependencies and takes a few minutes; later builds reuse the cache.'
    $publicUrl = Get-EnvValue 'NEXT_PUBLIC_SUPABASE_URL'
    $publishableKey = Get-EnvValue 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    $code = Invoke-Native {
        docker build `
            --build-arg "NEXT_PUBLIC_APP_URL=$AppUrl" `
            --build-arg "NEXT_PUBLIC_SUPABASE_URL=$publicUrl" `
            --build-arg "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$publishableKey" `
            -t $AppImage $RootDir
    }
    if ($code -ne 0) {
        Stop-WithError 'The app image did not build.' @(
            'Scroll up for the build error. Make sure Docker Desktop has at least 4 GB of memory.'
        )
    }
    Write-Ok "Image $AppImage is ready"
}

function Start-App([string]$Network, [string]$ContainerEnv, [string]$MediaDir) {
    Write-Step 'Starting the app container'
    $code = Invoke-Native {
        docker run -d --name $AppContainer `
            --network $Network `
            --env-file $ContainerEnv `
            -p "${AppPort}:3000" `
            -v "${MediaDir}:/app/public/media:ro" `
            --restart unless-stopped `
            $AppImage > $null
    }
    if ($code -ne 0) {
        Stop-WithError 'Could not start the app container.' @(
            'If the port is taken, run again with another one: $env:APP_PORT = "3100"; .\scripts\demo.ps1'
        )
    }

    Write-Info "Waiting for $AppUrl"
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri "$AppUrl/en" -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Write-Ok 'The app is up'
                return
            }
        } catch {
            # Not ready yet.
        }
        $running = Get-NativeOutput { docker inspect -f '{{.State.Running}}' $AppContainer }
        if ($running -ne 'true') {
            Invoke-Native { docker logs --tail 40 $AppContainer } | Out-Null
            Stop-WithError 'The app container stopped.' @("See the log above, or run 'docker logs $AppContainer'.")
        }
        Start-Sleep -Seconds 1
    }
    Stop-WithError 'The app did not answer within 60 seconds.' @("Run 'docker logs $AppContainer' to see why.")
}

Test-Prerequisites
Test-AppPort
Start-Supabase
Write-EnvFile

$projectId = Get-ProjectId
$network = "supabase_network_$projectId"
$dbContainer = "supabase_db_$projectId"
$code = Invoke-Native { docker network inspect $network *> $null }
if ($code -ne 0) {
    Stop-WithError "The Supabase Docker network $network was not found." @("Run 'supabase stop' and then this script again.")
}

Invoke-Migrations
Import-Seed $dbContainer
$mediaDir = Initialize-Media
Build-AppImage

$containerEnv = [IO.Path]::GetTempFileName()
try {
    Write-ContainerEnv $containerEnv "http://supabase_kong_${projectId}:8000"
    Invoke-Provisioning $network $containerEnv
    Start-App $network $containerEnv $mediaDir
} finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $containerEnv
}

$span = (Get-Date) - $StartedAt
$elapsed = [int]$span.TotalSeconds
Write-Host ''
Write-Host "COVEWEFT Swim is running (ready in ${elapsed}s)" -ForegroundColor Cyan
Write-Host "    Store              $AppUrl/en  (Vietnamese: $AppUrl/vi)"
Write-Host "    Admin              $AppUrl/en/admin"
Write-Host "    Supabase Studio    $($SupabaseStatus['STUDIO_URL'])"
Write-Host "    Mail (Mailpit)     $($SupabaseStatus['MAILPIT_URL'])"
Write-Accounts
Write-Host ''
Write-Host "    AI assistant: $(Get-AiKeyState)"
Write-Host "    Stop:  docker stop $AppContainer; supabase stop   (data is kept)"
Write-Host '    Reset: .\scripts\reset.ps1'

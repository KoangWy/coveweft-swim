<#
.SYNOPSIS
Resets the local COVEWEFT Swim database on Windows.

.DESCRIPTION
Recreates the database from the migrations and supabase\seed.sql, then creates
the demo accounts again. Orders, carts, registered accounts, and admin edits are
deleted. The media cache and .env.local are kept.

Requires Docker Desktop, the Supabase CLI, and the app image built by
scripts\demo.ps1. The host does not need Node.js.

.PARAMETER Yes
Skips the confirmation question.

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\reset.ps1 -Yes
#>
[CmdletBinding()]
param(
    [Alias('y')]
    [switch]$Yes
)

. (Join-Path $PSScriptRoot 'lib\local.ps1')

function Test-ResetReady {
    if (-not (Test-Path $EnvFile)) {
        Stop-WithError '.env.local was not found.' @('Run .\scripts\demo.ps1 first.')
    }
    $code = Invoke-Native { docker image inspect $AppImage *> $null }
    if ($code -ne 0) {
        Stop-WithError "The app image $AppImage was not found." @('Run .\scripts\demo.ps1 first.')
    }
}

function Confirm-Reset {
    Write-Host ''
    Write-Host 'This deletes all local orders, carts, accounts, and admin edits.' -ForegroundColor Yellow
    Write-Host 'The database is rebuilt from the migrations and the catalog seed.'
    if ($Yes) {
        return
    }
    if ([Console]::IsInputRedirected) {
        Stop-WithError 'No console to confirm the reset.' @('Run .\scripts\reset.ps1 -Yes to skip the question.')
    }
    $answer = Read-Host "Type 'reset' to continue"
    if ($answer -ne 'reset') {
        Write-Host 'Cancelled. Nothing was changed.'
        exit 0
    }
}

Test-Prerequisites
Test-ResetReady
Confirm-Reset

Start-Supabase

Write-Step 'Resetting the database'
Push-Location $RootDir
try {
    $code = Invoke-Native { supabase db reset }
} finally {
    Pop-Location
}
if ($code -ne 0) {
    Stop-WithError 'supabase db reset failed.' @(
        'Scroll up for the error, then run the reset again.'
    )
}
Write-Ok 'Database rebuilt from migrations and seed'

Read-SupabaseStatus
$projectId = Get-ProjectId
$network = "supabase_network_$projectId"
$containerEnv = [IO.Path]::GetTempFileName()
try {
    Write-ContainerEnv $containerEnv "http://supabase_kong_${projectId}:8000"
    Invoke-Provisioning $network $containerEnv
} finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $containerEnv
}

# Sessions from before the reset point at deleted accounts.
$code = Invoke-Native { docker container inspect $AppContainer *> $null }
if ($code -eq 0) {
    Write-Step 'Restarting the app container'
    $code = Invoke-Native { docker restart $AppContainer *> $null }
    if ($code -ne 0) {
        Stop-WithError 'Could not restart the app container.' @(
            "Run 'docker start $AppContainer' or .\scripts\demo.ps1."
        )
    }
    Write-Ok 'Restarted'
}

Write-Host ''
Write-Host 'Reset complete.' -ForegroundColor Cyan -NoNewline
Write-Host " Open $AppUrl/en and sign in again."
Write-Accounts

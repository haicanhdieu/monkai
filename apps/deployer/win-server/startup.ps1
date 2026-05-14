#Requires -Version 5.1
<#
.SYNOPSIS
    Starts Docker service and the monkai book-data compose stack.
    Designed to run at system startup via Windows Task Scheduler.

.PARAMETER TimeoutSeconds
    Seconds to wait for the Docker daemon before giving up. Default: 120.

.PARAMETER DockerExe
    Full path to docker.exe. Defaults to Docker Desktop's standard install path.
    Override if Docker Engine (not Desktop) is installed at a different location.
#>
param(
    [ValidateRange(1, 3600)]
    [int]$TimeoutSeconds = 120,

    [string]$DockerExe = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Resolve docker.exe — prefer explicit path, fall back to PATH.
if (-not (Test-Path $DockerExe)) {
    $DockerExe = (Get-Command 'docker.exe' -ErrorAction SilentlyContinue)?.Source
    if (-not $DockerExe) {
        Write-Error "docker.exe not found at default path or in PATH. Set -DockerExe explicitly."
        exit 1
    }
}

# Ensure the Docker backend Windows service is running.
# For Docker Engine (not Desktop), this service is named 'docker'.
# For Docker Desktop, it is named 'com.docker.service'.
$svcNames = @('docker', 'com.docker.service')
$svcStarted = $false
foreach ($name in $svcNames) {
    $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($null -ne $svc) {
        if ($svc.Status -ne 'Running') {
            Write-Host "Starting Windows service '$name'..."
            Start-Service -Name $name
        } else {
            Write-Host "Service '$name' already running."
        }
        $svcStarted = $true
        break
    }
}
if (-not $svcStarted) {
    Write-Error "Neither 'docker' nor 'com.docker.service' found. Is Docker installed?"
    exit 1
}

# Poll until docker daemon responds.
Write-Host "Waiting for Docker daemon (timeout: ${TimeoutSeconds}s)..."
$elapsed = 0
$ready = $false
while ($elapsed -lt $TimeoutSeconds) {
    $null = & $DockerExe info 2>&1
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 5
    $elapsed += 5
}

if (-not $ready) {
    Write-Error "Docker daemon did not respond within $TimeoutSeconds seconds. Aborting."
    exit 1
}

Write-Host "Docker daemon ready. Starting book-data compose stack..."

Push-Location $scriptDir
try {
    & $DockerExe compose up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Error "docker compose up -d exited with code $LASTEXITCODE"
        exit 1
    }
    Write-Host "Book-data stack started successfully."
} finally {
    Pop-Location
}

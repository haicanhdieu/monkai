#Requires -Version 5.1
<#
.SYNOPSIS
    Starts Docker Engine inside WSL2 and brings up the monkai book-data compose stack.
    Designed for systems running Docker Engine in a WSL2 Ubuntu distro (not Docker Desktop).
    Run via Windows Task Scheduler (SYSTEM account) at system startup.

.PARAMETER WslDistro
    Name of the WSL2 distribution where Docker Engine is installed. Default: Ubuntu.
    Run 'wsl --list' to see available distros.

.PARAMETER ComposeDir
    WSL2-format path to the win-server directory containing docker-compose.yml.
    If omitted, the script auto-derives it from its own Windows location.
    Example: /mnt/c/Users/you/monkai/apps/deployer/win-server

.PARAMETER TimeoutSeconds
    Seconds to wait for the Docker daemon inside WSL2 before aborting. Default: 120.
#>
param(
    [string]$WslDistro = 'Ubuntu',

    [string]$ComposeDir = '',

    [ValidateRange(1, 3600)]
    [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'

# Auto-derive ComposeDir from this script's Windows location if not provided.
if (-not $ComposeDir) {
    $winDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    # Convert C:\Foo\Bar  →  /mnt/c/Foo/Bar
    $drive = $winDir.Substring(0, 1).ToLower()
    $rest  = $winDir.Substring(2).Replace('\', '/')
    $ComposeDir = "/mnt/$drive$rest"
}

# Start WSL2. Executing any command inside the distro warms it up and triggers
# systemd, which starts the docker.service automatically.
Write-Host "Waking WSL2 distribution '$WslDistro'..."
$null = wsl --distribution $WslDistro --exec echo "wsl2-ready" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to start WSL2 distribution '$WslDistro'. Run 'wsl --list' to confirm the name."
    exit 1
}

# Poll until Docker daemon inside WSL2 responds.
Write-Host "Waiting for Docker daemon in WSL2 (timeout: ${TimeoutSeconds}s)..."
$elapsed = 0
$ready = $false
while ($elapsed -lt $TimeoutSeconds) {
    $null = wsl --distribution $WslDistro --exec docker info 2>&1
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 5
    $elapsed += 5
}

if (-not $ready) {
    Write-Error "Docker daemon in WSL2 did not respond within $TimeoutSeconds seconds."
    exit 1
}

Write-Host "Docker ready. Starting book-data compose stack at $ComposeDir..."
wsl --distribution $WslDistro --exec sh -c "cd '$ComposeDir' && docker compose up -d"
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker compose up -d failed inside WSL2 at '$ComposeDir'"
    exit 1
}

Write-Host "Book-data stack started successfully."

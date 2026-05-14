#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Registers 'MonkaiBookDataServer' as a Windows Task Scheduler task.
    The task runs startup-wsl2.ps1 at system boot under the SYSTEM account,
    requiring no user login. Assumes Docker Engine is installed in WSL2 Ubuntu.

.PARAMETER WslDistro
    WSL2 distribution name where Docker Engine is installed. Default: Ubuntu.
    Run 'wsl --list' to confirm. Pass here if your distro has a different name.

    Run this script ONCE as Administrator after completing the migration guide.
    Then reboot (or run Start-ScheduledTask) to verify.
#>
param(
    [string]$WslDistro = 'Ubuntu'
)

$taskName     = 'MonkaiBookDataServer'
$startupScript = Join-Path $PSScriptRoot 'startup-wsl2.ps1'

if (-not (Test-Path $startupScript)) {
    Write-Error "startup-wsl2.ps1 not found at: $startupScript"
    exit 1
}

$scriptArgs = "-NonInteractive -ExecutionPolicy Bypass -File `"$startupScript`" -WslDistro `"$WslDistro`""

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $scriptArgs

# -RandomDelay is the cross-version-safe way to add a startup delay;
# direct .Delay property assignment is silently dropped on some Windows Server editions.
$trigger = New-ScheduledTaskTrigger -AtStartup -RandomDelay (New-TimeSpan -Seconds 30)

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# SYSTEM account — no interactive login required.
$principal = New-ScheduledTaskPrincipal `
    -UserId 'SYSTEM' `
    -LogonType ServiceAccount `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName $taskName `
    -TaskPath '\' `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Starts WSL2 Docker Engine and monkai book-data compose stack at system startup (distro: $WslDistro)." `
    -Force | Out-Null

Write-Host "Task '$taskName' registered (WSL2 distro: $WslDistro)."
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Reboot to confirm auto-start, OR"
Write-Host "  2. Test immediately (still as Admin):"
Write-Host "       Start-ScheduledTask -TaskName '$taskName'"
Write-Host "       # wait ~60s, then:"
Write-Host "       Get-ScheduledTaskInfo -TaskName '$taskName'  # LastTaskResult should be 0"
Write-Host ""
Write-Host "To remove the task later:"
Write-Host "  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"

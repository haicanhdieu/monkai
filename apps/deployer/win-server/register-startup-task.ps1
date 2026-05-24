#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Registers 'MonkaiBookDataServer' as a Windows Task Scheduler task.
    The task runs startup.ps1 at system boot under the SYSTEM account,
    requiring no user login. Targets Docker Desktop (com.docker.service).

    Run this script ONCE as Administrator after initial setup.
    Then reboot (or run Start-ScheduledTask) to verify.
#>
param()

$taskName     = 'MonkaiBookDataServer'
$startupScript = Join-Path $PSScriptRoot 'startup.ps1'

if (-not (Test-Path $startupScript)) {
    Write-Error "startup.ps1 not found at: $startupScript"
    exit 1
}

$scriptArgs = "-NonInteractive -ExecutionPolicy Bypass -File `"$startupScript`""

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
    -Description "Starts Docker Desktop (com.docker.service) and monkai book-data compose stack at system startup." `
    -Force | Out-Null

Write-Host "Task '$taskName' registered."
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

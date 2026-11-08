[CmdletBinding()]
param([ValidateRange(1, 65535)][int]$Port = 4173)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$expectedScript = Join-Path $projectRoot 'server\index.mjs'
$stateFile = Join-Path $projectRoot ".local\server-$Port.json"
if (-not (Test-Path -LiteralPath $stateFile -PathType Leaf)) {
    Write-Host 'No launcher-owned server was recorded. If you started it in a terminal, press Ctrl+C in that terminal.'
    exit 0
}
$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
$serverProcess = Get-Process -Id ([int]$state.processId) -ErrorAction SilentlyContinue
if (-not $serverProcess) {
    Remove-Item -LiteralPath $stateFile
    Write-Host 'The local server is already stopped.'
    exit 0
}
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($serverProcess.Id)"
$sameStart = $serverProcess.StartTime.ToUniversalTime().ToString('o') -eq $state.startedAtUtc
$sameScript = $state.serverScript -eq $expectedScript -and $processInfo.CommandLine -and $processInfo.CommandLine.Contains($expectedScript)
$sameRuntime = $processInfo.ExecutablePath -eq $state.nodeRuntime
if (-not ($sameStart -and $sameScript -and $sameRuntime)) {
    throw 'The saved process no longer matches this project. No process was stopped.'
}
Stop-Process -Id $serverProcess.Id
Remove-Item -LiteralPath $stateFile
Write-Host "Grey Fog Tarot on port $Port has stopped. Saved browser history is unchanged."

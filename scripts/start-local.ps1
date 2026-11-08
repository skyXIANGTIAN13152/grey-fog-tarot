[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [ValidateRange(1, 65535)][int]$Port = 4173
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$siteUrl = "http://127.0.0.1:$Port"
$serverScript = Join-Path $projectRoot 'server\index.mjs'
$entryFile = Join-Path $projectRoot 'dist\index.html'

function Get-CompatibleService {
    try {
        $reply = Invoke-RestMethod -Uri "$siteUrl/api/health" -TimeoutSec 2
        return ($reply.ok -eq $true -and $reply.service -eq 'grey-fog-tarot')
    } catch { return $false }
}

function Test-LocalPort {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $connection = $client.ConnectAsync('127.0.0.1', $Port)
        return ($connection.Wait(800) -and $client.Connected)
    } catch { return $false }
    finally { $client.Dispose() }
}

function Find-NodeRuntime {
    $candidates = New-Object 'System.Collections.Generic.List[string]'
    $onPath = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($onPath) { $candidates.Add($onPath.Source) }
    $candidates.Add('D:\CodexData\RuntimeCache\codex-primary-runtime\dependencies\node\bin\node.exe')
    if ($env:ProgramFiles) {
        $candidates.Add((Join-Path $env:ProgramFiles 'nodejs\node.exe'))
        $appsRoot = Join-Path $env:ProgramFiles 'WindowsApps'
        if (Test-Path -LiteralPath $appsRoot) {
            Get-ChildItem -LiteralPath $appsRoot -Directory -Filter 'OpenAI.CodexPrimaryRuntime*' -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending |
                ForEach-Object { $candidates.Add((Join-Path $_.FullName 'dependencies\node\bin\node.exe')) }
        }
    }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        try {
            $versionText = (& $candidate --version 2>$null | Out-String).Trim()
            if ($LASTEXITCODE -eq 0 -and $versionText -match '^v(\d+)\.(\d+)\.(\d+)$') {
                $majorVersion = [int]$Matches[1]
                $minorVersion = [int]$Matches[2]
                if ($majorVersion -gt 22 -or ($majorVersion -eq 22 -and $minorVersion -ge 12)) { return $candidate }
            }
        } catch { continue }
    }
    throw 'No compatible Node.js was found. Install Node.js 22.12 or later, then run this launcher again. See README.md.'
}

if (-not (Test-Path -LiteralPath $entryFile -PathType Leaf)) {
    throw 'The built website is missing (dist/index.html). Run pnpm install and pnpm build first. See README.md.'
}
if (-not (Test-Path -LiteralPath $serverScript -PathType Leaf)) { throw 'The local server files are missing. Please restore the complete project folder.' }

if (Get-CompatibleService) {
    Write-Host "Grey Fog Tarot is already running: $siteUrl"
    if (-not $NoBrowser) { Start-Process -FilePath $siteUrl }
    exit 0
}
if (Test-LocalPort) { throw "Port $Port is used by another program. Close that program or run this script with -Port 4174." }

$nodeRuntime = Find-NodeRuntime
$stateDir = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$outputLog = Join-Path $stateDir "server-$Port.out.log"
$errorLog = Join-Path $stateDir "server-$Port.err.log"
$stateFile = Join-Path $stateDir "server-$Port.json"
# Node receives only a script path and a port. API keys stay in request memory.
$arguments = @(('"{0}"' -f $serverScript), "--port=$Port")
$serverProcess = Start-Process -FilePath $nodeRuntime -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 200
    $serverProcess.Refresh()
    if ($serverProcess.HasExited) { break }
    if (Get-CompatibleService) { $ready = $true; break }
}
if (-not $ready) {
    if (-not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue }
    throw "The local server did not start. Read .local/server-$Port.err.log for details."
}
[ordered]@{
    processId = $serverProcess.Id
    startedAtUtc = $serverProcess.StartTime.ToUniversalTime().ToString('o')
    serverScript = $serverScript
    nodeRuntime = $nodeRuntime
    port = $Port
} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8

Write-Host "Grey Fog Tarot is ready: $siteUrl"
Write-Host 'The server runs in the background. Use scripts/stop-local.ps1 to stop it.'
if (-not $NoBrowser) { Start-Process -FilePath $siteUrl }

param([switch]$NoPrompt, [switch]$NoBrowser, [switch]$Check, [int]$Port = 0)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$candidates = @()
if ($env:FIN_PYTHON) { $candidates += $env:FIN_PYTHON }
$candidates += @(Get-Command python.exe -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source })
$candidates += @('D:\DevTools\Python\Python314\python.exe', "$env:LOCALAPPDATA\Programs\Python\Python314\python.exe", "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe", "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe")
$pythonExe = $null
foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    try {
        & $candidate -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>$null
        if ($LASTEXITCODE -eq 0) { $pythonExe = $candidate; break }
    } catch { continue }
}
if (-not $pythonExe) { throw 'Python 3.10+ is required. Install Python or set FIN_PYTHON to its full executable path.' }
if ($Check) { Write-Output "Python ready: $pythonExe"; exit 0 }
if (-not $env:DEEPSEEK_API_KEY -and -not $NoPrompt) {
    Write-Host 'FinSight - Local Financial Analysis Assistant' -ForegroundColor Green
    Write-Host 'Enter your DeepSeek API key below. Input is hidden; press Enter to use local analysis only.'
    $secureKey = Read-Host 'DeepSeek API Key' -AsSecureString
    if ($secureKey.Length -gt 0) {
        $credential = New-Object System.Net.NetworkCredential('', $secureKey)
        $env:DEEPSEEK_API_KEY = $credential.Password
        $credential = $null
    }
    $secureKey.Dispose()
}
if ($Port -eq 0) {
    foreach ($candidatePort in 8765..8785) {
        $probe = $null
        try {
            $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidatePort)
            $probe.Start()
            $Port = $candidatePort
            break
        } catch { continue } finally { if ($probe) { $probe.Stop() } }
    }
}
if ($Port -eq 0) { throw 'No local port available in 8765-8785.' }
$env:PYTHONIOENCODING = 'utf-8'
Write-Host "Open http://127.0.0.1:$Port in your browser. Keep this window open; Ctrl+C stops the app." -ForegroundColor Green
if (-not $NoBrowser) {
    # Python opens the page after the HTTP server starts; no extra background helper.
    & $pythonExe server.py --port $Port --open
} else {
    & $pythonExe server.py --port $Port
}

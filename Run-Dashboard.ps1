# Run-Dashboard.ps1
# GMA Live Dashboard — Portable Network Server
# This script starts a lightweight web server on your local network.

$port = 8080
$url = "http://localhost:$port"
$contentPath = Get-Location
$dataPath = Join-Path $contentPath "data.json"

# Create initial data.json if it doesn't exist
if (-not (Test-Path $dataPath)) {
    Get-Content "app.js" | Select-String -Pattern 'pos: (\[.*\])' | ForEach-Object { $_.Matches.Groups[1].Value } | Out-File $dataPath
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://*:$port/")
$listener.Start()

Write-Host "----------------------------------------------------" -ForegroundColor Cyan
Write-Host "GMA LIVE DASHBOARD — NETWORK SERVER ACTIVE" -ForegroundColor Green
Write-Host "----------------------------------------------------" -ForegroundColor Cyan
Write-Host "1. Share this link with your team: http://$($env:COMPUTERNAME):$port/GMA-Dashboard.aspx"
Write-Host "2. Data is being saved to: $dataPath"
Write-Host "3. Keep this window open while using the dashboard."
Write-Host "----------------------------------------------------"
Write-Host "Press Ctrl+C to stop the server."

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $relativePath = $request.Url.LocalPath.TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = "GMA-Dashboard.aspx" }
    $localFile = Join-Path $contentPath $relativePath

    # API Support: Save Data
    if ($request.HttpMethod -eq "POST" -and $relativePath -eq "api/save") {
        $reader = New-Object System.IO.StreamReader($request.InputStream)
        $body = $reader.ReadToEnd()
        $body | Out-File $dataPath -Encoding utf8
        
        $buffer = [System.Text.Encoding]::UTF8.GetBytes('{"status":"success"}')
        $response.ContentType = "application/json"
        $response.ContentLength64 = $buffer.Length
        $response.HeaderEncoding = [System.Text.Encoding]::UTF8
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
    }
    # API Support: Load Data
    elseif ($request.HttpMethod -eq "GET" -and $relativePath -eq "api/data") {
        $buffer = [System.IO.File]::ReadAllBytes($dataPath)
        $response.ContentType = "application/json"
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
    }
    # Serve Static Files
    elseif (Test-Path $localFile -PathType Leaf) {
        $buffer = [System.IO.File]::ReadAllBytes($localFile)
        $ext = [System.IO.Path]::GetExtension($localFile).ToLower()
        $response.ContentType = switch ($ext) {
            ".html" { "text/html" }
            ".aspx" { "text/html" }
            ".css"  { "text/css" }
            ".js"   { "application/javascript" }
            ".png"  { "image/png" }
            default { "application/octet-stream" }
        }
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
    }
    else {
        $response.StatusCode = 404
    }
    $response.Close()
}

# Live Transcriber - Local Server
# Run this script in PowerShell

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Live Transcriber Server" -ForegroundColor Cyan
Write-Host "  URL: http://localhost:8080" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Start browser
Start-Process "http://localhost:8080"

# Create simple HTTP server using .NET
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")
$listener.Start()

$root = $PSScriptRoot

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $path = $request.Url.LocalPath
    if ($path -eq "/") { $path = "/index.html" }

    $filePath = Join-Path $root $path.TrimStart("/")

    if (Test-Path $filePath) {
        $content = [System.IO.File]::ReadAllBytes($filePath)

        # Set content type
        $ext = [System.IO.Path]::GetExtension($filePath)
        $contentType = switch ($ext) {
            ".html" { "text/html" }
            ".css" { "text/css" }
            ".js" { "application/javascript" }
            default { "application/octet-stream" }
        }

        $response.ContentType = $contentType
        $response.ContentLength64 = $content.Length
        $response.OutputStream.Write($content, 0, $content.Length)
    } else {
        $response.StatusCode = 404
    }

    $response.Close()
}

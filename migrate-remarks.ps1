$baseUrl = 'https://hettdkznujeabmckkvni.supabase.co'
$key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldHRka3pudWplYWJtY2trdm5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzMyNjksImV4cCI6MjA5MTE0OTI2OX0.byriabl_RZcELa6gnla6j5LZT7r6DFxkm2fW6e9QycQ'

$headers = @{
    'apikey'        = $key
    'Authorization' = "Bearer $key"
    'Content-Type'  = 'application/json'
    'Prefer'        = 'return=minimal'
}

# ---------------------------------------------------------------
# Verification Test: PATCH a real PO with the new columns
# After running the SQL migration in Supabase, run this to verify.
# ---------------------------------------------------------------

Write-Host ""
Write-Host "=== GMA Dashboard - Remarks Migration Verification ===" -ForegroundColor Cyan
Write-Host ""

# Step 1 - Get first PO id from Supabase
Write-Host "[1] Fetching first PO from Supabase..." -ForegroundColor Yellow
try {
    $pos = Invoke-RestMethod -Uri "$baseUrl/rest/v1/purchase_orders?select=id&limit=1" -Headers $headers -Method Get
    if ($pos.Count -gt 0) {
        $testId = $pos[0].id
        Write-Host "    Found PO: $testId" -ForegroundColor Green
    } else {
        Write-Host "    No POs found in table." -ForegroundColor Red
        exit
    }
} catch {
    Write-Host "    ERROR fetching POs: $_" -ForegroundColor Red
    exit
}

# Step 2 - Try PATCH with dometic_remarks + zunpower_remarks
Write-Host ""
Write-Host "[2] Testing PATCH with 'dometic_remarks' and 'zunpower_remarks' columns..." -ForegroundColor Yellow
$patchHeaders = $headers.Clone()
$patchHeaders['Prefer'] = 'return=minimal'
$testBody = @{ dometic_remarks = ''; zunpower_remarks = '' } | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "$baseUrl/rest/v1/purchase_orders?id=eq.$testId" -Headers $patchHeaders -Method Patch -Body $testBody | Out-Null
    Write-Host "    SUCCESS - Columns exist and are writable!" -ForegroundColor Green
    Write-Host "    The dashboard will now persist dedicated remarks and prevent simultaneous overwrite bugs." -ForegroundColor Green
} catch {
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $body = $reader.ReadToEnd()
    Write-Host "    FAILED - Columns not found." -ForegroundColor Red
    Write-Host "    Error: $body" -ForegroundColor Red
    Write-Host ""
    Write-Host "    ACTION REQUIRED: Run this SQL in your Supabase SQL Editor:" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "    ALTER TABLE purchase_orders" -ForegroundColor White
    Write-Host "      ADD COLUMN IF NOT EXISTS dometic_remarks  text DEFAULT ''," -ForegroundColor White
    Write-Host "      ADD COLUMN IF NOT EXISTS zunpower_remarks text DEFAULT '';" -ForegroundColor White
    Write-Host ""
    Write-Host "    Go to: https://supabase.com/dashboard/project/hettdkznujeabmckkvni/sql/new" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan

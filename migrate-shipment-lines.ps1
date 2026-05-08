# migrate-shipment-lines.ps1
# Run this ONCE to add the shipment_lines column to the purchase_orders table in Supabase.
# After running this, the GMA Dashboard will be able to save and retrieve split shipment lines.

$SUPABASE_URL = "https://hettdkznujeabmckkvni.supabase.co"
$SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldHRka3pudWplYWJtY2trdm5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzMyNjksImV4cCI6MjA5MTE0OTI2OX0.byriabl_RZcELa6gnla6j5LZT7r6DFxkm2fW6e9QycQ"

# NOTE: The anon key cannot run DDL (ALTER TABLE). You need the service_role key or
# run the SQL below directly in the Supabase SQL Editor at:
# https://supabase.com/dashboard/project/hettdkznujeabmckkvni/sql/new

$SQL = @"
-- Run this SQL in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/hettdkznujeabmckkvni/sql/new

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS shipment_lines jsonb DEFAULT '[]'::jsonb;

-- Verify the column was added:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'purchase_orders'
  AND column_name = 'shipment_lines';
"@

Write-Host "=====================================================`n" -ForegroundColor Cyan
Write-Host " GMA Dashboard — shipment_lines Migration`n" -ForegroundColor White
Write-Host "=====================================================`n" -ForegroundColor Cyan
Write-Host "The 'shipment_lines' JSONB column needs to be added to your Supabase table." -ForegroundColor Yellow
Write-Host "The anon API key does not have DDL permissions, so you must run the SQL manually.`n" -ForegroundColor Yellow
Write-Host "STEP 1: Open the Supabase SQL Editor:" -ForegroundColor Green
Write-Host "  https://supabase.com/dashboard/project/hettdkznujeabmckkvni/sql/new`n" -ForegroundColor Cyan
Write-Host "STEP 2: Paste and run this SQL:`n" -ForegroundColor Green
Write-Host $SQL -ForegroundColor White
Write-Host "`nSTEP 3: After running the SQL, reload the GMA Dashboard." -ForegroundColor Green
Write-Host "        Split shipment saves will now work correctly.`n" -ForegroundColor Green

# Open the Supabase SQL Editor in the default browser
$openBrowser = Read-Host "Open Supabase SQL Editor in browser now? (y/n)"
if ($openBrowser -eq 'y' -or $openBrowser -eq 'Y') {
    Start-Process "https://supabase.com/dashboard/project/hettdkznujeabmckkvni/sql/new"
    Write-Host "`nBrowser opened. Paste the SQL above and click Run." -ForegroundColor Green
}

Write-Host "`nDone. Run this script again after adding the column to verify." -ForegroundColor Cyan

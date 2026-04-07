@echo off
setlocal
echo ----------------------------------------------------
echo GMA LIVE DASHBOARD — AUTOMATIC DEPLOYMENT
echo ----------------------------------------------------

:: Get current date and time via PowerShell (e.g., "Apr 7, 10:25 AM")
for /f "delims=" %%i in ('powershell -Command "Get-Date -Format 'MMM d, h:mm tt'"') do set "NOW=%%i"

echo [1/2] Updating deployment timestamp to: %NOW%
:: Use PowerShell to find and replace the content inside the deployTime span in index.html
powershell -Command "(Get-Content index.html) -replace '(<span id=\"deployTime\">)[^<]*(</span>)', ('${1}' + '%NOW%' + '${2}') | Set-Content index.html"

echo [2/2] Deploying to Vercel...
echo.
npx vercel --prod

echo.
echo ----------------------------------------------------
echo DEPLOYMENT SUCCESSFUL!
echo Link: Your Vercel Dashboard URL
echo ----------------------------------------------------
pause

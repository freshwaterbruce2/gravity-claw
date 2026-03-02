param (
    [string]$CommitMessage = "Self-improvement: Applied local optimizations and fixes"
)

Write-Host "[*] Gravity Claw Self-Improvement Loop Initiated" -ForegroundColor Cyan

# 1. Run typecheck to ensure changes are valid before applying
Write-Host "[*] Verifying changes with typecheck..." -ForegroundColor Yellow
pnpm run typecheck
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Typecheck failed. Aborting self-improvement. Please fix the errors." -ForegroundColor Red
    exit 1
}

# 2. Add changes to the local Git repository
Write-Host "[*] Staging changes..." -ForegroundColor Yellow
git add .

# 3. Check if there are any changes to commit
$gitStatus = git status --porcelain
if ([string]::IsNullOrWhiteSpace($gitStatus)) {
    Write-Host "[+] No changes detected. Gravity Claw is already optimized." -ForegroundColor Green
    exit 0
}

# 4. Commit the changes
Write-Host "[*] Committing improvements locally..." -ForegroundColor Yellow
git commit -m $CommitMessage

# 5. Build to ensure production readiness (optional, mostly for verification)
Write-Host "[*] Building project..." -ForegroundColor Yellow
pnpm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Build failed after commit. Check logs." -ForegroundColor Red
    exit 1
}

Write-Host "[+] Self-improvement successfully applied and recorded locally!" -ForegroundColor Green

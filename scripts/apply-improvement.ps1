param (
    [string]$CommitMessage = "Self-improvement: Applied local optimizations and fixes"
)

Write-Host "[*] Gravity Claw Self-Improvement Loop Initiated" -ForegroundColor Cyan

# Ensure type safety before staging to prevent committing broken code that would break downstream consumers
Write-Host "[*] Verifying changes with typecheck..." -ForegroundColor Yellow
pnpm run typecheck && pnpm run typecheck:server
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Typecheck failed. Aborting self-improvement. Please fix the errors." -ForegroundColor Red
    exit 1
}

# Stage all tracked modifications so the commit captures a complete, atomic improvement set
Write-Host "[*] Staging changes..." -ForegroundColor Yellow
git add -u

# Early exit if nothing changed after typecheck (prevents empty commits)
$gitStatus = git status --porcelain
if ([string]::IsNullOrWhiteSpace($gitStatus)) {
    Write-Host "[+] No changes detected. Gravity Claw is already optimized." -ForegroundColor Green
    exit 0
}

# Run the test suite to guarantee regressions are not introduced by the local optimizations
Write-Host "[*] Running tests..." -ForegroundColor Yellow
pnpm run test
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Tests failed. Aborting self-improvement. Please fix the errors." -ForegroundColor Red
    exit 1
}

# Persist the verified improvements with a descriptive commit message
Write-Host "[*] Committing improvements locally..." -ForegroundColor Yellow
git commit -m $CommitMessage

# Final production build verification (post-commit) to catch any packaging or bundling issues early
Write-Host "[*] Building project..." -ForegroundColor Yellow
pnpm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Build failed after commit. Check logs." -ForegroundColor Red
    exit 1
}

Write-Host "[+] Self-improvement successfully applied and recorded locally!" -ForegroundColor Green

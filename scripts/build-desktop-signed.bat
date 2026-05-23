@echo off
REM Build the Tauri desktop application with update signing.
REM NOTE: If signing hangs on your machine, use build-desktop.bat (unsigned)
REM       and sign manually with minisign or via GitHub Actions.
set VCVARSALL="C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
if not exist %VCVARSALL% (
    echo ERROR: BuildTools vcvarsall.bat not found at %VCVARSALL%
    exit /b 1
)

call %VCVARSALL% x64
if errorlevel 1 exit /b %errorlevel%

cd /d "%~dp0\.."

REM Set TAURI_SIGNING_PRIVATE_KEY in the environment, or point
REM TAURI_SIGNING_PRIVATE_KEY_PATH at an untracked private key file.
if "%TAURI_SIGNING_PRIVATE_KEY%"=="" (
    if "%TAURI_SIGNING_PRIVATE_KEY_PATH%"=="" (
        echo ERROR: Set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH before signing.
        exit /b 1
    )

    if not exist "%TAURI_SIGNING_PRIVATE_KEY_PATH%" (
        echo ERROR: Signing key file not found at "%TAURI_SIGNING_PRIVATE_KEY_PATH%"
        exit /b 1
    )

    set /p TAURI_SIGNING_PRIVATE_KEY=<"%TAURI_SIGNING_PRIVATE_KEY_PATH%"
)

call pnpm run build
if errorlevel 1 exit /b %errorlevel%

call pnpm tauri build --ignore-version-mismatches
if errorlevel 1 exit /b %errorlevel%

echo.
echo Signed desktop build completed.

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

REM Set the signing private key (content, not path)
set /p TAURI_SIGNING_PRIVATE_KEY=<"src-tauri\updater.key"

pnpm run build
if errorlevel 1 exit /b %errorlevel%

pnpm run build:server
if errorlevel 1 exit /b %errorlevel%

pnpm tauri build
if errorlevel 1 exit /b %errorlevel%

echo.
echo Signed desktop build completed.

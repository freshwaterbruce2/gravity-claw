@echo off
REM Build the Tauri desktop application inside the VS BuildTools environment.
REM Workaround for missing MSVC headers in the main VS Community installation.
set VCVARSALL="C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
if not exist %VCVARSALL% (
    echo ERROR: BuildTools vcvarsall.bat not found at %VCVARSALL%
    exit /b 1
)

call %VCVARSALL% x64
if errorlevel 1 exit /b %errorlevel%

cd /d "%~dp0\.."

REM Build web + server bundles
call pnpm run build
if errorlevel 1 exit /b %errorlevel%

REM Build Tauri desktop app (unsigned — fast)
call pnpm tauri build --no-sign --ignore-version-mismatches
if errorlevel 1 exit /b %errorlevel%

echo.
echo Desktop build completed successfully.
echo Installers are in target\gravity-claw\release\bundle\

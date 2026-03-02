@echo off
REM Build script for agent-sandbox (Windows CMD)
REM Usage: build-windows.bat [--check]

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%AgentSandbox"
set "OUTPUT_DIR=%SCRIPT_DIR%dist"

set "IMAGE=mcr.microsoft.com/dotnet/sdk:8.0"
set "NUGET_CACHE=agent-sandbox-nuget-cache"

if "%~1"=="-h" goto usage
if "%~1"=="--help" goto usage
if "%~1"=="?" goto usage

REM Check for Docker
docker --version >nul 2>&1
if errorlevel 1 (
    echo Error: Docker is required. Make sure Docker Desktop is running.
    exit /b 1
)

if "%~1"=="--check" (
    echo === Compile check (via Docker) ===
    echo.
    echo [build] Using %IMAGE%
    echo [build] Source: %PROJECT_DIR%
    echo.
    
    docker volume create %NUGET_CACHE% >nul 2>&1
    
    docker run --rm ^
        -v "%PROJECT_DIR%":/src:ro ^
        -v "%NUGET_CACHE%":/root/.nuget ^
        "%IMAGE%" ^
        cmd /c "dotnet build /src /p:Configurationologo /warn=Release /naserror 2>&1"
    
    if errorlevel 1 (
        echo.
        echo [build] Compile failed.
        exit /b 1
    )
    
    echo.
    echo [build] Compile check passed.
    exit /b 0
)

echo === Building agent-sandbox (via Docker) ===
echo.
echo [build] Using %IMAGE%
echo [build] Source: %PROJECT_DIR%
echo [build] Output: %OUTPUT_DIR%
echo.

REM Create output directory
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

REM Create persistent NuGet cache volume
docker volume create %NUGET_CACHE% >nul 2>&1

REM Build and publish
docker run --rm ^
    -v "%PROJECT_DIR%":/src ^
    -v "%OUTPUT_DIR%":/output ^
    -v "%NUGET_CACHE%":/root/.nuget ^
    "%IMAGE%" ^
    cmd /c "dotnet publish /src -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true /output /nologo"

if errorlevel 1 (
    echo.
    echo [build] Build failed.
    exit /b 1
)

REM Find the exe
for /f "delims=" %%i in ('dir /b /o-n "%OUTPUT_DIR%\*.exe" 2^>nul') do set "EXE_NAME=%%i"

echo.
echo [build] Build complete: %OUTPUT_DIR%\%EXE_NAME%
echo.
echo Run with: %OUTPUT_DIR%\%EXE_NAME%
exit /b 0

:usage
echo Usage: %~nx0 [OPTIONS]
echo.
echo   (no args)   Build agent-sandbox.exe (cross-compile via Docker)
echo   --check     Compile-check only (fast, no exe output)
echo   -h, --help  Show this help
echo.
echo Requires Docker. The .NET SDK runs inside a container so no
echo local .NET installation is needed.
exit /b 0

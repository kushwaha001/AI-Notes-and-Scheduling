@echo off
setlocal
pushd "%~dp0.."

echo ==================================================================
echo   AI Notes and Scheduling  -  STEP 1: FETCH (run on INTERNET PC)
echo ==================================================================
echo.
echo This downloads all Python wheels and builds the React frontend so
echo the offline PC needs no internet. Use a Windows x64 PC with Python
echo 3.11 (same as the offline PC).
echo.

if not exist "offline\wheels" mkdir "offline\wheels"

echo [1/3] Downloading backend Python wheels...
python -m pip download -r backend\requirements.txt -d offline\wheels
if errorlevel 1 goto err

echo.
echo [2/3] Downloading pip/setuptools/wheel (bootstrap)...
python -m pip download pip setuptools wheel -d offline\wheels
if errorlevel 1 goto err

echo.
echo [3/3] Building the React frontend (front-end\dist)...
pushd front-end
call npm install
if errorlevel 1 goto err
REM Offline serves the static UI directly (no proxy), so point it at the
REM backend with an absolute URL.
set "VITE_API_BASE=http://localhost:9000"
call npm run build
if errorlevel 1 goto err
set "VITE_API_BASE="
popd

echo.
echo ==================================================================
echo   DONE. Now prepare the transfer bundle:
echo.
echo   1. Download these installers into  offline\installers\  :
echo        - Python 3.11 (Windows x64)   https://www.python.org/downloads/
echo        - PostgreSQL  (Windows x64)   https://www.postgresql.org/download/windows/
echo.
echo   2. Copy the ENTIRE project folder (including offline\wheels and
echo      front-end\dist) to the OFFLINE PC via USB.
echo.
echo   NOTE: if the offline PC uses a different Python version, re-run with:
echo     python -m pip download -r backend\requirements.txt -d offline\wheels ^
echo       --only-binary=:all: --platform win_amd64 --python-version 311 ^
echo       --implementation cp --abi cp311
echo ==================================================================
popd
endlocal
exit /b 0

:err
echo.
echo ERROR during fetch. Read the messages above.
popd
endlocal
exit /b 1

@echo off
setlocal
pushd "%~dp0.."

echo ==================================================================
echo   AI Notes and Scheduling  -  STEP 2: INSTALL (run on OFFLINE PC)
echo ==================================================================
echo.
echo Prerequisites already installed on this PC:
echo   - Python 3.11 (Windows x64)   from offline\installers\
echo   - PostgreSQL  (Windows x64)   from offline\installers\
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python is not on PATH. Install Python 3.11 first
  echo        (check "Add python.exe to PATH" in the installer^).
  goto err
)

echo [1/2] Creating backend virtual environment...
pushd backend
python -m venv venv
call venv\Scripts\activate.bat

echo [2/2] Installing backend from local wheels (no internet)...
python -m pip install --no-index --find-links ..\offline\wheels -r requirements.txt
if errorlevel 1 goto err
popd

echo.
echo ==================================================================
echo   BACKEND INSTALLED.
echo.
echo   Before running, make sure:
echo     1. PostgreSQL service is running.
echo     2. backend\.env has DB_PASSWORD set to your PostgreSQL password.
echo        (The database + tables are created automatically on first run.)
echo.
echo   Then start everything with:   offline\3-run.bat
echo ==================================================================
popd
endlocal
exit /b 0

:err
echo.
echo ERROR during install. Read the messages above.
popd
endlocal
exit /b 1

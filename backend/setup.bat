@echo off
:: AI Notes Scheduler — Windows 10 Pro + Python 3.11 + CUDA 12.8 Setup
setlocal

echo.
echo ============================================================
echo  AI Notes Scheduler — Setup
echo ============================================================

:: 1. Check Python 3.11
python --version 2>nul | findstr "3.11" >nul
if errorlevel 1 (
    echo [ERROR] Python 3.11 not found. Install from python.org
    pause & exit /b 1
)
echo [OK] Python 3.11 found

:: 2. Create virtual environment
if not exist .venv (
    echo [INFO] Creating virtual environment...
    python -m venv .venv
)
echo [OK] Virtual environment ready

:: 3. Activate venv
call .venv\Scripts\activate.bat

:: 4. Upgrade pip
python -m pip install --upgrade pip --quiet

:: 5. Install core requirements
echo [INFO] Installing core packages...
pip install -r requirements.txt --quiet
echo [OK] Core packages installed

:: 6. Install GPU packages (PyTorch CUDA 12.8)
echo [INFO] Installing PyTorch + CUDA 12.8...
echo        (If offline, place wheels in .\wheels\ first)
if exist wheels\ (
    pip install --no-index --find-links=wheels -r requirements-gpu.txt
) else (
    pip install -r requirements-gpu.txt --index-url https://download.pytorch.org/whl/cu128
)
echo [OK] GPU packages installed

:: 7. Copy .env if missing
if not exist .env (
    copy .env.example .env
    echo [INFO] .env created from template. Fill in your passwords.
)

echo.
echo ============================================================
echo  EXTERNAL SERVICES — install separately:
echo  1. Ollama      : https://ollama.com/download
echo                   then run: ollama pull mistral
echo  2. Qdrant      : https://github.com/qdrant/qdrant/releases
echo                   run qdrant.exe (port 6333)
echo  3. Redis       : use Memurai (https://www.memurai.com)
echo                   or WSL2 + Redis
echo  4. Tesseract   : https://github.com/UB-Mannheim/tesseract/wiki
echo                   add to PATH after install
echo ============================================================
echo.
echo  To start the server:
echo    .venv\Scripts\activate
echo    uvicorn api.main:app --reload --port 9000
echo.
pause

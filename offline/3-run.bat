@echo off
setlocal
pushd "%~dp0.."

echo Starting AI Notes and Scheduling...
echo   Backend  -> http://localhost:9000   (API + auto DB setup)
echo   Frontend -> http://localhost:5173   (open this in your browser)
echo.

REM Backend (FastAPI) in its venv. The DB and tables are created automatically.
start "AI Notes - Backend" cmd /k "cd /d "%CD%\backend" && call venv\Scripts\activate.bat && uvicorn api.main:app --host 0.0.0.0 --port 9000"

REM Frontend served by stdlib Python (no Node needed).
start "AI Notes - Frontend" cmd /k "python "%CD%\offline\serve_frontend.py""

echo Two windows opened. Close them to stop the app.
echo Open http://localhost:5173 in your browser.
popd
endlocal

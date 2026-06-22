@echo off
:: Run this on an INTERNET-connected machine to download all wheels.
:: Copy the resulting .\wheels\ folder to the offline PC, then run setup.bat.

echo Downloading core wheels...
pip download -r requirements.txt -d wheels

echo Downloading PyTorch CUDA 12.8 wheels...
pip download -r requirements-gpu.txt -d wheels --index-url https://download.pytorch.org/whl/cu128

echo Done. Copy the wheels\ folder to the offline machine and run setup.bat.
pause

@echo off
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
  start "" http://127.0.0.1:8765
  py server.py
  goto :eof
)
where python >nul 2>&1
if %errorlevel%==0 (
  start "" http://127.0.0.1:8765
  python server.py
  goto :eof
)
echo Python nao encontrado.
echo Instale Python 3 e execute novamente.
pause

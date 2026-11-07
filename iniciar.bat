@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias por unica vez...
  call npm install
)
call npm run dev

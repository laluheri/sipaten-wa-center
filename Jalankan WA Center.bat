@echo off
setlocal
title WA Center Server
cd /d "%~dp0"

echo ==================================================
echo                 WA CENTER SERVER
echo ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js belum terpasang atau tidak tersedia di PATH.
  echo Unduh dan pasang Node.js LTS, lalu jalankan file ini kembali.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo WA Center sudah berjalan di http://localhost:3100
  start "" "http://localhost:3100"
  echo.
  pause
  exit /b 0
)

if not exist "node_modules\" (
  echo Dependensi belum tersedia. Menjalankan npm install...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] Instalasi dependensi gagal.
    pause
    exit /b 1
  )
)

echo Menjalankan WA Center di http://localhost:3100
echo Jangan tutup jendela ini selama WA Center digunakan.
echo Tekan Ctrl+C untuk menghentikan server.
echo.

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:3100'"
call npm run dev

echo.
echo WA Center telah berhenti.
pause

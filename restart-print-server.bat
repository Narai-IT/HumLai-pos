@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title HumLai POS - รีสตาร์ต Print Server
color 0A

echo =========================================
echo    รีสตาร์ต PRINT SERVER (ใช้หลังแตกไฟล์เวอร์ชันใหม่ทับ)
echo =========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ผิดพลาด] ไม่พบ Node.js ในเครื่องนี้
  echo ติดตั้งจาก https://nodejs.org ก่อน แล้วรันไฟล์นี้อีกครั้ง
  echo.
  pause
  exit /b 1
)

rem ส่วนประกอบเปลี่ยน (หรือยังไม่เคยลง) — ลงให้ก่อนเปิดตัวใหม่
echo [1/3] ตรวจส่วนประกอบ (node_modules)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo [ผิดพลาด] ติดตั้งส่วนประกอบไม่สำเร็จ — ตรวจสอบว่าเครื่องต่ออินเทอร์เน็ตอยู่ แล้วลองใหม่
  echo Print Server ตัวเดิมยังทำงานอยู่ ยังไม่ได้รีสตาร์ต
  echo.
  pause
  exit /b 1
)
echo.

rem ปิดเฉพาะโปรแกรมที่เปิดพอร์ต 3001 (Print Server) — ไม่ไปปิด node ตัวอื่นในเครื่อง เช่น API Server
echo [2/3] ปิด Print Server ตัวเดิม...
set "KILLED="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3001 .*LISTENING"') do (
  taskkill /f /pid %%p >nul 2>&1
  set "KILLED=1"
)
if defined KILLED (echo    ปิดแล้ว) else (echo    ไม่มี Print Server เปิดอยู่)
echo.

rem ถ้าตั้งเปิดอัตโนมัติไว้ (install-autostart.bat) ตัวเฝ้าจะเปิดตัวใหม่ให้เองภายใน 5 วินาที
echo [3/3] รอ Print Server ตัวใหม่เปิด...
for /l %%i in (1,1,12) do (
  timeout /t 1 /nobreak >nul
  curl -s -m 2 http://127.0.0.1:3001/health >nul 2>&1 && goto :up
)

echo    ไม่ได้ตั้งเปิดอัตโนมัติไว้ — เปิดด้วย start-printer.bat ในหน้าต่างใหม่
start "" "%~dp0start-printer.bat"
for /l %%i in (1,1,20) do (
  timeout /t 1 /nobreak >nul
  curl -s -m 2 http://127.0.0.1:3001/health >nul 2>&1 && goto :up
)
echo.
echo [ผิดพลาด] Print Server ยังไม่ขึ้น — ดูข้อความในหน้าต่าง start-printer.bat หรือรัน check-printer.bat
echo.
pause
exit /b 1

:up
echo.
echo    Print Server ทำงานแล้ว:
curl -s -m 2 http://127.0.0.1:3001/health
echo.
echo.
echo    กลับไปหน้า "ตั้งค่าเครื่องพิมพ์" แล้วกด "ตรวจสอบอีกครั้ง" — เลขเวอร์ชันควรเป็นตัวใหม่
echo.
pause

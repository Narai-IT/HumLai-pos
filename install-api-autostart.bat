@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title HumLai POS - ตั้งค่าเปิด API Server อัตโนมัติ
color 0B

echo =========================================
echo    ตั้งค่าให้ API SERVER เปิดเองอัตโนมัติ
echo =========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ผิดพลาด] ไม่พบ Node.js ในเครื่องนี้
  echo ติดตั้งจาก https://nodejs.org ก่อน (เลือกเวอร์ชัน LTS) แล้วรันไฟล์นี้อีกครั้ง
  echo.
  pause
  exit /b 1
)

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
if errorlevel 1 (
  echo [ผิดพลาด] Node.js ในเครื่องเก่าเกินไป ต้องเป็นเวอร์ชัน 20 ขึ้นไป
  node -v
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0.env" (
  echo [ผิดพลาด] ไม่พบไฟล์ .env — ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล
  echo คัดลอก .env.example เป็น .env แล้วแก้ค่า SQL_* ก่อน แล้วรันไฟล์นี้อีกครั้ง
  echo.
  pause
  exit /b 1
)

rem ยังไม่ได้ลง dependency — API Server จะเปิดไม่ขึ้นแบบเงียบ ๆ เพราะ daemon ซ่อนหน้าต่างไว้
if exist "%~dp0node_modules\mssql" goto deps_ok
echo ยังไม่ได้ติดตั้งส่วนประกอบที่ต้องใช้ กำลังติดตั้งให้ (ครั้งแรกอาจใช้เวลา 1-3 นาที)...
echo.
call npm install
if errorlevel 1 (
  echo.
  echo [ผิดพลาด] ติดตั้งส่วนประกอบไม่สำเร็จ — ตรวจสอบว่าเครื่องต่ออินเทอร์เน็ตอยู่ แล้วลองใหม่
  echo.
  pause
  exit /b 1
)
echo    ติดตั้งเรียบร้อย
echo.
:deps_ok

if not exist "%~dp0api-server-daemon.vbs" (
  echo [ผิดพลาด] ไม่พบไฟล์ api-server-daemon.vbs
  echo ต้องวางไฟล์นี้ไว้ในโฟลเดอร์โปรเจกต์เดียวกับ sql-api-server.js
  echo.
  pause
  exit /b 1
)

set "SCRIPTDIR=%~dp0"
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\HumLai API Server.lnk"

echo กำลังสร้างทางลัดในโฟลเดอร์ Startup...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$dir=$env:SCRIPTDIR; $lnk=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\HumLai API Server.lnk'; $s=(New-Object -ComObject WScript.Shell).CreateShortcut($lnk); $s.TargetPath='wscript.exe'; $s.Arguments=[char]34+(Join-Path $dir 'api-server-daemon.vbs')+[char]34; $s.WorkingDirectory=$dir; $s.Description='HumLai POS API Server'; $s.Save()"

if not exist "%LNK%" (
  echo [ผิดพลาด] สร้างทางลัดไม่สำเร็จ
  echo.
  pause
  exit /b 1
)
echo    สร้างเรียบร้อย
echo.

echo กำลังเปิด API Server ตอนนี้เลย...
start "" wscript.exe "%~dp0api-server-daemon.vbs"

echo.
echo =========================================
echo    เสร็จสิ้น
echo =========================================
echo.
echo    - API Server ทำงานอยู่แล้วตอนนี้ (ไม่มีหน้าต่างแสดง)
echo    - เปิดเครื่องครั้งต่อไปจะเริ่มทำงานเองอัตโนมัติ
echo    - ถ้าเซิร์ฟเวอร์ดับเอง จะถูกเปิดใหม่ให้ภายใน 5 วินาที
echo    - บันทึกการทำงานอยู่ที่ logs\api-server.log
echo.
echo    ทดสอบ: เปิด http://localhost:8080/api/pos?action=ping ในเบราว์เซอร์
echo    ต้องได้ "db": "connected" พร้อมจำนวนแถวในตาราง Menu
echo.
echo    ขั้นต่อไปคือเปิดออกอินเทอร์เน็ตด้วย Cloudflare Tunnel
echo    ดูขั้นตอนที่ docs\CLOUDFLARE-TUNNEL.md
echo.
echo    ถ้าต้องการยกเลิก ให้รัน uninstall-api-autostart.bat
echo.
pause

@echo off
chcp 65001 >nul
setlocal
title HumLai POS - ยกเลิกการเปิด API Server อัตโนมัติ
color 0E

echo =========================================
echo    ยกเลิกการเปิด API SERVER อัตโนมัติ
echo =========================================
echo.

set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\HumLai API Server.lnk"

if exist "%LNK%" (
  del "%LNK%"
  echo    ลบทางลัดใน Startup แล้ว
) else (
  echo    ไม่พบทางลัดใน Startup อยู่แล้ว
)

echo กำลังหยุด API Server ที่ทำงานอยู่...
rem ปิดเฉพาะตัวที่รัน API Server เท่านั้น — Print Server ในเครื่องเดียวกันต้องทำงานต่อได้
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='wscript.exe' OR Name='node.exe'\" | Where-Object { $_.CommandLine -match 'api-server-daemon\.vbs|sql-api-server\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo.
echo    เสร็จสิ้น - ต่อไปนี้ต้องเปิด start-api.bat เองทุกครั้ง
echo    (Print Server ยังทำงานตามปกติ ไม่ได้ถูกปิดไปด้วย)
echo.
pause

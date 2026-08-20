' HumLai POS - Print Server daemon
' Starts server.js with no visible window and keeps it alive.
' If the server stops (crash / printer hang) it is restarted within 5 seconds.
Option Explicit

Const HEALTH_URL = "http://127.0.0.1:3001/health"
Const MAX_LOG_BYTES = 2097152   ' 2 MB

Dim shell, fso, baseDir, logDir, logFile, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
logDir = baseDir & "\logs"
If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)
logFile = logDir & "\print-server.log"

shell.CurrentDirectory = baseDir
cmd = "cmd /c node """ & baseDir & "\server.js"" >> """ & logFile & """ 2>&1"

' True when a Print Server already answers on port 3001
Function ServerIsUp()
  Dim http
  ServerIsUp = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.XMLHTTP")
  http.Open "GET", HEALTH_URL, False
  http.Send
  If Err.Number = 0 Then
    If http.Status = 200 Then ServerIsUp = True
  End If
  Err.Clear
  On Error GoTo 0
End Function

' Keep the log from growing without bound
Sub TrimLog()
  On Error Resume Next
  If fso.FileExists(logFile) Then
    If fso.GetFile(logFile).Size > MAX_LOG_BYTES Then fso.DeleteFile logFile, True
  End If
  On Error GoTo 0
End Sub

Do
  If Not ServerIsUp() Then
    TrimLog
    ' 0 = hidden window, True = wait until node exits
    shell.Run cmd, 0, True
  End If
  WScript.Sleep 5000
Loop

@echo off
setlocal
cd /d "%~dp0"
if not exist "Update-MEL-Computer-Companion.ps1" (
  echo ERREUR : le script de mise a jour manque dans ce dossier.
  pause
  exit /b 1
)
if not exist "MEL-Computer-Companion.ps1" (
  echo ERREUR : le nouveau moteur manque dans ce dossier.
  pause
  exit /b 1
)
echo MEL Companion - mise a jour locale de ce PC
echo L'identite et la configuration existantes seront conservees.
echo Une confirmation explicite sera demandee avant tout changement.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update-MEL-Computer-Companion.ps1"
set "exitCode=%errorlevel%"
if not "%exitCode%"=="0" echo La mise a jour a echoue. Code : %exitCode%.
pause
exit /b %exitCode%

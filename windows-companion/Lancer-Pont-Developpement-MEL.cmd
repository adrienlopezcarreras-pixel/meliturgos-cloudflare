@echo off
setlocal DisableDelayedExpansion
title MEL - Pont de developpement (session locale)
set "REPO=%~dp0.."
for %%I in ("%REPO%") do set "REPO=%%~fI"
echo.
echo MEL - PONT DE DEVELOPPEMENT
echo [GPT] Lancement local avec confirmation du proprietaire.
echo.
if not exist "%REPO%\.git" (
  echo ERREUR: Depot Git introuvable. Cloner le depot avant de lancer ce fichier.
  echo Dossier attendu: "%REPO%"
  pause
  exit /b 2
)
if not exist "%REPO%\scripts\mel-dev-bridge.mjs" (
  echo ERREUR: scripts\mel-dev-bridge.mjs est absent.
  pause
  exit /b 3
)
where node.exe >nul 2>nul
if errorlevel 1 (
  echo ERREUR: Node.js n'est pas installe ou n'est pas dans le PATH.
  echo Installer Node.js 22 ou plus recent depuis https://nodejs.org/
  pause
  exit /b 4
)
node -e "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)"
if errorlevel 1 (
  echo ERREUR: Node.js 22 ou plus recent est requis.
  pause
  exit /b 5
)
if not defined MEL_DEV_BRIDGE_TOKEN if not exist "%REPO%\.dev.vars" if not exist "%REPO%\.env.local" if not exist "%REPO%\.env" (
  echo ERREUR: Jeton absent. Configurer MEL_DEV_BRIDGE_TOKEN dans le fichier local .dev.vars
  echo Ne jamais coller le jeton dans le chat ou sur GitHub.
  pause
  exit /b 6
)
echo Ce programme peut recevoir des taches depuis MEL, modifier ce depot local
echo et lancer des tests. Il ne s'execute PAS automatiquement au demarrage.
echo Fermer cette fenetre ou appuyer sur Ctrl+C pour arreter la session.
echo.
set "CONFIRMATION="
set /p "CONFIRMATION=Tapez OUI pour lancer cette session MEL : "
if /I not "%CONFIRMATION%"=="OUI" (
  echo Operation annulee.
  exit /b 0
)
pushd "%REPO%"
if errorlevel 1 (
  echo ERREUR: Impossible d'ouvrir le depot.
  pause
  exit /b 7
)
echo.
echo Pont actif dans cette fenetre. Pour l'arreter : Ctrl+C.
node scripts\mel-dev-bridge.mjs
set "EXITCODE=%ERRORLEVEL%"
popd
echo.
echo Le pont s'est arrete. Code : %EXITCODE%
pause
exit /b %EXITCODE%

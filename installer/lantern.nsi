Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
Name "Lantern Direct"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\LanternDirect"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "0.5.0.0"
VIAddVersionKey /LANG=1036 "ProductName" "Lantern Direct"
VIAddVersionKey /LANG=1036 "FileDescription" "Installation de Lantern Direct pour Windows x64"
VIAddVersionKey /LANG=1036 "FileVersion" "0.5.0"
VIAddVersionKey /LANG=1036 "LegalCopyright" "Lantern Direct"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\LanternDirect.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Ouvrir Lantern Direct"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"
!macro CheckRunning
  ReadEnvStr $0 USERNAME
  System::Call 'kernel32::OpenMutexW(i 0x100000, i 0, w "LanternDirect.CurrentUser.$0") p.r1'
  ${If} $1 != 0
    System::Call 'kernel32::CloseHandle(p r1)'
    MessageBox MB_OK|MB_ICONINFORMATION "Quittez Lantern Direct depuis son icône près de l’horloge, puis relancez cette opération. Le pont Maison sera indisponible pendant la mise à jour."
    Abort
  ${EndIf}
!macroend
Function .onInit
  SetRegView 64
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Lantern Direct nécessite Windows 64 bits."
    Abort
  ${EndIf}
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  IntCmp $0 19041 supported unsupported supported
  unsupported:
    MessageBox MB_OK|MB_ICONSTOP "Windows 10 version 2004 ou plus récent est nécessaire."
    Abort
  supported:
  !insertmacro CheckRunning
FunctionEnd
Function un.onInit
  SetRegView 64
  !insertmacro CheckRunning
  ${If} $INSTDIR != "$LOCALAPPDATA\Programs\LanternDirect"
    MessageBox MB_OK|MB_ICONSTOP "Lancez la désinstallation depuis son dossier d’installation d’origine."
    Abort
  ${EndIf}
FunctionEnd
Section "Lantern Direct et pont Maison" Main
  SectionIn RO
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\homekit"
  File /r "${BUNDLE_DIR}\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Lantern Direct"
  CreateShortcut "$SMPROGRAMS\Lantern Direct\Lantern Direct.lnk" "$INSTDIR\LanternDirect.exe"
  CreateShortcut "$SMPROGRAMS\Lantern Direct\Désinstaller.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect" "DisplayName" "Lantern Direct"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect" "DisplayVersion" "0.5.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect" "Publisher" "Lantern Direct"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect" "DisplayIcon" "$INSTDIR\LanternDirect.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect" "URLInfoAbout" "https://github.com/Imdraks/reverse-magic"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect" "EstimatedSize" $0
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LanternDirectHomeKit"
  ${If} $0 != ""
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LanternDirectHomeKit" '"$INSTDIR\LanternDirect.exe" --homekit'
  ${EndIf}
SectionEnd
Section "Raccourci sur le Bureau" Desktop
  SetShellVarContext current
  CreateDirectory "$DESKTOP"
  CreateShortcut "$DESKTOP\Lantern Direct.lnk" "$INSTDIR\LanternDirect.exe"
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\Lantern Direct.lnk"
  Delete "$SMPROGRAMS\Lantern Direct\Lantern Direct.lnk"
  Delete "$SMPROGRAMS\Lantern Direct\Désinstaller.lnk"
  RMDir "$SMPROGRAMS\Lantern Direct"
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LanternDirectHomeKit"
  ${If} $0 == '"$INSTDIR\LanternDirect.exe" --homekit'
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LanternDirectHomeKit"
  ${EndIf}
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect"
  Delete "$INSTDIR\LanternDirect.exe"
  Delete "$INSTDIR\node.exe"
  Delete "$INSTDIR\NODE-LICENSE.txt"
  Delete "$INSTDIR\LIRE-MOI.txt"
  RMDir /r "$INSTDIR\homekit"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  ; Settings, favourites and HomeKit pairings stay in LocalAppData\LanternDirect.
SectionEnd

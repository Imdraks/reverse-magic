Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "StrFunc.nsh"
${StrStr}
!include "x64.nsh"
Name "Lantern Bridge"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\LanternDirect"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "0.11.0.0"
VIAddVersionKey /LANG=1036 "ProductName" "Lantern Bridge"
VIAddVersionKey /LANG=1036 "FileDescription" "Installation de Lantern Bridge pour Windows x64"
VIAddVersionKey /LANG=1036 "FileVersion" "0.11.0"
VIAddVersionKey /LANG=1036 "LegalCopyright" "Lantern Bridge"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\LanternDirect.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Ouvrir Lantern Bridge"
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
    MessageBox MB_OK|MB_ICONINFORMATION "Quittez Lantern Bridge depuis son icône près de l’horloge, puis relancez cette opération. Le pont Maison sera indisponible pendant la mise à jour." /SD IDOK
    SetErrorLevel 5
    Abort
  ${EndIf}
!macroend
Function .onInit
  SetRegView 64
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Lantern Bridge nécessite Windows 64 bits." /SD IDOK
    SetErrorLevel 3
    Abort
  ${EndIf}
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  IntCmp $0 19041 supported unsupported supported
  unsupported:
    MessageBox MB_OK|MB_ICONSTOP "Windows 10 version 2004 ou plus récent est nécessaire." /SD IDOK
    SetErrorLevel 4
    Abort
  supported:
  !insertmacro CheckRunning
FunctionEnd
Function un.onInit
  SetRegView 64
  !insertmacro CheckRunning
  ${If} $INSTDIR != "$LOCALAPPDATA\Programs\LanternDirect"
    MessageBox MB_OK|MB_ICONSTOP "Lancez la désinstallation depuis son dossier d’installation d’origine." /SD IDOK
    SetErrorLevel 6
    Abort
  ${EndIf}
FunctionEnd
Section "Lantern Bridge et pont Maison" Main
  SectionIn RO
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\homekit"
  RMDir /r "$INSTDIR\gateway"
  RMDir /r "$INSTDIR\docs"
  File /r "${BUNDLE_DIR}\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  Delete "$DESKTOP\Lantern Direct.lnk"
  Delete "$SMPROGRAMS\Lantern Direct\Lantern Direct.lnk"
  Delete "$SMPROGRAMS\Lantern Direct\Désinstaller.lnk"
  RMDir "$SMPROGRAMS\Lantern Direct"
  CreateDirectory "$SMPROGRAMS\Lantern Bridge"
  CreateShortcut "$SMPROGRAMS\Lantern Bridge\Lantern Bridge.lnk" "$INSTDIR\LanternDirect.exe"
  CreateShortcut "$SMPROGRAMS\Lantern Bridge\Désinstaller.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect" "DisplayName" "Lantern Bridge"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect" "DisplayVersion" "0.11.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect" "Publisher" "Lantern Bridge"
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
    ${StrStr} $1 $0 "--desktop-homekit"
    ${If} $1 != ""
      WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LanternDirectHomeKit" '"$INSTDIR\LanternDirect.exe" --desktop-homekit'
    ${Else}
      WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LanternDirectHomeKit" '"$INSTDIR\LanternDirect.exe" --homekit'
    ${EndIf}
  ${EndIf}
SectionEnd
Section "Raccourci sur le Bureau" Desktop
  SetShellVarContext current
  CreateDirectory "$DESKTOP"
  CreateShortcut "$DESKTOP\Lantern Bridge.lnk" "$INSTDIR\LanternDirect.exe"
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\Lantern Bridge.lnk"
  Delete "$SMPROGRAMS\Lantern Bridge\Lantern Bridge.lnk"
  Delete "$SMPROGRAMS\Lantern Bridge\Désinstaller.lnk"
  RMDir "$SMPROGRAMS\Lantern Bridge"
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LanternDirectHomeKit"
  ${If} $0 == '"$INSTDIR\LanternDirect.exe" --homekit'
  ${OrIf} $0 == '"$INSTDIR\LanternDirect.exe" --desktop-homekit'
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LanternDirectHomeKit"
  ${EndIf}
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LanternDirect"
  Delete "$INSTDIR\LanternDirect.exe"
  Delete "$INSTDIR\node.exe"
  Delete "$INSTDIR\NODE-LICENSE.txt"
  Delete "$INSTDIR\LIRE-MOI.txt"
  RMDir /r "$INSTDIR\homekit"
  RMDir /r "$INSTDIR\gateway"
  RMDir /r "$INSTDIR\docs"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  ; Settings, favourites and HomeKit pairings stay in LocalAppData\LanternDirect.
SectionEnd

$ErrorActionPreference = 'Stop'
$setup = (Resolve-Path $args[0]).Path
$root = Join-Path $env:LOCALAPPDATA 'Programs\LanternDirect'
$settings = Join-Path $env:LOCALAPPDATA 'LanternDirect'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
New-Item -Path $runKey -Force | Out-Null
New-ItemProperty -Path $runKey -Name LanternDirectHomeKit -Value '"C:\old-portable\LanternDirect.exe" --homekit' -PropertyType String -Force | Out-Null
$installed = Start-Process -FilePath $setup -ArgumentList '/S' -Wait -PassThru
if ($installed.ExitCode -ne 0) { throw "Installer exit code: $($installed.ExitCode)" }
foreach ($file in @('LanternDirect.exe','node.exe','homekit\server.js','Uninstall.exe')) {
    if (-not (Test-Path (Join-Path $root $file))) { throw "Missing installed file: $file" }
}
$nodeVersion = & (Join-Path $root 'node.exe') --version
if ($nodeVersion -ne 'v24.19.0') { throw "Unexpected bundled Node runtime" }
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Lantern Direct\Lantern Direct.lnk'
if (-not (Test-Path $shortcut)) { throw 'Missing Start menu shortcut' }
$runValue = (Get-ItemProperty -Path $runKey -Name LanternDirectHomeKit).LanternDirectHomeKit
if ($runValue -ne ('"' + (Join-Path $root 'LanternDirect.exe') + '" --homekit')) { throw 'Autostart path was not migrated' }
$app = Start-Process -FilePath (Join-Path $root 'LanternDirect.exe') -PassThru
try {
    Start-Sleep -Seconds 5
    $app.Refresh()
    if ($app.HasExited) { throw "Installed application exited on startup: $($app.ExitCode)" }
    for ($i=0; $i -lt 3 -and -not $app.HasExited; $i++) {
        $null = $app.CloseMainWindow()
        Start-Sleep -Seconds 2
        $app.Refresh()
    }
} finally {
    if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force; $app.WaitForExit() }
}
New-Item -ItemType Directory -Path (Join-Path $settings 'homekit\installer-test') -Force | Out-Null
$favoriteFile = Join-Path $settings 'favorites.json'
$pairingFile = Join-Path $settings 'homekit\installer-test\preserve.txt'
Set-Content -Path $favoriteFile -Value '[]' -NoNewline
Set-Content -Path $pairingFile -Value 'pairing storage preservation test' -NoNewline
$removed = Start-Process -FilePath (Join-Path $root 'Uninstall.exe') -ArgumentList '/S' -Wait -PassThru
if ($removed.ExitCode -ne 0) { throw 'Uninstaller failed' }
for ($i=0; $i -lt 40 -and (Test-Path (Join-Path $root 'LanternDirect.exe')); $i++) { Start-Sleep -Milliseconds 500 }
if (Test-Path (Join-Path $root 'LanternDirect.exe')) { throw 'Program was not removed' }
if (Test-Path $shortcut) { throw 'Start menu shortcut was not removed' }
if ((Get-Content -Raw $favoriteFile) -ne '[]') { throw 'Favorites were changed by uninstall' }
if ((Get-Content -Raw $pairingFile) -ne 'pairing storage preservation test') { throw 'Pairing storage was changed by uninstall' }
if (Get-ItemProperty -Path $runKey -Name LanternDirectHomeKit -ErrorAction SilentlyContinue) { throw 'Installed autostart registration was not removed' }
Write-Host 'Windows installer, bundled runtime, app startup, autostart migration, shortcuts, uninstall and user-data preservation verified.'

$ErrorActionPreference = 'Stop'
$setup = (Resolve-Path $args[0]).Path
$root = Join-Path $env:LOCALAPPDATA 'Programs\LanternDirect'
$settings = Join-Path $env:LOCALAPPDATA 'LanternDirect'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
New-Item -Path $runKey -Force | Out-Null
New-ItemProperty -Path $runKey -Name LanternDirectHomeKit -Value '"C:\old-portable\LanternDirect.exe" --homekit' -PropertyType String -Force | Out-Null
$installed = Start-Process -FilePath $setup -ArgumentList '/S' -Wait -PassThru
if ($installed.ExitCode -ne 0) { throw "Installer exit code: $($installed.ExitCode)" }
Write-Host 'Installation complete; checking packaged runtime.'
foreach ($file in @('LanternDirect.exe','node.exe','homekit\server.js','gateway\cli.js','gateway\desktop-worker.js','gateway\desktop-runtime.js','gateway\desktop-service.js','gateway\bridge.example.json','docs\GATEWAY.md','Uninstall.exe')) {
    if (-not (Test-Path (Join-Path $root $file))) { throw "Missing installed file: $file" }
}
$nodeVersion = & (Join-Path $root 'node.exe') --version
if ($nodeVersion -ne 'v24.19.0') { throw "Unexpected bundled Node runtime" }
& (Join-Path $root 'node.exe') (Join-Path $root 'gateway\cli.js') check --config (Join-Path $root 'gateway\bridge.example.json')
if ($LASTEXITCODE -ne 0) { throw 'Packaged gateway configuration check failed' }
& (Join-Path $root 'node.exe') -e 'const path=require("node:path");const root=process.argv[1];const registry=require(path.join(root,"gateway/registry"));if(!registry.adapters["lsc-tuya-light"])throw Error("LSC adapter missing");const tuya=require(path.join(root,"homekit/node_modules/tuyapi"));if(typeof tuya!=="function")throw Error("Tuya runtime missing")' $root
if ($LASTEXITCODE -ne 0) { throw 'Packaged LSC/Tuya runtime check failed' }
Write-Host 'Checking installed LSC worker.'
& (Join-Path $root 'node.exe') (Join-Path $PSScriptRoot 'lsc-smoke.js') $root
if ($LASTEXITCODE -ne 0) { throw 'Installed Windows Tuya worker exchange failed' }
Write-Host 'Checking installed desktop bridge and encrypted restore.'
& (Join-Path $root 'node.exe') (Join-Path $PSScriptRoot 'desktop-smoke.js') $root
if ($LASTEXITCODE -ne 0) { throw 'Installed desktop bridge smoke failed' }
Write-Host 'Checking native Bluetooth worker.'
$workerInfo = [Diagnostics.ProcessStartInfo]::new((Join-Path $root 'LanternDirect.exe'))
$workerInfo.UseShellExecute = $false
$workerInfo.CreateNoWindow = $true
$workerInfo.RedirectStandardInput = $true
$workerInfo.RedirectStandardOutput = $true
$workerInfo.ArgumentList.Add('--adapter-worker')
$workerInfo.ArgumentList.Add('--device')
$workerInfo.ArgumentList.Add('AA:BB:CC:DD:EE:FF')
$worker = [Diagnostics.Process]::Start($workerInfo)
try {
    $worker.StandardInput.WriteLine('{"kind":"request","id":1,"op":"status"}')
    $line = $worker.StandardOutput.ReadLineAsync()
    if (-not $line.Wait(10000)) { throw 'Native worker did not answer status' }
    $reply = $line.Result | ConvertFrom-Json
    if (-not $reply.ok -or $reply.id -ne 1 -or $reply.result.connected -isnot [bool]) { throw 'Invalid native worker status' }
    $worker.StandardInput.Close()
    if (-not $worker.WaitForExit(10000) -or $worker.ExitCode -ne 0) { throw 'Native worker did not close cleanly at EOF' }
} finally {
    if (-not $worker.HasExited) { $worker.Kill($true); $worker.WaitForExit() }
    $worker.Dispose()
}
Write-Host 'Checking gateway installation guard.'
$leaseInfo = [Diagnostics.ProcessStartInfo]::new((Join-Path $root 'LanternDirect.exe'))
$leaseInfo.UseShellExecute = $false
$leaseInfo.CreateNoWindow = $true
$leaseInfo.RedirectStandardInput = $true
$leaseInfo.RedirectStandardOutput = $true
$leaseInfo.ArgumentList.Add('--gateway-lease')
$lease = [Diagnostics.Process]::Start($leaseInfo)
try {
    $line = $lease.StandardOutput.ReadLineAsync()
    if (-not $line.Wait(10000) -or $line.Result -ne 'ready') { throw 'Gateway lease was not ready' }
    $guard = [Threading.Mutex]::OpenExisting('LanternDirect.CurrentUser.' + $env:USERNAME)
    $guard.Dispose()
    $lease.StandardInput.Close()
    if (-not $lease.WaitForExit(10000) -or $lease.ExitCode -ne 0) { throw 'Gateway lease did not close' }
} finally {
    if (-not $lease.HasExited) { $lease.Kill($true); $lease.WaitForExit() }
    $lease.Dispose()
}
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Lantern Bridge\Lantern Bridge.lnk'
if (-not (Test-Path $shortcut)) { throw 'Missing Start menu shortcut' }
$runValue = (Get-ItemProperty -Path $runKey -Name LanternDirectHomeKit).LanternDirectHomeKit
if ($runValue -ne ('"' + (Join-Path $root 'LanternDirect.exe') + '" --homekit')) { throw 'Autostart path was not migrated' }
Write-Host 'Checking desktop bridge autostart migration.'
New-ItemProperty -Path $runKey -Name LanternDirectHomeKit -Value '"C:\old-portable\LanternDirect.exe" --desktop-homekit' -PropertyType String -Force | Out-Null
$upgraded = Start-Process -FilePath $setup -ArgumentList '/S' -Wait -PassThru
if ($upgraded.ExitCode -ne 0) { throw 'Second installer run failed' }
$managedRunValue = (Get-ItemProperty -Path $runKey -Name LanternDirectHomeKit).LanternDirectHomeKit
if ($managedRunValue -ne ('"' + (Join-Path $root 'LanternDirect.exe') + '" --desktop-homekit')) { throw 'Desktop bridge autostart mode was not preserved' }
Write-Host 'Checking desktop startup.'
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
New-Item -ItemType Directory -Path (Join-Path $settings 'gateway\installer-test') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $settings 'desktop\installation') -Force | Out-Null
$desktopFile=Join-Path $settings 'desktop\installation\preserve.txt'
Set-Content -Path $desktopFile -Value 'desktop bridge preservation test' -NoNewline
$favoriteFile = Join-Path $settings 'favorites.json'
$pairingFile = Join-Path $settings 'homekit\installer-test\preserve.txt'
Set-Content -Path $favoriteFile -Value '[]' -NoNewline
Set-Content -Path $pairingFile -Value 'pairing storage preservation test' -NoNewline
$gatewayFile = Join-Path $settings 'gateway\installer-test\preserve.txt'
Set-Content -Path $gatewayFile -Value 'gateway storage preservation test' -NoNewline
Write-Host 'Checking uninstall and private storage preservation.'
$removed = Start-Process -FilePath (Join-Path $root 'Uninstall.exe') -ArgumentList '/S' -Wait -PassThru
if ($removed.ExitCode -ne 0) { throw 'Uninstaller failed' }
for ($i=0; $i -lt 40 -and (Test-Path (Join-Path $root 'LanternDirect.exe')); $i++) { Start-Sleep -Milliseconds 500 }
if (Test-Path (Join-Path $root 'LanternDirect.exe')) { throw 'Program was not removed' }
if (Test-Path $shortcut) { throw 'Start menu shortcut was not removed' }
if ((Get-Content -Raw $favoriteFile) -ne '[]') { throw 'Favorites were changed by uninstall' }
if ((Get-Content -Raw $pairingFile) -ne 'pairing storage preservation test') { throw 'Pairing storage was changed by uninstall' }
if ((Get-Content -Raw $gatewayFile) -ne 'gateway storage preservation test') { throw 'Gateway storage was changed by uninstall' }
if ((Get-Content -Raw $desktopFile) -ne 'desktop bridge preservation test') { throw 'Desktop bridge storage was changed by uninstall' }
if (Get-ItemProperty -Path $runKey -Name LanternDirectHomeKit -ErrorAction SilentlyContinue) { throw 'Installed autostart registration was not removed' }
Write-Host 'Windows installer, bundled runtime, app startup, autostart migration, shortcuts, uninstall and user-data preservation verified.'

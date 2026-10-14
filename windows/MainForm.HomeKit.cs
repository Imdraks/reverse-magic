using System.Text.Json;
using Microsoft.Win32;
namespace LanternDirect;
public sealed partial class MainForm
{
    private HomeKitHost? homeKit;
    private readonly Label homeStatus = new() { AutoSize = true, MaximumSize = new Size(530, 0), Text = "Maison : arrêté." };
    private readonly NotifyIcon tray = new() { Icon = SystemIcons.Application, Text = "Lantern Direct — Maison" };
    private readonly SemaphoreSlim homeWrites = new(1);
    private string? pairingCode, pairingQR;
    private bool reconnecting, quitting;
    private DateTime nextReconnect;
    private void InitializeHomeKit(FlowLayoutPanel page, bool atStartup)
    {
        page.Controls.Add(Heading("Maison / HomeKit")); page.Controls.Add(homeStatus);
        page.Controls.Add(Row(Button("Activer Maison", StartHomeKit), Button("Arrêter Maison", () => { StopHomeKit(); return Task.CompletedTask; }), Button("Code d’appairage", () => { ShowPairing(); return Task.CompletedTask; })));
        var auto = new CheckBox { Text = "Démarrer le pont avec Windows (ouverture de session)", AutoSize = true };
        using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run")) auto.Checked = key?.GetValue("LanternDirectHomeKit") is string;
        auto.CheckedChanged += (_, _) =>
        {
            try
            {
                using var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
                if (auto.Checked) key.SetValue("LanternDirectHomeKit", $"\"{Application.ExecutablePath}\" --homekit"); else key.DeleteValue("LanternDirectHomeKit", false);
            }
            catch (Exception e) { MessageBox.Show(this, e.Message, "Démarrage automatique"); }
        };
        page.Controls.Add(auto);
        var menu = new ContextMenuStrip();
        menu.Items.Add("Ouvrir", null, (_, _) => { Show(); WindowState = FormWindowState.Normal; Activate(); });
        menu.Items.Add("Quitter le pont", null, (_, _) => { quitting = true; Close(); });
        tray.ContextMenuStrip = menu; tray.DoubleClick += (_, _) => { Show(); Activate(); };
        FormClosing += (_, e) => { if (!quitting && homeKit != null && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); } };
        FormClosed += (_, _) => { StopHomeKit(); tray.Dispose(); };
        Shown += async (_, _) =>
        {
            if (!atStartup) return;
            busy = true;
            try { await StartHomeKit(); Hide(); } catch (Exception e) { homeStatus.Text = e.Message; }
            finally { busy = false; }
        };
    }
    private async Task StartHomeKit()
    {
        if (homeKit != null) return;
        if (lastDevice == null) throw new InvalidOperationException("Connectez une première fois votre contrôleur avant d’activer Maison.");
        if (!ble.IsReady) { try { await Connect(lastDevice); } catch { /* Publish offline and retry from HomeKit status polls. */ } }
        if (ble.IsReady) await StopMusic();
        var host = new HomeKitHost(lastDevice.Address.ToString("X12"), HandleHomeRequest);
        nextReconnect = DateTime.MinValue;
        homeKit = host; pairingCode = pairingQR = null;
        host.Notification += message => OnUI(() =>
        {
            if (homeKit != host) return;
            switch (message.GetProperty("kind").GetString())
            {
                case "pairing": pairingCode = message.GetProperty("code").GetString(); pairingQR = message.GetProperty("qrPath").GetString(); break;
                case "ready": homeStatus.Text = "Maison : prêt. Ajoutez un accessoire avec le code d’appairage."; break;
                case "status": homeStatus.Text = message.GetProperty("connected").GetBoolean() ? "Maison : LED connectées." : "Maison : LED indisponibles, reconnexion automatique…"; break;
                case "light":
                    var light = message.GetProperty("state");
                    desktopOn = light.GetProperty("on").GetBoolean();
                    brightness.Value = light.GetProperty("brightness").GetInt32();
                    var snapshot = new HomeKitLightState(true, brightness.Value, light.GetProperty("hue").GetDouble(), light.GetProperty("saturation").GetDouble()).Frames()[1];
                    selectedColor = Color.FromArgb(snapshot[5], snapshot[4], snapshot[6]);
                    PushDesktop(); break;
                case "warning": homeStatus.Text = message.GetProperty("message").GetString(); break;
            }
        });
        host.Exited += () => OnUI(() => { if (homeKit == host) { StopHomeKit(); homeStatus.Text = "Pont arrêté. Vérifiez le port 51827 et le paquet complet, puis réactivez Maison."; Show(); } });
        try { host.Start(); } catch { StopHomeKit(); throw; }
        controllerMic = false; StopScan(); tray.Visible = true;
        connectionPanel.Enabled = controls.Enabled = false;
        homeStatus.Text = "Maison : démarrage…";
    }
    private Task<object> HandleHomeRequest(JsonElement message, CancellationToken token)
    {
        var completion = new TaskCompletionSource<object>(TaskCreationOptions.RunContinuationsAsynchronously);
        OnUI(async () =>
        {
            try
            {
                token.ThrowIfCancellationRequested();
                if (homeKit == null) throw new InvalidOperationException();
                if (message.GetProperty("op").GetString() == "status")
                {
                    var connected = ble.IsReady;
                    if (!connected && !reconnecting && DateTime.UtcNow >= nextReconnect) _ = ReconnectHomeKit();
                    completion.TrySetResult(new { connected }); return;
                }
                if (message.GetProperty("op").GetString() != "apply") throw new ArgumentException();
                var state = message.GetProperty("state");
                var light = new HomeKitLightState(state.GetProperty("on").GetBoolean(), state.GetProperty("brightness").GetInt32(), state.GetProperty("hue").GetDouble(), state.GetProperty("saturation").GetDouble());
                var frames = light.Frames();
                await homeWrites.WaitAsync(token);
                try { foreach (var frame in frames) { token.ThrowIfCancellationRequested(); await ble.SendAsync(frame, token); } }
                finally { homeWrites.Release(); }
                completion.TrySetResult(new { });
            }
            catch (Exception e) { completion.TrySetException(e); }
        });
        return completion.Task.WaitAsync(token);
    }
    private async Task ReconnectHomeKit()
    {
        reconnecting = true;
        var current = homeKit;
        try { if (lastDevice != null && current != null) await Connect(lastDevice); }
        catch { nextReconnect = DateTime.UtcNow.AddSeconds(10); }
        finally { reconnecting = false; if (homeKit != current) { ble.Disconnect(); connectionPanel.Enabled = homeKit == null; controls.Enabled = false; } }
    }
    private void StopHomeKit()
    {
        var host = homeKit; homeKit = null; host?.Dispose();
        pairingCode = pairingQR = null; tray.Visible = false;
        homeStatus.Text = "Maison : arrêté.";
        if (reconnecting) ble.Disconnect();
        connectionPanel.Enabled = !reconnecting; controls.Enabled = ble.IsReady && !reconnecting;
    }
    private void ShowPairing()
    {
        if (pairingCode == null || pairingQR == null) throw new InvalidOperationException("Activez Maison et attendez la fin du démarrage.");
        using var dialog = new Form { Text = "Ajouter les LED dans Maison", Width = 390, Height = 480, StartPosition = FormStartPosition.CenterParent };
        using var image = Image.FromFile(pairingQR);
        dialog.Controls.Add(new PictureBox { Image = image, Dock = DockStyle.Top, Height = 320, SizeMode = PictureBoxSizeMode.Zoom });
        dialog.Controls.Add(new Label { Text = $"Code : {pairingCode}\nMaison → + → Ajouter un accessoire.\nScannez ce QR code. PC et iPhone sur le même réseau.\nAcceptez l’accessoire non certifié si Maison le demande.", Dock = DockStyle.Bottom, Height = 100, TextAlign = ContentAlignment.MiddleCenter });
        dialog.ShowDialog(this);
    }
}

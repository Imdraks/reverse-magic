using System.Reflection;
using System.Text.Json;

namespace LanternDirect;

public sealed partial class MainForm : Form
{
    private sealed record Effect(string group, string name, int code, bool isScene)
    {
        public override string ToString() => name;
    }
    private readonly BleController ble = new();
    private readonly Dictionary<ulong, FoundLED> found = [];
    private readonly ListBox devices = new() { Width = 530, Height = 120 };
    private readonly CheckBox showAll = new() { Text = "Afficher tous les appareils Bluetooth", AutoSize = true };
    private readonly Label status = new() { Text = "Recherchez vos LED.", AutoSize = true, MaximumSize = new Size(540, 0) };
    private readonly FlowLayoutPanel connectionPanel = new() { AutoSize = true, FlowDirection = FlowDirection.TopDown, WrapContents = false };
    private readonly FlowLayoutPanel controls = new() { AutoSize = true, FlowDirection = FlowDirection.TopDown, WrapContents = false, Enabled = false };
    private readonly ComboBox groups = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 160 };
    private readonly ComboBox effects = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 350 };
    private readonly TrackBar brightness = Slider(100), speed = Slider(50), sensitivity = Slider(50);
    private readonly ComboBox micEffect = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 300 };
    private readonly System.Windows.Forms.Timer scanTimer = new() { Interval = 12000 };
    private readonly string preferencesPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LanternDirect", "last-device.json");
    private readonly List<Effect> catalog;
    private Color selectedColor = Color.FromArgb(255,179,64);
    private FoundLED? lastDevice;
    private bool controllerMic;
    private bool busy;

    public MainForm(bool homekitAtStartup = false, bool gatewayAtStartup = false)
    {
        Text = "Lantern Bridge — LED Bluetooth";
        Width = 610; Height = 840;
        MinimumSize = new Size(590, 640);
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        var page = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(16) };
        Controls.Add(page);
        using var resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("LanternDirect.effects.json")!;
        catalog = JsonSerializer.Deserialize<List<Effect>>(resource)!;
        try { if (File.Exists(preferencesPath)) lastDevice = JsonSerializer.Deserialize<FoundLED>(File.ReadAllText(preferencesPath)); } catch { /* Ignore an invalid local preference. */ }

        page.Controls.Add(Heading("Contrôleur LED"));
        page.Controls.Add(status);
        page.Controls.Add(connectionPanel);
        connectionPanel.Controls.Add(showAll);
        connectionPanel.Controls.Add(Row(
            Button("Rechercher", async () =>
            {
                found.Clear(); devices.Items.Clear();
                ble.Scan(showAll.Checked); scanTimer.Start();
                status.Text = "Recherche pendant douze secondes…";
                await Task.CompletedTask;
            }),
            Button("Arrêter", async () => { StopScan(); await Task.CompletedTask; }),
            Button("Reconnecter", async () =>
            {
                if (lastDevice == null) throw new InvalidOperationException("Aucun contrôleur enregistré. Lancez une recherche.");
                await Connect(lastDevice);
            })));
        connectionPanel.Controls.Add(devices);
        connectionPanel.Controls.Add(Button("Connecter le contrôleur sélectionné", async () =>
        {
            if (devices.SelectedItem is not FoundLED selected) throw new InvalidOperationException("Choisissez votre contrôleur dans la liste.");
            await Connect(selected);
        }));
        connectionPanel.Controls.Add(Button("Déconnecter", async () =>
        {
            autoReconnectPaused = true; StopScan(); ble.Disconnect(); controllerMic = false;
            status.Text = "Déconnecté."; await Task.CompletedTask;
        }));

        InitializeHomeKit(page, homekitAtStartup);
        page.Controls.Add(controls);
        controls.Controls.Add(Heading("Lumière"));
        controls.Controls.Add(Row(
            Button("Allumer", () => ble.SendAsync(LedProtocol.Power(true))),
            Button("Éteindre", async () => { await StopMusic(); await ble.SendAsync(LedProtocol.Power(false)); }),
            Button("Choisir une couleur", async () =>
            {
                using var dialog = new ColorDialog { FullOpen = true, Color = selectedColor };
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                selectedColor = dialog.Color;
                await StopMusic();
                await ble.SendAsync(LedProtocol.Color(selectedColor.R, selectedColor.G, selectedColor.B));
                await ble.SendAsync(LedProtocol.Brightness(brightness.Value));
            })));
        controls.Controls.Add(Row(new Label { Text = "Luminosité (0–100 %)", AutoSize = true }, brightness,
            Button("Appliquer", () => ble.SendAsync(LedProtocol.Brightness(brightness.Value)))));

        controls.Controls.Add(Heading("Effets RGBIC"));
        foreach (var name in catalog.Select(x => x.group).Distinct()) groups.Items.Add(name);
        groups.SelectedIndexChanged += (_, _) =>
        {
            effects.Items.Clear();
            foreach (var effect in catalog.Where(x => x.group == groups.SelectedItem?.ToString())) effects.Items.Add(effect);
            if (effects.Items.Count > 0) effects.SelectedIndex = 0;
        };
        groups.SelectedIndex = 0;
        controls.Controls.Add(Row(groups, effects));
        controls.Controls.Add(Button("Lancer l’effet", async () =>
        {
            if (effects.SelectedItem is not Effect effect) return;
            await StopMusic();
            await ble.SendAsync(effect.isScene ? LedProtocol.Scene(effect.code) : LedProtocol.Effect(effect.code));
            await ble.SendAsync(LedProtocol.Brightness(brightness.Value));
        }));
        controls.Controls.Add(Row(new Label { Text = "Vitesse (0–100 %)", AutoSize = true }, speed,
            Button("Appliquer", () => ble.SendAsync(LedProtocol.Speed(speed.Value)))));

        controls.Controls.Add(Heading("Microphone du contrôleur (si équipé)"));
        micEffect.Items.AddRange(["Énergie", "Rythme", "Spectre", "Défilement", "Énergie 2", "Rythme 2", "Spectre 2", "Défilement 2"]);
        micEffect.SelectedIndex = 0;
        controls.Controls.Add(Row(micEffect,
            Button("Activer", async () =>
            {
                await ble.SendAsync(LedProtocol.Microphone(true)); controllerMic = true;
                await ble.SendAsync(LedProtocol.MicEffect(micEffect.SelectedIndex));
                await ble.SendAsync(LedProtocol.Sensitivity(sensitivity.Value));
            }),
            Button("Arrêter", StopMusic)));
        controls.Controls.Add(Row(new Label { Text = "Sensibilité (0–100 %)", AutoSize = true }, sensitivity,
            Button("Appliquer", () => ble.SendAsync(LedProtocol.Sensitivity(sensitivity.Value)))));
        page.Controls.Add(new Label { Text = "Bluetooth direct, sans compte ni cloud. Les valeurs sont vos consignes, pas une lecture de l’état des LED. Les effets disponibles dépendent du contrôleur. Le pont Maison nécessite le paquet Windows complet et un PC allumé.", AutoSize = true, MaximumSize = new Size(535, 0), Padding = new Padding(0, 12, 0, 0) });

        ble.Found += item => OnUI(() =>
        {
            found[item.Address] = item;
            var index = -1;
            for (var i = 0; i < devices.Items.Count; i++) if (((FoundLED)devices.Items[i]).Address == item.Address) { index = i; break; }
            if (index < 0) devices.Items.Add(item); else devices.Items[index] = item;
        });
        ble.Disconnected += message => OnUI(() =>
        {
            ble.Disconnect(); controllerMic = false; controls.Enabled = false;
            status.Text = message;
            if (homeKit == null && desktopConnectCancel == null) desktopIssue = ConnectionIssue.From(new IOException(message));
        });
        scanTimer.Tick += (_, _) => { StopScan(); status.Text = found.Count == 0 ? "Aucune LED trouvée. Rapprochez-vous et fermez l’app Android." : "Choisissez votre contrôleur."; };
        FormClosed += (_, _) => { StopHomeKit(); scanTimer.Dispose(); ble.Dispose(); };
        InitializeDesktop(page);
        InitializeReconnect(homekitAtStartup || gatewayAtStartup);
        InitializeGateway(gatewayAtStartup);
    }

    private async Task Connect(FoundLED selected, CancellationToken cancellationToken = default)
    {
        StopScan(); status.Text = $"Connexion à {selected.Name}…";
        await ble.ConnectAsync(selected.Address, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        lastDevice = selected;
        autoReconnectPaused = false;
        // Failure to save a convenience preference must not invalidate a live connection.
        try { Directory.CreateDirectory(Path.GetDirectoryName(preferencesPath)!); File.WriteAllText(preferencesPath, JsonSerializer.Serialize(selected)); } catch { }
        status.Text = $"Connecté à {selected.Name}.";
    }
    private async Task StopMusic()
    {
        if (!controllerMic) return;
        await ble.SendAsync(LedProtocol.Microphone(false)); controllerMic = false;
    }
    private void StopScan() { scanTimer.Stop(); ble.StopScan(); }
    private void OnUI(Action action)
    {
        if (IsDisposed || !IsHandleCreated) return;
        try { BeginInvoke(() => { if (!IsDisposed) action(); }); } catch (InvalidOperationException) { }
    }
    private Button Button(string text, Func<Task> action)
    {
        var button = new Button { Text = text, AutoSize = true, Padding = new Padding(6, 3, 6, 3) };
        button.Click += async (_, _) =>
        {
            if (busy) return;
            if (GatewayActive) { status.Text = "Désactivez le pont multi-éclairages dans l’interface avant les commandes directes."; return; }
            busy = true; connectionPanel.Enabled = false; controls.Enabled = false; UseWaitCursor = true;
            try { await action(); }
            catch (Exception e)
            {
                if (!IsDisposed) { status.Text = e is OperationCanceledException ? "Opération expirée ou connexion interrompue." : e.Message; MessageBox.Show(this, status.Text, "Lantern Bridge", MessageBoxButtons.OK, MessageBoxIcon.Information); }
            }
            finally { if (!IsDisposed) { busy = false; connectionPanel.Enabled = homeKit == null && !reconnecting; controls.Enabled = ble.IsReady && homeKit == null && !reconnecting; UseWaitCursor = false; } }
        };
        return button;
    }
    private static Label Heading(string text) => new() { Text = text, AutoSize = true, Font = new Font(SystemFonts.DefaultFont, FontStyle.Bold), Padding = new Padding(0, 12, 0, 6) };
    private static TrackBar Slider(int value) => new() { Minimum = 0, Maximum = 100, Value = value, TickFrequency = 10, Width = 190, Height = 40 };
    private static FlowLayoutPanel Row(params Control[] children)
    {
        var row = new FlowLayoutPanel { AutoSize = true, MaximumSize = new Size(550, 0), WrapContents = true };
        row.Controls.AddRange(children); return row;
    }
}

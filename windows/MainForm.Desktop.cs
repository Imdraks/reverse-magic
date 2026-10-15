using System.Reflection;
using System.Text.Json;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace LanternDirect;
public sealed partial class MainForm
{
    private WebView2? desktopView;
    private bool desktopReady, desktopOn;
    private readonly SemaphoreSlim desktopCommands = new(1);
    private void InitializeDesktop(Control legacy)
    {
        Text = "Lantern Bridge";
        BackColor = Color.FromArgb(247,247,249);
        var area = Screen.FromControl(this).WorkingArea;
        Size = new Size(Math.Min(1180, area.Width - 40), Math.Min(880, area.Height - 40));
        MinimumSize = new Size(800, 600);
        var splash = new Label { Dock=DockStyle.Fill, Text="Lantern\n\nPréparons votre lumière.", TextAlign=ContentAlignment.MiddleCenter, Font=new Font("Segoe UI",18), ForeColor=Color.FromArgb(100,100,110) };
        legacy.Visible=false;
        Controls.Add(splash); splash.BringToFront();
        Shown += async (_, _) =>
        {
            try
            {
                var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"LanternDirect","interface",Assembly.GetExecutingAssembly().GetName().Version!.ToString());
                Directory.CreateDirectory(directory);
                var assembly=Assembly.GetExecutingAssembly();
                foreach(var resource in assembly.GetManifestResourceNames().Where(x=>x.StartsWith("LanternDirect.ui.",StringComparison.Ordinal)))
                {
                    var filename=resource["LanternDirect.ui.".Length..];
                    using var input=assembly.GetManifestResourceStream(resource)!;
                    using var output=File.Create(Path.Combine(directory,filename)); input.CopyTo(output);
                }
                var environment=await CoreWebView2Environment.CreateAsync(userDataFolder:Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"LanternDirect","browser"));
                desktopView=new WebView2 { Dock=DockStyle.Fill, DefaultBackgroundColor=BackColor };
                Controls.Add(desktopView);desktopView.BringToFront();
                await desktopView.EnsureCoreWebView2Async(environment);
                var core=desktopView.CoreWebView2;
                core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.AreDevToolsEnabled=false;
                core.Settings.AreBrowserAcceleratorKeysEnabled=false;core.Settings.IsStatusBarEnabled=false;
                core.SetVirtualHostNameToFolderMapping("lantern.local",directory,CoreWebView2HostResourceAccessKind.DenyCors);
                core.NavigationStarting+=(_,e)=>{ if(!DesktopOrigin(e.Uri))e.Cancel=true; };
                core.NewWindowRequested+=(_,e)=>e.Handled=true;
                core.WebMessageReceived+=DesktopMessage;
                core.NavigationCompleted+=(_,_)=>{desktopReady=true;PushDesktop();};
                core.Navigate("https://lantern.local/index.html");
                splash.Dispose();
                var timer=new System.Windows.Forms.Timer { Interval=1500 };
                timer.Tick+=(_,_)=>PushDesktop();timer.Start();
                FormClosed+=(_,_)=>timer.Dispose();
            }
            catch
            {
                desktopReady=false;desktopView?.Dispose();desktopView=null;splash.Dispose();legacy.Visible=true;
                Width=650;MinimumSize=new Size(590,600);
                MessageBox.Show(this,"L’interface moderne n’a pas pu démarrer. Vérifiez que Microsoft Edge WebView2 Runtime est installé, puis relancez Lantern. Les commandes classiques restent disponibles.","Affichage Lantern",MessageBoxButtons.OK,MessageBoxIcon.Information);
            }
        };
    }
    private static bool DesktopOrigin(string value)=>Uri.TryCreate(value,UriKind.Absolute,out var uri)&&uri.Scheme=="https"&&uri.Host=="lantern.local"&&uri.AbsolutePath=="/index.html";
    private object DesktopState()
    {
        using var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
        var (favorites,favoritesError)=favoriteStore.Snapshot();
        return new { gateway=gatewayHost?.State??JsonSerializer.SerializeToElement(new {available=false,active=false}),version="0.8.0",favorites,favoritesError,canSaveFavorite=desktopKnown&&!controllerMic&&favoritesError==null,connectionIssue=desktopIssue,connecting=desktopConnectCancel!=null,connectionAttempt=desktopAttempt,platform="windows", connected=ble.IsReady, device=lastDevice is null?null:FormatAddress(lastDevice.Address), deviceName=lastDevice?.Name,
            on=desktopOn, brightness=brightness.Value, rgb=$"{selectedColor.R:X2}{selectedColor.G:X2}{selectedColor.B:X2}",mic=controllerMic,
            bridge=homeKit!=null,pairingReady=pairingCode!=null,autostart=key?.GetValue("LanternDirectHomeKit") is string,
            devices=found.Values.Select(x=>new {address=FormatAddress(x.Address),name=x.Name,rssi=x.RSSI}).ToArray(),effects=catalog,
            status=homeKit!=null?homeStatus.Text:status.Text };
    }
    private static string FormatAddress(ulong address)=>string.Join(":",Enumerable.Range(0,6).Select(i=>((address>>(8*(5-i)))&255).ToString("X2")));
    private void PushDesktop()
    {
        if(!desktopReady||desktopView?.CoreWebView2==null||IsDisposed)return;
        try{desktopView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new {kind="state",state=DesktopState()}));}catch(InvalidOperationException){}
    }
    private async void DesktopMessage(object? sender,CoreWebView2WebMessageReceivedEventArgs e)
    {
        if(!DesktopOrigin(e.Source)||e.WebMessageAsJson.Length>3*1024*1024)return;
        int id;
        JsonElement root;
        try{using var document=JsonDocument.Parse(e.WebMessageAsJson);root=document.RootElement.Clone();id=root.GetProperty("id").GetInt32();}catch{return;}
        object response;
        try
        {
            var action=root.GetProperty("action").GetString()!;
            var data=root.GetProperty("data");
            object result;
            if(action=="state")result=DesktopState();
            else if(action=="cancel-connect"){autoReconnectPaused=true;desktopConnectCancel?.Cancel();result=new {};}
            else
            {
                await desktopCommands.WaitAsync();
                try{result=await DesktopCommand(action,data);}finally{desktopCommands.Release();}
            }
            response=new {id,ok=true,result};
        }
        catch(Exception error){response=new {id,ok=false,error=error is OperationCanceledException?"Connexion annulée.":error.Message};}
        if(!IsDisposed&&desktopView?.CoreWebView2!=null)try{desktopView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(response));}catch(InvalidOperationException){}
        PushDesktop();
    }
    private async Task<object> DesktopCommand(string action,JsonElement data)
    {
        if(action=="quit"){BeginInvoke(()=>{quitting=true;Close();});return new {};}
        if(action=="gateway-autostart")
        {
            using var key=Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
            if(data.GetProperty("enabled").GetBoolean())key.SetValue("LanternDirectHomeKit",$"\"{Application.ExecutablePath}\" --desktop-homekit");
            else key.DeleteValue("LanternDirectHomeKit",false);
            return new {state=DesktopState()};
        }
        if(action.StartsWith("gateway-",StringComparison.Ordinal))
        {
            if(homeKit!=null)throw new InvalidOperationException("Arrêtez le pont Magic Lantern avant de gérer les autres éclairages.");
            if(busy||reconnecting)throw new InvalidOperationException("Attendez la fin de la connexion en cours.");
            gatewayHost??=new GatewayHost();
            var operation=action[8..];
            if(operation is "start" or "test-device" or "refresh-devices" or "apply" or "apply-group"){autoReconnectPaused=true;StopScan();ble.Disconnect();controllerMic=false;}
            var result=await gatewayHost.Command(operation,data);
            tray.Visible=gatewayHost.Active;
            return new {gatewayResult=result,state=DesktopState()};
        }
        if(GatewayActive&&action is not ("diagnose" or "check-updates" or "open-downloads"))throw new InvalidOperationException("Maison est actif. Désactivez le pont avant les commandes directes et les modifications.");
        if((busy||reconnecting)&&action is not ("bridge-stop" or "diagnose" or "check-updates" or "open-downloads" or "favorite-delete" or "autostart"))throw new InvalidOperationException("Une connexion est déjà en cours. Patientez un instant.");
        if(homeKit!=null&&action is not ("bridge-stop" or "pairing" or "autostart" or "diagnose" or "check-updates" or "open-downloads"))throw new InvalidOperationException("Maison pilote vos LED. Arrêtez le pont pour utiliser les commandes directes.");
        switch(action)
        {
            case "scan":
                StopScan();found.Clear();devices.Items.Clear();
                status.Text="Recherche des LED à proximité…";
                ble.Scan(data.GetProperty("all").GetBoolean());
                try{await Task.Delay(10000);}finally{StopScan();}
                status.Text=found.Count>0?"Choisissez votre contrôleur.":"Aucune LED trouvée. Vérifiez leur alimentation et fermez les autres apps Bluetooth.";
                break;
            case "connect":
                var text=data.GetProperty("address").GetString()!;
                if(!System.Text.RegularExpressions.Regex.IsMatch(text,@"^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$"))throw new ArgumentException("Adresse Bluetooth invalide.");
                var address=Convert.ToUInt64(text.Replace(":",""),16);
                var selected=found.GetValueOrDefault(address)??(lastDevice?.Address==address?lastDevice:new FoundLED(address,"Contrôleur LED",0));
                autoReconnectPaused=true;await ConnectDesktop(selected);break;
            case "disconnect":autoReconnectPaused=true;StopScan();ble.Disconnect();controllerMic=false;desktopIssue=null;status.Text="Connexion fermée.";break;
            case "bridge-start":await StartHomeKit();break;
            case "bridge-stop":StopHomeKit();break;
            case "favorite-save":
                if(!desktopKnown||controllerMic)throw new InvalidOperationException("Choisissez une couleur ou une animation avant de l’enregistrer.");
                favoriteStore.Save(data.GetProperty("name").GetString()!,DesktopFavorite());break;
            case "favorite-delete":favoriteStore.Delete(data.GetProperty("id").GetString()!);break;
            case "favorite-apply":
                if(!ble.IsReady)throw new InvalidOperationException("Connectez vos LED dans Appareils.");
                var favorite=favoriteStore.Get(data.GetProperty("id").GetString()!);
                foreach(var frame in favorite.Frames())await ble.SendAsync(frame);
                desktopMode=favorite.mode;desktopEffect=favorite.effect;desktopScene=favorite.scene;desktopSpeed=favorite.speed;
                selectedColor=Color.FromArgb(Convert.ToInt32(favorite.rgb[..2],16),Convert.ToInt32(favorite.rgb[2..4],16),Convert.ToInt32(favorite.rgb[4..],16));
                brightness.Value=favorite.brightness;desktopOn=true;controllerMic=false;desktopKnown=true;status.Text="Votre favori est appliqué.";break;
            case "diagnose":return new {checks=await DesktopDiagnostics()};
            case "check-updates":return await DesktopUpdates();
            case "open-downloads":System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("https://github.com/Imdraks/reverse-magic/releases"){UseShellExecute=true});return new {};
            case "pairing":
                if(pairingCode==null||pairingQR==null)throw new InvalidOperationException("Le code est en cours de préparation.");
                return new {code=pairingCode,image="data:image/png;base64,"+Convert.ToBase64String(File.ReadAllBytes(pairingQR))};
            case "autostart":
                using(var key=Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
                {if(data.GetProperty("enabled").GetBoolean())key.SetValue("LanternDirectHomeKit",$"\"{Application.ExecutablePath}\" --homekit");else key.DeleteValue("LanternDirectHomeKit",false);}
                break;
            default:
                if(!ble.IsReady)throw new InvalidOperationException("Connectez vos LED dans Appareils.");
                switch(action)
                {
                    case "power":
                        var on=data.GetProperty("on").GetBoolean();if(!on)await StopMusic();await ble.SendAsync(LedProtocol.Power(on));desktopOn=on;break;
                    case "color":
                        var rgb=data.GetProperty("rgb").GetString()!;
                        if(!System.Text.RegularExpressions.Regex.IsMatch(rgb,@"^[0-9A-Fa-f]{6}$"))throw new ArgumentException("Couleur invalide.");
                        var color=Color.FromArgb(Convert.ToInt32(rgb[..2],16),Convert.ToInt32(rgb[2..4],16),Convert.ToInt32(rgb[4..],16));
                        await StopMusic();await ble.SendAsync(LedProtocol.Color(color.R,color.G,color.B));await ble.SendAsync(LedProtocol.Brightness(brightness.Value));await ble.SendAsync(LedProtocol.Power(true));selectedColor=color;desktopOn=true;desktopMode="color";desktopKnown=true;break;
                    case "brightness":var level=data.GetProperty("value").GetInt32();await ble.SendAsync(LedProtocol.Brightness(level));brightness.Value=level;break;
                    case "speed":var pace=data.GetProperty("value").GetInt32();await ble.SendAsync(LedProtocol.Speed(pace));desktopSpeed=pace;break;
                    case "sensitivity":await ble.SendAsync(LedProtocol.Sensitivity(data.GetProperty("value").GetInt32()));break;
                    case "effect":
                        var code=data.GetProperty("id").GetInt32();var scene=data.GetProperty("scene").GetBoolean();
                        var frame=scene?LedProtocol.Scene(code):LedProtocol.Effect(code);var tempo=LedProtocol.Speed(data.GetProperty("speed").GetInt32());
                        await StopMusic();await ble.SendAsync(frame);await ble.SendAsync(tempo);await ble.SendAsync(LedProtocol.Power(true));desktopOn=true;desktopMode="effect";desktopEffect=code;desktopScene=scene;desktopSpeed=data.GetProperty("speed").GetInt32();desktopKnown=true;break;
                    case "mic":
                        var enabled=data.GetProperty("on").GetBoolean();
                        var frames=enabled?new[]{LedProtocol.Microphone(true),LedProtocol.MicEffect(data.GetProperty("effect").GetInt32()),LedProtocol.Sensitivity(data.GetProperty("sensitivity").GetInt32()),LedProtocol.Power(true)}:new[]{LedProtocol.Microphone(false)};
                        foreach(var item in frames)await ble.SendAsync(item);controllerMic=enabled;desktopOn|=enabled;break;
                    default:throw new ArgumentException("Commande inconnue.");
                }
                status.Text="Votre réglage a été appliqué.";
                break;
        }
        controls.Enabled=ble.IsReady&&homeKit==null;connectionPanel.Enabled=homeKit==null;
        return new {state=DesktopState()};
    }
}

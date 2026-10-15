using System.Text.Json;
using Windows.Devices.Bluetooth;
using Windows.Devices.Radios;
namespace LanternDirect;
public sealed partial class MainForm
{
    private readonly Favorites favoriteStore=new(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"LanternDirect","favorites.json"));
    private string desktopMode="color";
    private int desktopEffect,desktopSpeed=50,desktopAttempt;
    private bool desktopScene,desktopKnown;
    private ConnectionIssue? desktopIssue;
    private CancellationTokenSource? desktopConnectCancel;
    private Favorite DesktopFavorite()=>new("", "",desktopMode,$"{selectedColor.R:X2}{selectedColor.G:X2}{selectedColor.B:X2}",brightness.Value,desktopEffect,desktopScene,desktopSpeed);
    private async Task ConnectDesktop(FoundLED selected)
    {
        using var cancellation=new CancellationTokenSource();desktopConnectCancel=cancellation;
        try
        {
            for(var attempt=1;attempt<=2;attempt++)
            {
                desktopAttempt=attempt;desktopIssue=null;status.Text=$"Connexion aux LED · tentative {attempt} sur 2…";
                try{await Connect(selected,cancellation.Token);desktopKnown=false;return;}
                catch(OperationCanceledException) when(cancellation.IsCancellationRequested){throw;}
                catch(Exception error)
                {
                    desktopIssue=ConnectionIssue.From(error);
                    if(!desktopIssue.retryable||attempt==2){status.Text=desktopIssue.title;throw new IOException(desktopIssue.message);}
                    await Task.Delay(2000,cancellation.Token);
                }
            }
        }
        catch(OperationCanceledException){desktopIssue=null;status.Text="Connexion annulée.";throw;}
        finally{desktopConnectCancel=null;desktopAttempt=0;}
    }
    private static async Task<object[]> DesktopDiagnostics()
    {
        try
        {
            using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(6));
            var adapter=await BluetoothAdapter.GetDefaultAsync().AsTask(timeout.Token);
            if(adapter==null)return [new {label="Adaptateur Bluetooth",ok=false,message="Aucun adaptateur détecté. Vérifiez votre radio dans les paramètres Windows."}];
            var radio=await adapter.GetRadioAsync().AsTask(timeout.Token);
            return [new {label="Bluetooth LE",ok=adapter.IsLowEnergySupported,message=adapter.IsLowEnergySupported?"Bluetooth LE disponible.":"Cet adaptateur ne prend pas en charge Bluetooth LE."},
                new {label="Radio Bluetooth",ok=radio?.State==RadioState.On,message=radio?.State==RadioState.On?"Radio allumée.":"Activez le Bluetooth dans les paramètres Windows."},
                new {label="Connexion des LED",ok=(bool?)null,message="Une connexion depuis un autre appareil ne peut pas être détectée avec certitude. Fermez les autres apps pour libérer les LED."}];
        }
        catch{return [new {label="Service Bluetooth",ok=false,message="Le service ne répond pas. Vérifiez les autorisations Bluetooth et votre adaptateur dans Windows."}];}
    }
    private static async Task<object> DesktopUpdates()
    {
        try
        {
        using var client=new HttpClient{Timeout=TimeSpan.FromSeconds(8)};
        client.DefaultRequestHeaders.UserAgent.ParseAdd("LanternDirect/0.7.0");
        using var response=await client.GetAsync("https://api.github.com/repos/Imdraks/reverse-magic/releases?per_page=20");response.EnsureSuccessStatusCode();
        using var json=JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var latest=json.RootElement.EnumerateArray().Where(x=>!x.GetProperty("draft").GetBoolean()).Select(x=>x.GetProperty("tag_name").GetString()??"").Select(x=>Version.TryParse(x.TrimStart('v'),out var version)?version:null).Where(x=>x!=null).OrderDescending().FirstOrDefault()??new Version(0,7,0);
        return new {current="0.7.0",latest=latest.ToString(),available=latest>new Version(0,7,0)};
        }
        catch(Exception error) when(error is HttpRequestException or TaskCanceledException)
        {throw new IOException("Impossible de vérifier les versions. Vos commandes locales restent disponibles ; réessayez avec Internet.");}
    }
}

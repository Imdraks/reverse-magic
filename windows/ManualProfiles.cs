using System.Text.Json;
namespace LanternDirect;

public sealed record ManualProfile(int version,bool on,Favorite setting,string savedAt);
public sealed class ManualProfiles(string directory)
{
    private string FilePath=>Path.Combine(directory,"manual-profile.json");
    public ManualProfile? Load()
    {
        if(!File.Exists(FilePath))return null;
        using var document=JsonDocument.Parse(File.ReadAllText(FilePath));var root=document.RootElement;
        if(root.ValueKind!=JsonValueKind.Object||root.EnumerateObject().Count()!=4||!root.TryGetProperty("on",out var on)||on.ValueKind is not (JsonValueKind.True or JsonValueKind.False))throw new IOException("Profil mémorisé invalide ; fichier conservé.");
        var value=root.Deserialize<ManualProfile>()??throw new IOException("Profil mémorisé invalide.");
        if(value.version!=1||value.setting==null||!DateTimeOffset.TryParse(value.savedAt,out _))throw new IOException("Profil mémorisé invalide.");
        value.setting.Validate();return value;
    }
    private static void Atomic(string path,object value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);var temp=path+"."+Guid.NewGuid().ToString("N")+".tmp";
        try{using(var stream=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None)){JsonSerializer.Serialize(stream,value);stream.Flush(true);}File.Move(temp,path,true);}
        finally{if(File.Exists(temp))File.Delete(temp);}
    }
    public ManualProfile Save(bool on,Favorite setting,bool bridgeState=true)
    {
        Load();setting=(setting with {id=new string('0',32),name="Dernier profil"}).Validate();
        var value=new ManualProfile(1,on,setting,DateTimeOffset.UtcNow.ToString("O"));
        var canonical=Path.Combine(directory,"state.json");
        if(bridgeState&&File.Exists(canonical))
        {
            using var existing=JsonDocument.Parse(File.ReadAllText(canonical));var root=existing.RootElement;
            if(root.EnumerateObject().Count()!=4)throw new IOException("État Maison invalide ; fichier conservé.");
            _=new HomeKitLightState(root.GetProperty("on").GetBoolean(),root.GetProperty("brightness").GetInt32(),root.GetProperty("hue").GetDouble(),root.GetProperty("saturation").GetDouble()).Frames();
        }
        Atomic(FilePath,value);
        if(bridgeState)
        {
            var r=Convert.ToInt32(setting.rgb[..2],16)/255.0;var g=Convert.ToInt32(setting.rgb[2..4],16)/255.0;var b=Convert.ToInt32(setting.rgb[4..],16)/255.0;
            var max=Math.Max(r,Math.Max(g,b));var min=Math.Min(r,Math.Min(g,b));var delta=max-min;
            var hue=delta==0?0:max==r?60*((g-b)/delta%6):max==g?60*((b-r)/delta+2):60*((r-g)/delta+4);
            Atomic(canonical,new {on,brightness=setting.brightness,hue=(hue+360)%360,saturation=max==0?0:delta/max*100});
        }
        return value;
    }
    public static byte[][] Frames(ManualProfile profile)=>profile.on?profile.setting.Frames():[LedProtocol.Microphone(false),LedProtocol.Power(false)];
}

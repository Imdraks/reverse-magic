using System.Text.Json;
using System.Text.RegularExpressions;
namespace LanternDirect;
public sealed record Favorite(string id,string name,string mode,string rgb,int brightness,int effect,bool scene,int speed)
{
    public Favorite Validate()
    {
        if(id==null||!Regex.IsMatch(id,"^[0-9a-f]{32}$")||string.IsNullOrWhiteSpace(name)||name.Trim().Length>40||name.Any(char.IsControl))throw new ArgumentException("Le nom doit contenir entre 1 et 40 caractères.");
        if(mode is not ("color" or "effect")||rgb==null||!Regex.IsMatch(rgb,"^[0-9A-F]{6}$"))throw new ArgumentException("Ambiance invalide.");
        _=LedProtocol.Brightness(brightness);_=LedProtocol.Speed(speed);_=LedProtocol.Effect(effect);return this;
    }
    public byte[][] Frames()
    {
        Validate();
        var frames=new List<byte[]> {LedProtocol.Microphone(false)};
        if(mode=="color")frames.Add(LedProtocol.Color(Convert.ToInt32(rgb[..2],16),Convert.ToInt32(rgb[2..4],16),Convert.ToInt32(rgb[4..],16)));
        else{frames.Add(scene?LedProtocol.Scene(effect):LedProtocol.Effect(effect));frames.Add(LedProtocol.Speed(speed));}
        frames.Add(LedProtocol.Brightness(brightness));frames.Add(LedProtocol.Power(true));return frames.ToArray();
    }
}
public sealed class Favorites(string path)
{
    public List<Favorite> Load()
    {
        if(!File.Exists(path))return [];
        var items=JsonSerializer.Deserialize<List<Favorite>>(File.ReadAllText(path))??throw new IOException("Fichier de favoris invalide ; il est conservé.");
        if(items.Count>32||items.Select(x=>x.id).Distinct().Count()!=items.Count)throw new IOException("Fichier de favoris invalide ; il est conservé.");
        foreach(var item in items)item.Validate();return items;
    }
    public (List<Favorite>,string?) Snapshot(){try{return(Load(),null);}catch{return([],"Vos favoris sont indisponibles. Le fichier existant est conservé.");}}
    private void Write(List<Favorite> items)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);var temporary=path+".tmp";
        File.WriteAllText(temporary,JsonSerializer.Serialize(items));File.Move(temporary,path,true);
    }
    public void Save(string name,Favorite snapshot)
    {
        var items=Load();name=name.Trim();var existing=items.FindIndex(x=>x.name.Equals(name,StringComparison.OrdinalIgnoreCase));
        var item=(snapshot with {id=existing>=0?items[existing].id:Guid.NewGuid().ToString("N"),name=name}).Validate();
        if(existing>=0)items[existing]=item;else if(items.Count<32)items.Add(item);else throw new IOException("Vous pouvez conserver jusqu’à 32 favoris.");Write(items);
    }
    public Favorite Get(string id)=>Load().Find(x=>x.id==id)??throw new ArgumentException("Favori introuvable.");
    public void Delete(string id){var items=Load();if(items.RemoveAll(x=>x.id==id)==0)throw new ArgumentException("Favori introuvable.");Write(items);}
}
public sealed record ConnectionIssue(string code,string title,string message,bool retryable)
{
    public static ConnectionIssue From(Exception error)
    {
        var text=error.Message.ToLowerInvariant();
        if(text.Contains("accessdenied")||text.Contains("refus")||text.Contains("denied"))return new("permission","Accès Bluetooth refusé","Vérifiez les autorisations Bluetooth dans les paramètres de Windows.",false);
        if(text.Contains("success")&&(text.Contains("fff0")||text.Contains("fff3")))return new("unsupported","Contrôleur non compatible","Ce périphérique n’expose pas les commandes Magic Lantern attendues.",false);
        return new("unreachable","LED injoignables","Vérifiez leur alimentation, rapprochez-vous et fermez les autres apps ou ponts Bluetooth. Une autre connexion est possible, sans pouvoir la confirmer.",true);
    }
}

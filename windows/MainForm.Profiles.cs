namespace LanternDirect;
public sealed partial class MainForm
{
    private ManualProfile? rememberedProfile;
    private string? profileError;
    private ManualProfiles ProfileStore()=>new(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"LanternDirect","homekit",lastDevice!.Address.ToString("X12")));
    private void LoadManualProfile()
    {
        try
        {
            rememberedProfile=lastDevice==null?null:ProfileStore().Load();profileError=null;
            if(rememberedProfile is {} profile)
            {
                var setting=profile.setting;desktopOn=profile.on;desktopMode=setting.mode;desktopEffect=setting.effect;desktopScene=setting.scene;desktopSpeed=setting.speed;
                selectedColor=Color.FromArgb(Convert.ToInt32(setting.rgb[..2],16),Convert.ToInt32(setting.rgb[2..4],16),Convert.ToInt32(setting.rgb[4..],16));brightness.Value=setting.brightness;
            }
        }
        catch{rememberedProfile=null;profileError="Profil mémorisé illisible ; fichier conservé.";}
    }
    private void RememberManualProfile(bool bridgeState=true)
    {
        if((!desktopKnown&&rememberedProfile==null)||controllerMic||lastDevice==null)return;
        try{rememberedProfile=ProfileStore().Save(desktopOn,DesktopFavorite(),bridgeState);profileError=null;}
        catch{profileError="Réglage appliqué, mais profil non enregistré. Vérifiez le stockage.";}
    }
    private async Task RestoreManualProfile()
    {
        if(!ble.IsReady||lastDevice==null)throw new InvalidOperationException("Connectez vos LED avant de rétablir le profil.");
        var saved=ProfileStore().Load()??throw new InvalidOperationException("Aucun profil mémorisé.");
        foreach(var frame in ManualProfiles.Frames(saved))await ble.SendAsync(frame);
        LoadManualProfile();desktopKnown=true;controllerMic=false;status.Text="Votre profil mémorisé est rétabli.";
    }
}

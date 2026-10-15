using System.Text.Json;
namespace LanternDirect;
public sealed partial class MainForm
{
    private GatewayHost? gatewayHost;
    private bool GatewayActive=>gatewayHost?.Active==true;
    private void InitializeGateway(bool atStartup)
    {
        Shown+=async(_,_)=>
        {
            await desktopCommands.WaitAsync();
            try
            {
                gatewayHost??=new GatewayHost();
                using var empty=JsonDocument.Parse("{}");
                await gatewayHost.Command("state",empty.RootElement);
                if(atStartup)
                {
                    autoReconnectPaused=true;ble.Disconnect();
                    await gatewayHost.Command("start",empty.RootElement);
                    tray.Visible=true;Hide();
                }
            }
            catch(Exception error){status.Text=error.Message;}
            finally{desktopCommands.Release();PushDesktop();}
        };
        FormClosed+=(_,_)=>gatewayHost?.Dispose();
    }
}

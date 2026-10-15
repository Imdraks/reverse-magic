namespace LanternDirect;

public sealed partial class MainForm
{
    private bool autoReconnectPaused;
    private void InitializeReconnect(bool homekitAtStartup)
    {
        var timer = new System.Windows.Forms.Timer { Interval = 10000 };
        async Task Reconnect()
        {
            if (IsDisposed || GatewayActive || autoReconnectPaused || lastDevice == null || ble.IsReady ||
                homeKit != null || busy || reconnecting || desktopConnectCancel != null) return;
            // Share the command gate with WebView commands; never race a manual selection.
            if (!await desktopCommands.WaitAsync(0)) return;
            busy = true;
            connectionPanel.Enabled = controls.Enabled = false;
            try { await ConnectDesktop(lastDevice); }
            catch { /* Keep the diagnostic visible and retry on the next timer tick. */ }
            finally
            {
                busy = false;
                desktopCommands.Release();
                if (!IsDisposed)
                {
                    connectionPanel.Enabled = homeKit == null;
                    controls.Enabled = ble.IsReady && homeKit == null;
                    PushDesktop();
                }
            }
        }
        timer.Tick += async (_, _) => await Reconnect();
        Shown += async (_, _) =>
        {
            timer.Start();
            if (!homekitAtStartup) await Reconnect();
        };
        FormClosed += (_, _) =>
        {
            autoReconnectPaused = true;
            timer.Dispose();
            desktopConnectCancel?.Cancel();
        };
    }
}

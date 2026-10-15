namespace LanternDirect;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if(args.FirstOrDefault()=="--gateway-lease")
        {
            using var lease=new Mutex(false,"LanternDirect.CurrentUser."+Environment.UserName);
            using var output=new StreamWriter(Console.OpenStandardOutput()){AutoFlush=true};output.WriteLine("ready");
            using var input=new StreamReader(Console.OpenStandardInput());input.ReadToEnd();return;
        }
        if(args.FirstOrDefault()=="--adapter-worker"){Environment.ExitCode=AdapterWorker.Run(args).GetAwaiter().GetResult();return;}
        if(args.FirstOrDefault()=="--gateway"){Environment.ExitCode=GatewayLauncher.Run(args);return;}
        using var instance = new Mutex(true, "LanternDirect.CurrentUser." + Environment.UserName, out var first);
        if (!first) { MessageBox.Show("Lantern Bridge est déjà ouvert. Retrouvez son icône près de l’horloge."); return; }
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm(args.Contains("--homekit"), args.Contains("--desktop-homekit")));
    }
}

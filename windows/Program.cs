namespace LanternDirect;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        using var instance = new Mutex(true, "LanternDirect.CurrentUser." + Environment.UserName, out var first);
        if (!first) { MessageBox.Show("Lantern Direct est déjà ouvert. Retrouvez son icône près de l’horloge."); return; }
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm(args.Contains("--homekit")));
    }
}

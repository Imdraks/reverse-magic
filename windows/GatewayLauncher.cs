using System.Diagnostics;
using System.Runtime.InteropServices;
namespace LanternDirect;
internal static class GatewayLauncher
{
    [DllImport("kernel32.dll")] private static extern bool AttachConsole(uint processId);
    public static int Run(string[] args)
    {
        AttachConsole(unchecked((uint)-1));
        var root=AppContext.BaseDirectory;
        var node=Path.Combine(root,"node.exe");var script=Path.Combine(root,"gateway","cli.js");
        if(!File.Exists(node)||!File.Exists(script)){Console.Error.WriteLine("Installez le paquet complet Lantern Bridge.");return 1;}
        var info=new ProcessStartInfo(node){UseShellExecute=false};
        info.ArgumentList.Add(script);
        foreach(var argument in args.Skip(1))info.ArgumentList.Add(argument);
        using var process=Process.Start(info)!;
        process.WaitForExit();return process.ExitCode;
    }
}

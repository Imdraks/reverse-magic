using System.Diagnostics;
using System.Collections.Concurrent;
using System.Text.Json;
namespace LanternDirect;
public sealed class HomeKitHost : IDisposable
{
    private readonly Process process;
    private readonly ConcurrentDictionary<int, CancellationTokenSource> requests = new();
    private readonly SemaphoreSlim outputLock = new(1);
    private readonly Func<JsonElement, CancellationToken, Task<object>> handler;
    private bool disposed;
    public event Action<JsonElement>? Notification;
    public event Action? Exited;
    public HomeKitHost(string deviceId, Func<JsonElement, CancellationToken, Task<object>> handler)
    {
        this.handler = handler;
        var root = AppContext.BaseDirectory;
        var node = Path.Combine(root, "node.exe");
        var script = Path.Combine(root, "homekit", "server.js");
        if (!File.Exists(node) || !File.Exists(script)) throw new FileNotFoundException("Pour Maison, extrayez le paquet complet LanternDirect-Windows-HomeKit.zip.");
        var info = new ProcessStartInfo(node) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, WorkingDirectory = root };
        info.ArgumentList.Add(script); info.ArgumentList.Add("--device-id"); info.ArgumentList.Add(deviceId);
        info.ArgumentList.Add("--data-dir"); info.ArgumentList.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LanternDirect", "homekit", deviceId));
        process = new() { StartInfo = info, EnableRaisingEvents = true };
        process.Exited += (_, _) => { if (!disposed) Exited?.Invoke(); };
    }
    public void Start() { process.Start(); _ = Read(); _ = process.StandardError.ReadToEndAsync(); }
    private async Task Read()
    {
        try
        {
            while (!disposed && await process.StandardOutput.ReadLineAsync() is { } line)
            {
                if (line.Length > 16384) continue;
                using var doc = JsonDocument.Parse(line);
                var message = doc.RootElement.Clone();
                var kind = message.GetProperty("kind").GetString();
                if (kind == "request") _ = Respond(message);
                else if (kind == "cancel") { if (requests.TryGetValue(message.GetProperty("id").GetInt32(), out var cts)) { try { cts.Cancel(); } catch (ObjectDisposedException) { } } }
                else Notification?.Invoke(message);
            }
        }
        catch { if (!disposed) { try { process.Kill(true); } catch { } } }
    }
    private async Task Respond(JsonElement message)
    {
        var id = message.GetProperty("id").GetInt32();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        requests[id] = cts;
        object response;
        try { response = new { kind = "response", id, ok = true, result = await handler(message, cts.Token) }; }
        catch { response = new { kind = "response", id, ok = false }; }
        finally { requests.TryRemove(id, out _); }
        try
        {
            await outputLock.WaitAsync();
            try { if (!disposed) await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(response)); }
            finally { outputLock.Release(); }
        }
        catch { }
    }
    public void Dispose()
    {
        if (disposed) return; disposed = true;
        foreach (var cts in requests.Values) { try { cts.Cancel(); } catch (ObjectDisposedException) { } }
        try { process.StandardInput.Close(); if (!process.WaitForExit(1500)) process.Kill(true); } catch { }
        process.Dispose();
    }
}

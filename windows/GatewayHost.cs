using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
namespace LanternDirect;

internal sealed class GatewayHost : IDisposable
{
    private readonly Process process;
    private readonly ConcurrentDictionary<int,TaskCompletionSource<JsonElement>> pending=new();
    private readonly SemaphoreSlim writes=new(1);
    private int sequence;
    private bool disposed;
    private readonly object stateLock=new();
    private JsonElement state=JsonSerializer.SerializeToElement(new {available=false,active=false});
    public JsonElement State {get{lock(stateLock)return state;} private set{lock(stateLock)state=value;}}
    public bool Active=>State.TryGetProperty("active",out var value)&&value.ValueKind==JsonValueKind.True;
    public GatewayHost()
    {
        var root=AppContext.BaseDirectory;
        var node=Path.Combine(root,"node.exe");var script=Path.Combine(root,"gateway","desktop-worker.js");
        if(!File.Exists(node)||!File.Exists(script))throw new FileNotFoundException("Installez le paquet complet Lantern Bridge pour gérer les éclairages.");
        var info=new ProcessStartInfo(node){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,WorkingDirectory=root};
        info.ArgumentList.Add(script);
        info.ArgumentList.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"LanternDirect","desktop"));
        process=Process.Start(info)!;_=Read();_=process.StandardError.ReadToEndAsync();
    }
    private async Task Read()
    {
        try
        {
            while(!disposed&&await process.StandardOutput.ReadLineAsync() is {} line)
            {
                if(line.Length>3*1024*1024)continue;
                using var document=JsonDocument.Parse(line);var message=document.RootElement;
                if(message.GetProperty("kind").GetString()=="state")State=message.GetProperty("state").Clone();
                else if(message.TryGetProperty("id",out var id)&&pending.TryRemove(id.GetInt32(),out var completion))
                {
                    if(message.GetProperty("ok").GetBoolean())completion.TrySetResult(message.GetProperty("result").Clone());
                    else completion.TrySetException(new IOException(message.GetProperty("error").GetString()));
                }
            }
        }
        catch { }
        finally
        {
            State=JsonSerializer.SerializeToElement(new {available=false,active=false,error="Le gestionnaire du pont est arrêté."});
            foreach(var completion in pending.Values)completion.TrySetException(new IOException("Le gestionnaire du pont est arrêté."));
            pending.Clear();
        }
    }
    public async Task<JsonElement> Command(string action,JsonElement data)
    {
        var id=Interlocked.Increment(ref sequence);var completion=new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);pending[id]=completion;
        try
        {
            await writes.WaitAsync();
            try{await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(new {id,action,data}));}finally{writes.Release();}
            var result=await completion.Task.WaitAsync(TimeSpan.FromSeconds(180));
            if(result.ValueKind==JsonValueKind.Object&&result.TryGetProperty("config",out _))State=result;
            return result;
        }
        finally{pending.TryRemove(id,out _);}
    }
    public void Dispose()
    {
        if(disposed)return;disposed=true;
        try{process.StandardInput.Close();if(!process.WaitForExit(5000))process.Kill(true);}catch{}
        process.Dispose();
    }
}

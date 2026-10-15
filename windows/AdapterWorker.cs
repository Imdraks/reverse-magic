using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
namespace LanternDirect;

// No UI and no TCP API: the gateway owns this process through private stdio.
internal static class AdapterWorker
{
    public static async Task<int> Run(string[] args)
    {
        var index = Array.IndexOf(args,"--device");
        if(index<0 || index+1>=args.Length)return 2;
        var text=args[index+1].Replace(":","");
        if(text.Length!=12 || !ulong.TryParse(text,NumberStyles.HexNumber,CultureInfo.InvariantCulture,out var address))return 2;
        using var controller=new BleController();
        using var stopped=new CancellationTokenSource();
        using var input=new StreamReader(Console.OpenStandardInput());
        using var output=new StreamWriter(Console.OpenStandardOutput()){AutoFlush=true};
        using var outputLock=new SemaphoreSlim(1);
        var requests=new ConcurrentDictionary<int,CancellationTokenSource>();
        var tasks=new List<Task>();
        Task? reconnect=null;var retryAfter=DateTime.MinValue;
        async Task Connect()
        {
            try{await controller.ConnectAsync(address,stopped.Token);}
            catch{retryAfter=DateTime.UtcNow.AddSeconds(10);}
        }
        async Task Respond(JsonElement message)
        {
            var id=message.GetProperty("id").GetInt32();
            using var cancellation=CancellationTokenSource.CreateLinkedTokenSource(stopped.Token);cancellation.CancelAfter(TimeSpan.FromSeconds(5));
            if(!requests.TryAdd(id,cancellation))return;
            object response;
            try
            {
                object result;
                var op=message.GetProperty("op").GetString();
                if(op=="status")
                {
                    if(!controller.IsReady && (reconnect==null || reconnect.IsCompleted) && DateTime.UtcNow>=retryAfter)reconnect=Connect();
                    result=new{connected=controller.IsReady};
                }
                else if(op=="apply")
                {
                    var state=message.GetProperty("state");
                    var light=new HomeKitLightState(state.GetProperty("on").GetBoolean(),state.GetProperty("brightness").GetInt32(),state.GetProperty("hue").GetDouble(),state.GetProperty("saturation").GetDouble());
                    foreach(var frame in light.Frames())await controller.SendAsync(frame,cancellation.Token);
                    result=new{};
                }
                else throw new ArgumentException("Unknown operation");
                response=new{kind="response",id,ok=true,result};
            }
            catch{response=new{kind="response",id,ok=false};}
            finally{requests.TryRemove(id,out _);}
            await outputLock.WaitAsync();
            try{if(!stopped.IsCancellationRequested)await output.WriteLineAsync(JsonSerializer.Serialize(response));}
            finally{outputLock.Release();}
        }
        try
        {
            while(await input.ReadLineAsync() is {} line)
            {
                if(line.Length>65536 || requests.Count>=32)return 2;
                using var document=JsonDocument.Parse(line);var message=document.RootElement.Clone();
                if(message.GetProperty("kind").GetString()=="cancel")
                {if(requests.TryGetValue(message.GetProperty("id").GetInt32(),out var cancellation))try{cancellation.Cancel();}catch(ObjectDisposedException){};}
                else
                {tasks.RemoveAll(task=>task.IsCompletedSuccessfully);tasks.Add(Respond(message));}
            }
        }
        catch{return 1;}
        finally
        {
            stopped.Cancel();
            try{await Task.WhenAll(tasks);if(reconnect!=null)await reconnect;}catch{}
        }
        return 0;
    }
}

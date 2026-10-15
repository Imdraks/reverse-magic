using Windows.Devices.Bluetooth;
using Windows.Devices.Bluetooth.Advertisement;
using Windows.Devices.Bluetooth.GenericAttributeProfile;
using Windows.Storage.Streams;

namespace LanternDirect;

public sealed record FoundLED(ulong Address, string Name, int RSSI)
{
    public override string ToString() => $"{Name} — {Address:X12} — {RSSI} dBm";
}

public sealed class BleController : IDisposable
{
    private readonly BluetoothLEAdvertisementWatcher? watcher;
    private readonly Exception? watcherInitializationError;
    private readonly SemaphoreSlim writerLock = new(1, 1);
    private BluetoothLEDevice? device;
    private GattDeviceService? service;
    private GattCharacteristic? output;
    private CancellationTokenSource? connection;
    private Mutex? deviceLease;
    private bool showAll;
    public bool IsReady => output != null && device?.ConnectionStatus == BluetoothConnectionStatus.Connected;
    public event Action<FoundLED>? Found;
    public event Action<string>? Disconnected;

    public BleController()
    {
        try
        {
        watcher = new() { ScanningMode = BluetoothLEScanningMode.Active };
        watcher.Received += (_, e) =>
        {
            var name = e.Advertisement.LocalName;
            if (showAll || name.StartsWith("MELK-", StringComparison.Ordinal) || name.StartsWith("MELK_", StringComparison.Ordinal) || e.Advertisement.ServiceUuids.Contains(LedProtocol.Service))
                Found?.Invoke(new(e.BluetoothAddress, string.IsNullOrWhiteSpace(name) ? "Appareil sans nom" : name, e.RawSignalStrengthInDBm));
        };
        watcher.Stopped += (_, e) =>
        {
            if (e.Error != BluetoothError.Success) Disconnected?.Invoke($"Recherche arrêtée : {e.Error}");
        };
        }
        catch(Exception error) { watcherInitializationError = error; }
    }

    public void Scan(bool includeAll) { showAll = includeAll; if(watcher==null)throw new InvalidOperationException("Bluetooth LE indisponible sur cet ordinateur. Vérifiez l’adaptateur et les pilotes Windows.",watcherInitializationError); watcher.Start(); }
    public void StopScan() { try { watcher?.Stop(); } catch { /* Stopping a missing radio must not prevent exit. */ } }

    public async Task ConnectAsync(ulong address, CancellationToken cancellationToken = default)
    {
        StopScan();
        Disconnect();
        connection = new();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(connection.Token, cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(20));
        try
        {
            deviceLease = new Mutex(false, $"LanternDirect.Device.{Environment.UserName}.{address:X12}", out var ownsDevice);
            if(!ownsDevice)throw new InvalidOperationException("Ce contrôleur est déjà utilisé par un autre client ou module Lantern.");
            device = await BluetoothLEDevice.FromBluetoothAddressAsync(address).AsTask(timeout.Token)
                ?? throw new InvalidOperationException("Contrôleur indisponible. Activez le Bluetooth et libérez les LED de toute autre connexion.");
            var services = await device.GetGattServicesForUuidAsync(LedProtocol.Service, BluetoothCacheMode.Uncached).AsTask(timeout.Token);
            if (services.Status != GattCommunicationStatus.Success || services.Services.Count == 0)
                throw new InvalidOperationException($"Service Magic Lantern FFF0 inaccessible : {services.Status}.");
            service = services.Services[0];
            foreach (var extra in services.Services.Skip(1)) extra.Dispose();
            var characteristics = await service.GetCharacteristicsForUuidAsync(LedProtocol.Characteristic, BluetoothCacheMode.Uncached).AsTask(timeout.Token);
            if (characteristics.Status != GattCommunicationStatus.Success || characteristics.Characteristics.Count == 0)
                throw new InvalidOperationException($"Caractéristique FFF3 inaccessible : {characteristics.Status}.");
            output = characteristics.Characteristics[0];
            if (!output.CharacteristicProperties.HasFlag(GattCharacteristicProperties.Write) && !output.CharacteristicProperties.HasFlag(GattCharacteristicProperties.WriteWithoutResponse))
                throw new InvalidOperationException("Ce contrôleur ne permet pas les commandes LED sur FFF3.");
            device.ConnectionStatusChanged += ConnectionChanged;
        }
        catch { Disconnect(); throw; }
    }

    private void ConnectionChanged(BluetoothLEDevice sender, object args)
    {
        if (ReferenceEquals(sender, device) && sender.ConnectionStatus == BluetoothConnectionStatus.Disconnected)
        {
            connection?.Cancel();
            Disconnected?.Invoke("Connexion perdue. Reconnectez le contrôleur.");
        }
    }

    public async Task SendAsync(byte[] bytes, CancellationToken cancellationToken = default)
    {
        if (bytes.Length != 9 || bytes[0] != 0x7E || bytes[8] != 0xEF) throw new ArgumentException("Trame LED invalide.");
        var session = connection ?? throw new InvalidOperationException("Connectez vos LED.");
        using var operation = CancellationTokenSource.CreateLinkedTokenSource(session.Token, cancellationToken);
        await writerLock.WaitAsync(operation.Token);
        try
        {
            if (!ReferenceEquals(connection, session) || !IsReady || output == null) throw new InvalidOperationException("Connexion LED indisponible.");
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(operation.Token);
            timeout.CancelAfter(TimeSpan.FromSeconds(5));
            using var buffer = new DataWriter();
            buffer.WriteBytes(bytes);
            var option = output.CharacteristicProperties.HasFlag(GattCharacteristicProperties.Write)
                ? GattWriteOption.WriteWithResponse : GattWriteOption.WriteWithoutResponse;
            var result = await output.WriteValueWithResultAsync(buffer.DetachBuffer(), option).AsTask(timeout.Token);
            if (result.Status != GattCommunicationStatus.Success) throw new IOException($"Échec de l’écriture Bluetooth : {result.Status}.");
            await Task.Delay(60, operation.Token);
        }
        catch { if (ReferenceEquals(connection, session)) Disconnect(); throw; }
        finally { writerLock.Release(); }
    }

    public void Disconnect()
    {
        connection?.Cancel();
        connection = null;
        output = null;
        if (device != null) device.ConnectionStatusChanged -= ConnectionChanged;
        service?.Dispose(); service = null;
        device?.Dispose(); device = null;
        deviceLease?.Dispose(); deviceLease = null;
    }
    public void Dispose() { StopScan(); Disconnect(); }
}

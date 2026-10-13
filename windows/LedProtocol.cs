namespace LanternDirect;

public static class LedProtocol
{
    public static readonly Guid Service = new("0000fff0-0000-1000-8000-00805f9b34fb");
    public static readonly Guid Characteristic = new("0000fff3-0000-1000-8000-00805f9b34fb");
    private static byte B(int value, int max = 255)
    {
        if (value < 0 || value > max) throw new ArgumentOutOfRangeException(nameof(value));
        return (byte)value;
    }
    public static byte[] Power(bool on) => [0x7E, 4, 4, on ? (byte)1 : (byte)0, 0, on ? (byte)1 : (byte)0, 0xFF, 0, 0xEF];
    // The user's controller needs GRB channel order for the requested RGB color.
    public static byte[] Color(int r, int g, int b) => [0x7E, 7, 5, 3, B(g), B(r), B(b), 0x10, 0xEF];
    public static byte[] Brightness(int percent) => [0x7E, 4, 1, B(percent, 100), 0xFF, 0xFF, 0xFF, 0, 0xEF];
    public static byte[] Effect(int id) => [0x7E, 5, 3, B(id), 6, 0xFF, 0xFF, 0, 0xEF];
    public static byte[] Scene(int id) => [0x7E, 5, 0x31, B(id), 7, 0xFF, 0xFF, 1, 0xEF];
    public static byte[] Speed(int percent) => [0x7E, 4, 2, B(percent, 100), 0xFF, 0xFF, 0xFF, 0, 0xEF];
    public static byte[] Microphone(bool on) => [0x7E, 4, 7, on ? (byte)1 : (byte)0, 0xFF, 0xFF, 0xFF, 0, 0xEF];
    public static byte[] MicEffect(int id) => [0x7E, 7, 3, (byte)(B(id, 7) + 128), 4, 0xFF, 0xFF, 0, 0xEF];
    public static byte[] Sensitivity(int percent) => [0x7E, 4, 6, B(percent, 100), 0xFF, 0xFF, 0xFF, 0, 0xEF];
}

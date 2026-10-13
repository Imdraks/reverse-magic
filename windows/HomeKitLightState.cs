namespace LanternDirect;
public sealed record HomeKitLightState(bool On, int Brightness, double Hue, double Saturation)
{
    public byte[][] Frames()
    {
        if (Brightness is < 0 or > 100 || !double.IsFinite(Hue) || Hue is < 0 or > 360 || !double.IsFinite(Saturation) || Saturation is < 0 or > 100)
            throw new ArgumentException("Consigne Maison invalide.");
        if (!On) return [LedProtocol.Power(false)];
        var h = (Hue % 360) / 60;
        var c = Saturation / 100;
        var x = c * (1 - Math.Abs(h % 2 - 1));
        var (r, g, b) = h switch
        {
            < 1 => (c, x, 0.0), < 2 => (x, c, 0.0), < 3 => (0.0, c, x),
            < 4 => (0.0, x, c), < 5 => (x, 0.0, c), _ => (c, 0.0, x)
        };
        byte Channel(double value) => (byte)Math.Round((value + 1 - c) * 255, MidpointRounding.AwayFromZero);
        return [LedProtocol.Microphone(false), LedProtocol.Color(Channel(r), Channel(g), Channel(b)), LedProtocol.Brightness(Brightness), LedProtocol.Power(true)];
    }
}

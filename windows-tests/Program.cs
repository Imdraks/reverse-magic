using LanternDirect;

var count = 0;
void Check(byte[] frame, string expected)
{
    if (Convert.ToHexString(frame) != expected.Replace(" ", "")) throw new Exception($"Trame différente : {Convert.ToHexString(frame)} != {expected}");
    count++;
}
void Reject(Action operation)
{
    try { operation(); }
    catch (ArgumentOutOfRangeException) { count++; return; }
    throw new Exception("Entrée invalide acceptée.");
}
Check(LedProtocol.Power(true), "7E 04 04 01 00 01 FF 00 EF");
Check(LedProtocol.Power(false), "7E 04 04 00 00 00 FF 00 EF");
Check(LedProtocol.Color(255, 0, 128), "7E 07 05 03 FF 00 80 10 EF");
Check(LedProtocol.Brightness(100), "7E 04 01 64 FF FF FF 00 EF");
Check(LedProtocol.Brightness(0), "7E 04 01 00 FF FF FF 00 EF");
Check(LedProtocol.Effect(212), "7E 05 03 D4 06 FF FF 00 EF");
Check(LedProtocol.Scene(1), "7E 05 31 01 07 FF FF 01 EF");
Check(LedProtocol.Speed(75), "7E 04 02 4B FF FF FF 00 EF");
Check(LedProtocol.Microphone(true), "7E 04 07 01 FF FF FF 00 EF");
Check(LedProtocol.Microphone(false), "7E 04 07 00 FF FF FF 00 EF");
Check(LedProtocol.MicEffect(0), "7E 07 03 80 04 FF FF 00 EF");
Check(LedProtocol.MicEffect(7), "7E 07 03 87 04 FF FF 00 EF");
Check(LedProtocol.Sensitivity(50), "7E 04 06 32 FF FF FF 00 EF");
Reject(() => LedProtocol.Color(-1, 0, 0));
Reject(() => LedProtocol.Color(0, 256, 0));
Reject(() => LedProtocol.Color(0, 0, int.MaxValue));
Reject(() => LedProtocol.Brightness(101));
Reject(() => LedProtocol.Brightness(-1));
Reject(() => LedProtocol.Speed(255));
Reject(() => LedProtocol.Sensitivity(-1));
Reject(() => LedProtocol.Effect(256));
Reject(() => LedProtocol.Scene(-1));
Reject(() => LedProtocol.MicEffect(8));
Console.WriteLine($"{count} protocol checks passed; 0 failures.");

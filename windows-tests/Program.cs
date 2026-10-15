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
Check(LedProtocol.Color(255, 0, 128), "7E 07 05 03 00 FF 80 10 EF");
Check(LedProtocol.Color(255, 0, 0), "7E 07 05 03 00 FF 00 10 EF");
Check(LedProtocol.Color(0, 255, 0), "7E 07 05 03 FF 00 00 10 EF");
Check(LedProtocol.Color(0, 0, 255), "7E 07 05 03 00 00 FF 10 EF");
Check(LedProtocol.Color(255, 255, 255), "7E 07 05 03 FF FF FF 10 EF");
Check(LedProtocol.Color(0, 0, 0), "7E 07 05 03 00 00 00 10 EF");
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
Check(new HomeKitLightState(true, 35, 0, 100).Frames()[1], "7E 07 05 03 00 FF 00 10 EF");
Check(new HomeKitLightState(true, 35, 120, 100).Frames()[1], "7E 07 05 03 FF 00 00 10 EF");
Check(new HomeKitLightState(true, 35, 240, 100).Frames()[1], "7E 07 05 03 00 00 FF 10 EF");
Check(new HomeKitLightState(true, 35, 360, 100).Frames()[1], "7E 07 05 03 00 FF 00 10 EF");
Check(new HomeKitLightState(true, 35, 120, 0).Frames()[1], "7E 07 05 03 FF FF FF 10 EF");
Check(new HomeKitLightState(true, 35, 120, 100).Frames()[2], "7E 04 01 23 FF FF FF 00 EF");
Check(new HomeKitLightState(false, 35, 120, 100).Frames().Single(), "7E 04 04 00 00 00 FF 00 EF");
foreach (var state in new[] { new HomeKitLightState(true, -1, 0, 0), new HomeKitLightState(true, 50, double.NaN, 0), new HomeKitLightState(true, 50, 0, 101) })
{
    try { state.Frames(); throw new Exception("Invalid HomeKit state accepted"); }
    catch (ArgumentException) { count++; }
}
var directory=Path.Combine(Path.GetTempPath(),"lantern-favorites-"+Guid.NewGuid().ToString("N"));
try
{
    var file=Path.Combine(directory,"favorites.json");var favorites=new Favorites(file);
    favorites.Save("Soir",new Favorite("","","color","FF0000",42,0,false,50));
    var restored=new Favorites(file).Load().Single();
    Check(restored.Frames()[1],"7E 07 05 03 00 FF 00 10 EF");
    Check(restored.Frames()[2],"7E 04 01 2A FF FF FF 00 EF");
    favorites.Save("SOIR",restored with {brightness=12});
    if(favorites.Load().Count!=1||favorites.Load()[0].id!=restored.id||favorites.Load()[0].brightness!=12)throw new Exception("Favorite update lost its identity");count++;
    favorites.Delete(restored.id);if(favorites.Load().Count!=0)throw new Exception("Favorite deletion failed");count++;
    File.WriteAllText(file,"invalid user data");
    try{favorites.Save("New",restored);throw new Exception("Corrupt data overwritten");}catch(System.Text.Json.JsonException){}
    if(File.ReadAllText(file)!="invalid user data")throw new Exception("Corrupt user file changed");count++;
}
finally{if(Directory.Exists(directory))Directory.Delete(directory,true);}
var profileDirectory=Path.Combine(Path.GetTempPath(),"lantern-profile-"+Guid.NewGuid().ToString("N"));
try
{
    var profiles=new ManualProfiles(profileDirectory);
    profiles.Save(true,new Favorite("","","color","FF0000",42,0,false,50));
    var last=new ManualProfiles(profileDirectory).Load()??throw new Exception("Profile disappeared");
    if(last.setting.rgb!="FF0000"||last.setting.brightness!=42||!last.on)throw new Exception("Profile changed after reopen");count++;
    Check(ManualProfiles.Frames(last)[1],"7E 07 05 03 00 FF 00 10 EF");
    var off=profiles.Save(false,last.setting);
    if(ManualProfiles.Frames(off).Length!=2||ManualProfiles.Frames(off).Any(frame=>frame.SequenceEqual(LedProtocol.Power(true))))throw new Exception("Off profile created an on pulse");count++;
    using(var state=System.Text.Json.JsonDocument.Parse(File.ReadAllText(Path.Combine(profileDirectory,"state.json"))))
    {if(state.RootElement.GetProperty("on").GetBoolean()||state.RootElement.GetProperty("hue").GetDouble()!=0||state.RootElement.GetProperty("saturation").GetDouble()!=100)throw new Exception("HomeKit memory did not preserve RGB profile");count++;}
    File.WriteAllText(Path.Combine(profileDirectory,"manual-profile.json"),"corrupt profile");
    try{profiles.Save(true,last.setting);throw new Exception("Corrupt profile overwritten");}catch(System.Text.Json.JsonException){}
    if(File.ReadAllText(Path.Combine(profileDirectory,"manual-profile.json"))!="corrupt profile")throw new Exception("Corrupt profile changed");count++;
}
finally{if(Directory.Exists(profileDirectory))Directory.Delete(profileDirectory,true);}
Console.WriteLine($"{count} checks including persistent profiles passed; 0 failures.");

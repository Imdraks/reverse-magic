import unittest
from protocol import color, power, brightness, light_frames, effect, mic_effect, sensitivity

class ProtocolTests(unittest.TestCase):
    def test_grb_primary_colours_and_hsv(self):
        for hue, rgb, expected in [(0,(255,0,0),'7e07050300ff0010ef'), (120,(0,255,0),'7e070503ff000010ef'), (240,(0,0,255),'7e0705030000ff10ef'), (360,(255,0,0),'7e07050300ff0010ef')]:
            with self.subTest(hue=hue):
                self.assertEqual(color(*rgb).hex(), expected)
                frames = light_frames(dict(on=True, brightness=35, hue=hue, saturation=100))
                self.assertEqual(frames[1].hex(), expected)
                self.assertEqual(frames[2].hex(), '7e040123ffffff00ef')
                self.assertEqual(frames[-1], power(True))
        self.assertEqual(light_frames(dict(on=True,brightness=100,hue=42,saturation=0))[1], color(255,255,255))
        self.assertEqual(light_frames(dict(on=False,brightness=100,hue=0,saturation=0)), [power(False)])

    def test_invalid_inputs_and_effect_frames(self):
        for call in [lambda: color(-1,0,0), lambda: brightness(True), lambda: brightness(101), lambda: mic_effect(8), lambda: sensitivity(-1), lambda: power(1)]:
            with self.assertRaises(ValueError): call()
        for patch in [dict(hue=float('nan')), dict(saturation=101), dict(on=1), dict(brightness=0.5), dict(hue=-1)]:
            with self.assertRaises(ValueError): light_frames(dict(on=True,brightness=100,hue=0,saturation=100) | patch)
        self.assertEqual(effect(212).hex(), '7e0503d406ffff00ef')
        self.assertEqual(effect(1,True).hex(), '7e05310107ffff01ef')

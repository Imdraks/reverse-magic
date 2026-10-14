"""Magic Lantern nine-byte frames; the user's controller uses GRB."""
import colorsys
import math

SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb'
CHARACTERISTIC = '0000fff3-0000-1000-8000-00805f9b34fb'

def integer(value, maximum=255):
    if type(value) is not int or not 0 <= value <= maximum:
        raise ValueError('Valeur hors limites.')
    return value

def power(on):
    if type(on) is not bool:
        raise ValueError('Allumage invalide.')
    return bytes([0x7e, 4, 4, int(on), 0, int(on), 0xff, 0, 0xef])

def color(red, green, blue):
    return bytes([0x7e, 7, 5, 3, integer(green), integer(red), integer(blue), 0x10, 0xef])

def brightness(percent):
    return bytes([0x7e, 4, 1, integer(percent, 100), 0xff, 0xff, 0xff, 0, 0xef])

def speed(percent):
    return bytes([0x7e, 4, 2, integer(percent, 100), 0xff, 0xff, 0xff, 0, 0xef])

def effect(code, scene=False):
    return bytes([0x7e, 5, 0x31 if scene else 3, integer(code), 7 if scene else 6, 0xff, 0xff, int(scene), 0xef])

def microphone(on):
    if type(on) is not bool: raise ValueError('État du microphone invalide.')
    return bytes([0x7e, 4, 7, int(bool(on)), 0xff, 0xff, 0xff, 0, 0xef])

def mic_effect(code):
    return bytes([0x7e, 7, 3, integer(code, 7) + 128, 4, 0xff, 0xff, 0xff, 0, 0xef])

def sensitivity(percent):
    return bytes([0x7e, 4, 6, integer(percent, 100), 0xff, 0xff, 0xff, 0, 0xef])

def light_frames(state):
    if not isinstance(state, dict) or set(state) != {'on', 'brightness', 'hue', 'saturation'}:
        raise ValueError('Consigne Maison invalide.')
    if type(state['on']) is not bool:
        raise ValueError('Allumage invalide.')
    integer(state['brightness'], 100)
    for key, maximum in [('hue', 360), ('saturation', 100)]:
        value = state[key]
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= maximum:
            raise ValueError('Couleur invalide.')
    if not state['on']:
        return [power(False)]
    rgb = colorsys.hsv_to_rgb((state['hue'] % 360) / 360, state['saturation'] / 100, 1)
    channels = [math.floor(channel * 255 + 0.5) for channel in rgb]
    return [microphone(False), color(*channels), brightness(state['brightness']), power(True)]

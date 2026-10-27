"""Generate the Health Animal notification sounds (mono, 16-bit, 22050 Hz WAV).

Recipes are based on the Web Audio sounds in client/src/utils/audioHaptics.js.
Output is deterministic (stdlib only), so re-running yields identical bytes.

Run: python mobile/tools/make_sounds.py
Writes: mobile/android/app/src/main/res/raw/sloth_{meal,bedtime,water,hello}.wav
"""
import math
import os
import struct
import wave

RATE = 22050
FADE = 0.010          # 10 ms fade in/out
PEAK = 10 ** (-1 / 20)  # -1 dBFS
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       '..', 'android', 'app', 'src', 'main', 'res', 'raw')


def tone(buf, start, dur, freq, gain, partials=((1, 1.0),), tau=0.3, attack=0.004,
         glide_to=None, glide_tau=0.05, tri=False):
    """Add a decaying tone with optional partials (ratio, amp) and exponential pitch glide."""
    n0 = int(start * RATE)
    n = int(dur * RATE)
    phase = [0.0] * len(partials)
    for i in range(n):
        if n0 + i >= len(buf):
            break
        t = i / RATE
        f = freq
        if glide_to is not None:
            f = glide_to + (freq - glide_to) * math.exp(-t / glide_tau)
        env = math.exp(-t / tau) * min(1.0, t / attack)
        s = 0.0
        for k, (ratio, amp) in enumerate(partials):
            phase[k] += 2 * math.pi * f * ratio / RATE
            if tri:
                s += amp * (2 / math.pi) * math.asin(math.sin(phase[k]))
            else:
                s += amp * math.sin(phase[k])
        buf[n0 + i] += gain * env * s


def finish(name, buf):
    peak = max(abs(v) for v in buf) or 1.0
    scale = PEAK / peak
    fade_n = int(FADE * RATE)
    for i in range(fade_n):
        g = i / fade_n
        buf[i] *= g
        buf[-1 - i] *= g
    frames = b''.join(struct.pack('<h', int(round(max(-1.0, min(1.0, v * scale)) * 32767)))
                      for v in buf)
    path = os.path.normpath(os.path.join(OUT_DIR, name + '.wav'))
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(frames)
    print('%s: %.2fs, %d bytes' % (path, len(buf) / RATE, os.path.getsize(path)))


def blank(seconds):
    return [0.0] * int(seconds * RATE)


def meal():
    buf = blank(1.8)
    bell = ((1, 1.0), (2.0, 0.25), (2.76, 0.12))  # soft bell partials
    tone(buf, 0.0, 1.7, 880, 0.5, bell, tau=0.35)
    tone(buf, 0.12, 1.6, 1108, 0.35, bell, tau=0.3)
    finish('sloth_meal', buf)


def bedtime():
    buf = blank(2.4)
    warm = ((1, 1.0), (2, 0.35), (3, 0.15))  # octave up + harmonics for phone speakers
    tone(buf, 0.0, 2.3, 440, 0.5, warm, tau=0.7, attack=0.03, tri=True)
    tone(buf, 0.3, 2.1, 392, 0.4, warm, tau=0.6, attack=0.03, tri=True)
    finish('sloth_bedtime', buf)


def water():
    buf = blank(1.5)
    drop = ((1, 1.0), (2, 0.15))
    tone(buf, 0.0, 0.5, 1200, 0.5, drop, tau=0.12, glide_to=800, glide_tau=0.04)  # bloop
    tone(buf, 0.08, 0.8, 900, 0.35, drop, tau=0.2, glide_to=650, glide_tau=0.06)
    tone(buf, 0.45, 0.6, 1500, 0.15, drop, tau=0.1, glide_to=1000, glide_tau=0.03)  # drip
    tone(buf, 0.6, 0.9, 700, 0.1, drop, tau=0.25)  # soft ripple
    finish('sloth_water', buf)


def hello():
    buf = blank(1.6)
    harp = ((1, 1.0), (2, 0.2), (3, 0.06))
    for i, freq in enumerate((523, 659, 784, 1047)):
        tone(buf, i * 0.1, 1.2, freq, 0.4, harp, tau=0.35, attack=0.003)
    finish('sloth_hello', buf)


if __name__ == '__main__':
    meal()
    bedtime()
    water()
    hello()

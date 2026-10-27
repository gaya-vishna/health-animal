"""Generate the four sloth mood notification icons.

Usage (from repo root):  python mobile/tools/make_mood_icons.py
Writes sloth_{hungry,sleepy,thirsty,happy}.png (256x256 RGBA) into
mobile/android/app/src/main/res/drawable-nodpi/. Deterministic; needs Pillow only.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

S = 1024
K = 2.1                      # scale from icon.svg units
CX, CY = 512, 595            # head centre
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "..", "android", "app", "src", "main", "res", "drawable-nodpi"))

FUR, OUTLINE, MASK, CREAM = "#9e8a78", "#3d2f24", "#543d2b", "#f4ece1"
NOSE, AMBER, PINK = "#3a2a1d", "#e0a526", "#f58fb8"
BLUE, BLUE_L = "#38bdf8", "#bfe9fb"


def P(x, y):
    return (CX + (x - 256) * K, CY + (y - 270) * K)


def box(x, y, rx, ry):
    cx, cy = P(x, y)
    return [cx - rx * K, cy - ry * K, cx + rx * K, cy + ry * K]


def rot_ellipse(img, x, y, rx, ry, ang, fill):
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(box(x, y, rx, ry), fill=fill)
    layer = layer.rotate(-ang, center=P(x, y), resample=Image.BICUBIC)
    img.alpha_composite(layer)


def arc_stroke(d, pts, w, col):
    d.line(pts, fill=col, width=int(w), joint="curve")
    r = w / 2
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)


def qcurve(p0, p1, p2, n=40):
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return pts


def curve_svg(d, a, c, b, w, col):
    arc_stroke(d, qcurve(P(*a), P(*c), P(*b)), w * K, col)


def background():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    grad = Image.new("RGBA", (S, S))
    px = grad.load()
    c0, c1 = (0x1b, 0x3d, 0x2f), (0x0a, 0x18, 0x11)
    for y in range(S):
        for x in range(S):
            t = min(1.0, math.hypot(x - 512, y - 512) / 512)
            px[x, y] = tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3)) + (255,)
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).ellipse([0, 0, S - 1, S - 1], fill=255)
    img.paste(grad, (0, 0), m)
    return img


def head(img, eyes, mouth, cheeks=True):
    d = ImageDraw.Draw(img)
    for sx in (-1, 1):
        ex, ey = P(256 + sx * 118, 150)
        d.ellipse([ex - 46, ey - 46, ex + 46, ey + 46], fill=FUR, outline=OUTLINE, width=14)
    d.ellipse(box(256, 270, 140, 140), fill=FUR, outline=OUTLINE, width=int(12 * K))
    rot_ellipse(img, 205, 260, 45, 32, -15, MASK)
    rot_ellipse(img, 307, 260, 45, 32, 15, MASK)
    d = ImageDraw.Draw(img)
    d.ellipse(box(256, 285, 85, 68), fill=CREAM)
    eyes(d)
    if cheeks:
        for x in (185, 327):
            d.ellipse(box(x, 292, 15, 11), fill=PINK)
    d.ellipse(box(256, 283, 20, 14), fill=NOSE)
    mouth(d)


def open_eye(d, x, y, look=0):
    cx, cy = P(x, y)
    d.ellipse([cx - 36, cy - 42, cx + 36, cy + 42], fill="#fffaf0", outline=OUTLINE, width=7)
    d.ellipse([cx - 20 + look, cy - 20, cx + 20 + look, cy + 24], fill=OUTLINE)
    d.ellipse([cx - 8 + look, cy - 18, cx + 6 + look, cy - 4], fill="white")


def happy_eye(d, x, y):
    curve_svg(d, (x - 17, y + 6), (x, y - 16), (x + 17, y + 6), 8, OUTLINE)


def sleepy_eye(d, x, y):
    curve_svg(d, (x - 17, y - 4), (x, y + 18), (x + 17, y - 4), 8, OUTLINE)


def leaf(d, cx, cy, ang, size, col="#4ade80"):
    pts = [(size * math.cos(math.pi * i / 40), size * 0.42 * math.sin(math.pi * i / 40)) for i in range(41)]
    poly = pts + [(-x, -y) for x, y in pts]
    a = math.radians(ang)
    ca, sa = math.cos(a), math.sin(a)
    poly = [(cx + x * ca - y * sa, cy + x * sa + y * ca) for x, y in poly]
    d.polygon(poly, fill=col, outline="#166534")
    d.line([(cx - size * ca, cy - size * sa), (cx + size * ca, cy + size * sa)], fill="#166534", width=6)


def star(d, cx, cy, r, col):
    pts = []
    for i in range(8):
        rr = r if i % 2 == 0 else r * 0.28
        a = math.pi / 4 * i - math.pi / 2
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=col)


def drop(d, cx, cy, h, col, outline):
    """Teardrop: pointed top at cy - 0.6h, round bottom."""
    r = h * 0.36
    c = (cx, cy + h * 0.14)
    tip = (cx, cy - h * 0.62)
    dist = c[1] - tip[1]
    ang = math.acos(r / dist)  # tangent angle from vertical
    pts = [tip]
    a_start = -math.pi / 2 + ang
    a_end = -math.pi / 2 + 2 * math.pi - ang
    for i in range(61):
        a = a_start + (a_end - a_start) * i / 60
        pts.append((c[0] + r * math.cos(a), c[1] + r * math.sin(a)))
    d.polygon(pts, fill=col)
    d.line(pts + [pts[0]], fill=outline, width=7, joint="curve")
    d.ellipse([c[0] - r * 0.6, c[1] - r * 0.1, c[0] - r * 0.25, c[1] + r * 0.4], fill="white")


def finish(img, name):
    os.makedirs(OUT, exist_ok=True)
    img.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)


def hungry():
    img = background()

    def eyes(d):
        open_eye(d, 205, 262)
        open_eye(d, 307, 262)
        curve_svg(d, (182, 232), (200, 224), (222, 232), 6, OUTLINE)
        curve_svg(d, (290, 232), (312, 224), (330, 232), 6, OUTLINE)

    def mouth(d):
        d.ellipse(box(256, 326, 24, 20), fill="#5a1f2b", outline=NOSE, width=7)
        d.ellipse(box(256, 336, 13, 8), fill="#f08a9a")
        x, y = P(284, 335)
        d.rounded_rectangle([x - 8, y, x + 8, y + 70], 8, fill=BLUE_L)
        d.ellipse([x - 15, y + 58, x + 15, y + 96], fill=BLUE_L)

    head(img, eyes, mouth, cheeks=False)
    d = ImageDraw.Draw(img)
    leaf(d, 840, 770, -35, 70)
    leaf(d, 790, 835, 20, 60, "#86efac")
    finish(img, "sloth_hungry.png")


def sleepy():
    img = background()

    def eyes(d):
        sleepy_eye(d, 205, 262)
        sleepy_eye(d, 307, 262)

    def mouth(d):
        curve_svg(d, (246, 312), (256, 320), (266, 312), 7, NOSE)

    head(img, eyes, mouth)
    d = ImageDraw.Draw(img)
    mx, my, r = 200, 190, 70
    lay = Image.new("L", (S, S), 0)
    ld = ImageDraw.Draw(lay)
    ld.ellipse([mx - r, my - r, mx + r, my + r], fill=255)
    ld.ellipse([mx - r + 42, my - r - 16, mx + r + 42, my + r - 16], fill=0)
    img.paste(Image.new("RGBA", (S, S), "#fde68a"), (0, 0), lay)
    d = ImageDraw.Draw(img)
    star(d, 330, 260, 24, "#fef08a")
    f1 = ImageFont.truetype("arialbd.ttf", 130)
    f2 = ImageFont.truetype("arialbd.ttf", 85)
    d.text((770, 250), "Z", font=f1, fill=AMBER, stroke_width=4, stroke_fill="#7a5410")
    d.text((710, 130), "z", font=f2, fill="#f6c453", stroke_width=3, stroke_fill="#7a5410")
    finish(img, "sloth_sleepy.png")


def thirsty():
    img = background()

    def eyes(d):
        open_eye(d, 205, 262, 4)
        open_eye(d, 307, 262, 4)
        curve_svg(d, (182, 236), (200, 222), (222, 228), 6, OUTLINE)
        curve_svg(d, (290, 228), (312, 222), (330, 236), 6, OUTLINE)

    def mouth(d):
        d.ellipse(box(256, 322, 15, 11), fill="#5a1f2b", outline=NOSE, width=6)
        d.ellipse(box(256, 329, 8, 4), fill="#f08a9a")

    head(img, eyes, mouth, cheeks=False)
    d = ImageDraw.Draw(img)
    drop(d, 850, 250, 200, BLUE, "#1d6f9c")
    drop(d, 700, 130, 95, "#7dd3fc", "#1d6f9c")
    drop(d, 190, 215, 85, "#7dd3fc", "#1d6f9c")
    finish(img, "sloth_thirsty.png")


def happy():
    img = background()

    def eyes(d):
        happy_eye(d, 205, 262)
        happy_eye(d, 307, 262)

    def mouth(d):
        pts = qcurve(P(226, 304), P(256, 352), P(286, 304), 40)
        d.polygon(pts, fill="#5a1f2b")
        d.line(pts + [pts[0]], fill=NOSE, width=9, joint="curve")
        d.ellipse(box(256, 326, 12, 6), fill="#f08a9a")

    head(img, eyes, mouth)
    d = ImageDraw.Draw(img)
    star(d, 840, 240, 85, "#fef08a")
    star(d, 720, 130, 40, AMBER)
    star(d, 190, 210, 45, "#fef08a")
    star(d, 850, 400, 30, AMBER)
    finish(img, "sloth_happy.png")


if __name__ == "__main__":
    hungry()
    sleepy()
    thirsty()
    happy()
    print("wrote icons to", OUT)

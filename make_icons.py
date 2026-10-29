from PIL import Image, ImageDraw
import os

os.makedirs('icons', exist_ok=True)

def make_icon(size, path):
    s = size
    img = Image.new('RGBA', (s, s), (15, 23, 42, 255))  # фон #0f172a
    d = ImageDraw.Draw(img)
    body_left = s * 0.16
    body_right = s - body_left
    body_top = s * 0.28
    body_bottom = s * 0.70

    # верхний "горбик" камеры
    d.rectangle([s * 0.36, s * 0.20, s * 0.64, body_top], fill=(255, 255, 255, 255))
    # корпус камеры
    d.rounded_rectangle([body_left, body_top, body_right, body_bottom], radius=s * 0.08, fill=(255, 255, 255, 255))
    # объектив
    cx, cy = s * 0.5, (body_top + body_bottom) / 2
    r = s * 0.13
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(37, 99, 235, 255))
    d.ellipse([cx - r * 0.55, cy - r * 0.55, cx + r * 0.55, cy + r * 0.55], fill=(15, 23, 42, 255))
    # три точки этапов: до / во время / после
    colors = [(245, 158, 11, 255), (37, 99, 235, 255), (22, 163, 74, 255)]
    dot_r = s * 0.05
    y = s * 0.82
    xs = [s * 0.38, s * 0.50, s * 0.62]
    for c, x in zip(colors, xs):
        d.ellipse([x - dot_r, y - dot_r, x + dot_r, y + dot_r], fill=c)
    img.save(path)

make_icon(512, 'icons/icon-512.png')
make_icon(192, 'icons/icon-192.png')
print('icons created')

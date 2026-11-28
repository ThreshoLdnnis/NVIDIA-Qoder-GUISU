"""Regenerate the concept video and posters from the interactive viewer's mesh.

Optional local tool. Requires Node.js, Pillow, NumPy, and OpenCV with VP8 video
encoding enabled. The site itself does not run this script or use these packages.
"""

import json
import math
import subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 1120, 640
FPS = 16
SECONDS = 6.5


def load_mesh():
    source = '''
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const context = {};
runInNewContext(readFileSync('scene.js', 'utf8'), context);
process.stdout.write(JSON.stringify(context.ReFormEngineeringScene.mesh));
'''
    mesh = json.loads(subprocess.check_output(['node', '-e', source], cwd=ROOT, text=True))
    for face in mesh:
        vertices = face['vertices']
        face['center'] = [sum(point[i] for point in vertices) / len(vertices) for i in range(3)]
    return mesh


def dot(a, b):
    return sum(left * right for left, right in zip(a, b))


def ease(value):
    clamped = max(0, min(1, value))
    return clamped * clamped * (3 - 2 * clamped)


def stage_background():
    rows, columns = np.ogrid[:HEIGHT, :WIDTH]
    distance = ((columns - WIDTH * .59) / (WIDTH * .49)) ** 2 + ((rows - HEIGHT * .28) / (HEIGHT * .61)) ** 2
    flare = np.exp(-distance * 2.2)[..., None]
    return np.uint8(np.array([8., 12., 9.]) + flare * np.array([30., 43., 26.]))


def camera(yaw, show_labels):
    sine, cosine = math.sin(yaw), math.cos(yaw)
    sin_pitch, cos_pitch = math.sin(.49), math.cos(.49)
    right = (cosine, 0, -sine)
    up = (-sine * sin_pitch, cos_pitch, -cosine * sin_pitch)
    forward = (sine * cos_pitch, sin_pitch, cosine * cos_pitch)
    focus = (0, .70, 0)
    eye = [focus[i] + 11 * forward[i] for i in range(3)]
    offset = (WIDTH * .57 if show_labels else WIDTH * .50, HEIGHT * .46)

    def project(point):
        relative = [value - center for value, center in zip(point, focus)]
        factor = 113 * 11 / (11 - dot(relative, forward))
        return offset[0] + dot(relative, right) * factor, offset[1] - dot(relative, up) * factor

    return project, eye, forward


def draw_geometry(drawing, mesh, amount, yaw, show_labels):
    project, eye, forward = camera(yaw, show_labels)
    for index in range(-6, 7):
        guide = index * .55
        color = (38, 53, 39) if index else (58, 76, 53)
        drawing.line((project((guide, -.84, -3.25)), project((guide, -.84, 3.25))), fill=color)
        drawing.line((project((-3.25, -.84, guide)), project((3.25, -.84, guide))), fill=color)
    projected = []
    for face in mesh:
        shift = [value * amount for value in face['offset']]
        center = [value + offset for value, offset in zip(face['center'], shift)]
        if dot(face['normal'], [value - origin for value, origin in zip(eye, center)]) <= 0:
            continue
        points = [project([offset + value for offset, value in zip(shift, point)]) for point in face['vertices']]
        projected.append((dot(center, forward), face, points))
    for _, face, points in sorted(projected, key=lambda item: item[0]):
        rgb = tuple(int(face['color'][i:i + 2], 16) for i in (1, 3, 5))
        strength = .56 + .56 * max(0, dot(face['normal'], (-.36, .81, .46)))
        rim = max(0, dot(face['normal'], (.58, .2, -.79)))
        color = tuple(min(255, round(value * strength + rim * light)) for value, light in zip(rgb, (9, 19, 11)))
        edge = tuple(round(.80 * value + .20 * light) for value, light in zip(color, (196, 206, 195))) if face['edge'] else None
        drawing.polygon(points, fill=color, outline=edge)


def load_font(filename, size):
    try:
        return ImageFont.truetype(filename, size)
    except OSError:
        return ImageFont.load_default(size=size)


def draw_labels(drawing, stage, fonts):
    mono, title, caption = fonts
    drawing.text((38, 39), 'REFORM / DEMO-001', font=mono, fill='#b1c6a8')
    drawing.line((38, 72, 200, 72), fill='#61785b')
    drawing.text((38, 90), stage, font=title, fill='#edf3e9', spacing=5)
    drawing.text((38, 551), 'PLAN A', font=mono, fill='#c2d5b7')
    drawing.text((38, 578), 'Concept geometry / illustrative order', font=caption, fill='#a7bda2')
    drawing.text((WIDTH - 236, HEIGHT - 58), 'ReForm / Assembly Study', font=mono, fill='#a2b99d')


def main():
    mesh = load_mesh()
    background = stage_background()
    fonts = (load_font('consola.ttf', 16), load_font('segoeui.ttf', 36), load_font('segoeui.ttf', 16))

    def render(amount, yaw, stage=None):
        picture = Image.fromarray(background.copy())
        drawing = ImageDraw.Draw(picture)
        draw_geometry(drawing, mesh, amount, yaw, stage is not None)
        if stage:
            draw_labels(drawing, stage, fonts)
        return picture

    render(.85, .56).save(ROOT / 'assembly-poster.jpg', quality=90, optimize=True)
    render(.12, .56).save(ROOT / 'assembly-assembled.jpg', quality=89, optimize=True)
    video_path = ROOT / 'assembly-motion.webm'
    writer = cv2.VideoWriter(str(video_path), cv2.VideoWriter_fourcc(*'VP80'), FPS, (WIDTH, HEIGHT))
    if not writer.isOpened():
        raise RuntimeError('The VP8 video encoder did not open.')
    thumbnails = []
    try:
        for frame in range(round(SECONDS * FPS)):
            elapsed = frame / FPS
            amount = ease((elapsed - .5) / 1.6) - ease((elapsed - 3.8) / 1.45)
            yaw = .59 + .39 * math.sin(math.pi * elapsed / SECONDS)
            stage = next(label for stop, label in [
                (.55, '01 / REFERENCE\nFORM'),
                (2.3, '02 / SEPARATE\nCOMPONENTS'),
                (3.9, '03 / INSPECT\nCONNECTIONS'),
                (SECONDS, '04 / REASSEMBLE'),
            ] if elapsed < stop)
            rendered = render(amount, yaw, stage)
            if frame % 3 == 0:
                thumbnails.append(rendered.resize((560, 320), Image.Resampling.LANCZOS))
            image = np.asarray(rendered)
            writer.write(cv2.cvtColor(image, cv2.COLOR_RGB2BGR))
    finally:
        writer.release()

    video = cv2.VideoCapture(str(video_path))
    count = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
    readable = video.read()[0]
    video.release()
    if count != round(SECONDS * FPS) or not readable:
        raise RuntimeError('The output video could not be verified.')
    thumbnails[0].save(ROOT / 'assembly-motion.webp', save_all=True, append_images=thumbnails[1:], duration=188, loop=0, quality=73, method=4)
    with Image.open(ROOT / 'assembly-motion.webp') as animation:
        if not animation.is_animated or animation.n_frames < 30:
            raise RuntimeError('The output animation could not be verified.')
    print(f'{count} frames, {FPS} fps, {count / FPS} seconds, {WIDTH}×{HEIGHT}')


if __name__ == '__main__':
    main()

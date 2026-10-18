#!/usr/bin/env python3
"""Assemble the town art exported from the Paper file ("Headcount" / 02 Town).

Paper frames were exported at 0.5x (so one Kenney tile = 16 px, matching the
Phaser map) into a source directory. Positions below are the Paper artboard
coordinates (2x), taken from the "Town — Morning (idle)" artboard.

    python3 scripts/build-town-assets.py ~/Downloads apps/web/public/assets/town
"""
import os
import sys
from PIL import Image

src_dir, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)


def load(name):
    base = os.path.join(src_dir, name + '@0.5x.png')
    if not os.path.exists(base):
        raise SystemExit(f'missing export: {base}')
    return Image.open(base).convert('RGBA')


# (layer name, artboard x, artboard y) — z-order is list order.
DECOR = [
    ('decor_tree-01 trunk', 32, 64), ('decor_tree-02 trunk', 1216, 64),
    ('decor_tree-orange-01 trunk', 288, 64), ('decor_tree-orange-02 trunk', 1088, 64),
    ('decor_flowers-01', 64, 96), ('decor_flowers-02', 256, 96), ('decor_flowers-03', 1056, 96),
    ('decor_tree-03 trunk', 416, 96), ('decor_tree-04 trunk', 832, 96),
    ('decor_bush-01', 480, 128), ('decor_bush-02', 800, 128), ('decor_flowers-04', 384, 160),
    ('decor_tree-05 trunk', 0, 160), ('decor_tree-06 trunk', 1184, 160),
    ('decor_bush-03', 416, 192), ('decor_bush-04', 864, 192),
    ('decor_flowers-05', 480, 192), ('decor_flowers-06', 800, 192), ('decor_flowers-07', 832, 224),
    ('decor_tree-07 trunk', 32, 256), ('decor_tree-08 trunk', 1216, 256),
    ('decor_bush-05', 64, 288), ('decor_bush-06', 1120, 288),
    ('decor_flowers-08', 384, 288), ('decor_flowers-09', 896, 288), ('decor_flowers-10', 1184, 320),
    ('decor_flowers-11', 384, 352), ('decor_flowers-12', 896, 352),
    ('decor_tree-09 trunk', 0, 416), ('decor_tree-10 trunk', 1184, 416),
    ('decor_flowers-13', 448, 448), ('decor_flowers-14', 800, 448),
    ('decor_tree-orange-03 trunk', 384, 448), ('decor_tree-orange-04 trunk', 832, 448),
    ('decor_flowers-15', 576, 480), ('decor_flowers-16', 704, 480), ('decor_mushrooms-01', 480, 480),
    ('decor_bush-07', 384, 512), ('decor_flowers-17', 160, 512), ('decor_flowers-18', 288, 512),
    ('decor_flowers-19', 960, 512), ('decor_flowers-20', 1120, 512), ('decor_mushrooms-02', 832, 512),
    ('decor_tree-11 trunk', 32, 512), ('decor_tree-12 trunk', 1216, 512),
    ('decor_tree-orange-05 trunk', 256, 544),
    ('decor_mushrooms-03', 192, 576), ('decor_mushrooms-04', 1056, 576),
    ('decor_tree-13 trunk', 448, 576), ('decor_tree-14 trunk', 64, 608), ('decor_tree-15 trunk', 320, 608),
    ('decor_tree-16 trunk', 768, 608), ('decor_tree-17 trunk', 960, 608), ('decor_tree-18 trunk', 1152, 608),
    ('decor_flowers-21', 320, 640), ('decor_flowers-22', 544, 640), ('decor_flowers-23', 736, 640),
    ('decor_tree-19 trunk', 128, 640), ('decor_tree-20 trunk', 512, 640), ('decor_tree-21 trunk', 864, 640),
    ('decor_tree-22 trunk', 1088, 640), ('decor_tree-orange-06 trunk', 704, 640),
    ('decor_flowers-24', 128, 672), ('decor_flowers-25', 960, 672), ('decor_flowers-26', 1120, 672),
    # canopies last so they overlap the trunk tiles below them
    ('decor_tree-01 top', 32, 32), ('decor_tree-02 top', 1216, 32),
    ('decor_tree-orange-01 top', 288, 32), ('decor_tree-orange-02 top', 1088, 32),
    ('decor_tree-03 top', 416, 64), ('decor_tree-04 top', 832, 64),
    ('decor_tree-05 top', 0, 128), ('decor_tree-06 top', 1184, 128),
    ('decor_tree-07 top', 32, 224), ('decor_tree-08 top', 1216, 224),
    ('decor_tree-09 top', 0, 384), ('decor_tree-10 top', 1184, 384),
    ('decor_tree-orange-03 top', 384, 416), ('decor_tree-orange-04 top', 832, 416),
    ('decor_tree-11 top', 32, 480), ('decor_tree-12 top', 1216, 480),
    ('decor_tree-orange-05 top', 256, 512),
    ('decor_tree-13 top', 448, 544), ('decor_tree-14 top', 64, 576), ('decor_tree-15 top', 320, 576),
    ('decor_tree-16 top', 768, 576), ('decor_tree-17 top', 960, 576), ('decor_tree-18 top', 1152, 576),
    ('decor_tree-19 top', 128, 608), ('decor_tree-20 top', 512, 608), ('decor_tree-21 top', 864, 608),
    ('decor_tree-22 top', 1088, 608), ('decor_tree-orange-06 top', 704, 608),
]
FIXTURES = [
    ('city-hall_steps', 544, 192), ('plaza_fountain', 544, 256),
    ('lamp_left (15,9)', 480, 256), ('lamp_right (25,9)', 800, 256),
    ('notice-board_frame', 720, 248),
]
BUILDINGS = {
    'hall': ('building_city-hall', 512, 64), 'library': ('building_library', 96, 128),
    'workshop': ('building_workshop', 896, 128), 'post': ('building_post-office', 896, 384),
    'home': ('building_home', 96, 384),
}

ground = load('ground')
for name, x, y in DECOR + FIXTURES:
    ground.alpha_composite(load(name), (x // 2, y // 2))
ground.save(os.path.join(out_dir, 'ground.png'))

for key, (name, _x, _y) in BUILDINGS.items():
    load(name).save(os.path.join(out_dir, f'building-{key}.png'))
# The hand-lettered "HEADCOUNT: 1" sign sits above City Hall (artboard 506,24).
load('sign_headcount-1 (hand-lettered)').save(os.path.join(out_dir, 'sign.png'))
print('sign at', 506 // 2, 24 // 2)

# Sprites were exported in roster order: mayor, scout, maker, herald, founder.
SPRITES = {'mayor': 'sprite@0.5x (2)', 'scout': 'sprite@0.5x (3)', 'maker': 'sprite@0.5x (4)',
           'herald': 'sprite@0.5x (5)', 'founder': 'sprite@0.5x (6)'}
for agent, stem in SPRITES.items():
    Image.open(os.path.join(src_dir, stem.replace('@0.5x', '@0.5x') + '.png')).convert('RGBA').save(
        os.path.join(out_dir, f'sprite-{agent}.png'))
for prop in ('top-hat', 'magnifier', 'hammer', 'satchel'):
    load(f'prop_{prop}').save(os.path.join(out_dir, f'prop-{prop}.png'))
# The exported ring is the Mayor's amber; recolor it for each agent (identity colors, PRD §10.2).
RING_COLORS = {'mayor': '#F2B544', 'scout': '#3FB8AF', 'maker': '#FF6B5A', 'herald': '#8C6CF2', 'founder': '#F6EFE1'}
ring = load('ring')
for agent, hex_color in RING_COLORS.items():
    rgb = tuple(int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    out = ring.copy()
    px = out.load()
    for yy in range(out.height):
        for xx in range(out.width):
            r, g, b, a = px[xx, yy]
            if a and (r, g, b) == (233, 183, 90):
                px[xx, yy] = (*rgb, a)
    out.save(os.path.join(out_dir, f'ring-{agent}.png'))
print('ok', ground.size)

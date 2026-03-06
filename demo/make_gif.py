#!/usr/bin/env python3
"""Convert captured PNG frames into an animated GIF using raw GIF byte assembly."""
import os
import glob
import struct
from PIL import Image

FRAMES_DIR = os.path.join(os.path.dirname(__file__), 'frames')
OUT_PATH   = os.path.join(os.path.dirname(__file__), 'dag-demo.gif')

frame_paths = sorted(glob.glob(os.path.join(FRAMES_DIR, 'f*.png')))
print(f'Found {len(frame_paths)} frames')

scale = 0.75
delay_cs = 10   # 10 centiseconds = 100ms per frame

# Save each frame as an individual single-frame GIF, then concatenate properly
# by writing the GIF89a header + all frame blocks manually via Pillow's interal writer.
# Easiest reliable approach: write each frame as a temp GIF, then
# use Pillow's _write_local_header approach via saving to BytesIO.

import io

def frame_to_gif_bytes(img_rgb, delay_cs=10, first=False):
    """Convert an RGB PIL image to the bytes of a GIF frame block."""
    buf = io.BytesIO()
    q = img_rgb.quantize(colors=128, method=Image.Quantize.MEDIANCUT)

    if first:
        # Save as complete GIF (includes header + global color table)
        q.save(buf, format='GIF', save_all=False)
        data = buf.getvalue()
        # Patch delay: find the Graphic Control Extension (0x21 0xF9 0x04)
        idx = data.find(b'\x21\xF9\x04')
        if idx >= 0:
            delay_bytes = struct.pack('<H', delay_cs)
            data = data[:idx+4] + delay_bytes + data[idx+6:]
        return data, q
    else:
        q.save(buf, format='GIF', save_all=False)
        data = buf.getvalue()
        # Extract just the image descriptor + image data (skip header, trailer)
        # GIF header ends after global color table. Find image descriptor 0x2C.
        idx = data.find(b'\x2C')
        if idx < 0:
            return b'', q
        # Find graphic control extension before the image descriptor
        gce_idx = data.rfind(b'\x21\xF9\x04', 0, idx)
        start = gce_idx if gce_idx >= 0 else idx
        # Patch delay in GCE if present
        if gce_idx >= 0:
            delay_bytes = struct.pack('<H', delay_cs)
            data = data[:gce_idx+4] + delay_bytes + data[gce_idx+6:]
            start = gce_idx
        frame_data = data[start:-1]  # exclude trailing 0x3B (GIF trailer)
        return frame_data, q

# Load, resize, and convert all frames
print('Processing frames ...')
raw_frames = []
for i, p in enumerate(frame_paths):
    img = Image.open(p).convert('RGB')
    w, h = img.size
    img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    raw_frames.append(img)
    if (i+1) % 30 == 0:
        print(f'  {i+1}/{len(raw_frames)}')

print(f'Writing GIF with {len(raw_frames)} frames ...')
with open(OUT_PATH, 'wb') as f:
    for i, img in enumerate(raw_frames):
        block, _ = frame_to_gif_bytes(img, delay_cs=delay_cs, first=(i == 0))
        if i == 0:
            # Write header up to (but not including) trailer
            # Patch loop count (Netscape extension) for infinite loop
            # Insert before the first frame descriptor
            img_desc_idx = block.find(b'\x2C')
            gce_idx = block.rfind(b'\x21\xF9\x04', 0, img_desc_idx)
            insert_at = gce_idx if gce_idx >= 0 else img_desc_idx
            # Netscape 2.0 application extension for looping
            netscape = (b'\x21\xFF\x0BNETSCAPE2.0'
                        b'\x03\x01' + struct.pack('<H', 0) + b'\x00')
            block = block[:insert_at] + netscape + block[insert_at:-1]
            f.write(block)
        else:
            f.write(block)
    f.write(b'\x3B')  # GIF trailer

size_kb = os.path.getsize(OUT_PATH) / 1024
check = Image.open(OUT_PATH)
print(f'Done: {OUT_PATH}  ({size_kb:.0f} KB, {check.n_frames} frames)')

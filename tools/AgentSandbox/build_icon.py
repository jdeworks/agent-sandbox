#!/usr/bin/env python3
"""Generate app.ico for Agent Sandbox - a simple sandbox/container themed icon (no trademarks)."""
from PIL import Image, ImageDraw

def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = max(2, size // 16)
    r = size // 2 - pad
    cx, cy = size // 2, size // 2
    # Outer rounded rect = "sandbox" box (blue border + light fill)
    d.rounded_rectangle(
        [cx - r, cy - r, cx + r, cy + r],
        radius=max(4, size // 8),
        outline=(0, 120, 212, 255),
        fill=(230, 244, 255, 255),
        width=max(2, size // 24),
    )
    # Inner "play/run" chevron (small triangle pointing right)
    inner_r = r - max(4, size // 8)
    if size >= 24:
        chev_w = max(2, inner_r // 2)
        chev_h = max(2, int(inner_r * 1.2))
        pts = [
            (cx - chev_w, cy - chev_h),
            (cx - chev_w, cy + chev_h),
            (cx + chev_w, cy),
        ]
        d.polygon(pts, fill=(0, 120, 212, 255))
    return img

def main():
    img = draw_icon(256)
    out = "app.ico"
    img.save(out, format="ICO", sizes=[(256, 256), (48, 48), (32, 32), (16, 16)])
    print(f"Wrote {out}")

if __name__ == "__main__":
    main()

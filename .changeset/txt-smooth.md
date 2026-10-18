---
'@canvas-commons/2d': minor
---

Add `Txt.smooth` (default `Txt.defaultSmooth = false`) to paint text with
sub-pixel precision. Chromium snaps canvas glyphs vertically to the pixel grid
while the transform is axis-aligned, so slowly moving or scaling text steps by
whole pixels. With `smooth` on, each run is painted tilted by 0.001 radians
around its own anchor, which keeps the glyphs off that grid without moving them.
Nested `Txt` runs inherit the setting and `split()` pieces keep it.

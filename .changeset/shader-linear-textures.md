---
'@canvas-commons/core': patch
---

Sample the source and destination textures of shaders with bilinear filtering
instead of mipmaps, so shaders that displace or scale their UVs no longer look
blurry or pixelated.

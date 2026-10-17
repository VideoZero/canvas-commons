---
'@canvas-commons/2d': patch
---

Stop drawing a dot for a curve whose visible part is empty, such as one with
`end` at `0` and round line caps.

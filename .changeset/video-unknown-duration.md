---
'@canvas-commons/2d': patch
---

`Video.clampTime` returns `0` instead of `NaN` while the duration of the video
is unknown, so seeking a looping video before its metadata loads no longer
throws.

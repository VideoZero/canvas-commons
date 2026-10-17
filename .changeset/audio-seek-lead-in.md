---
'@canvas-commons/core': patch
---

Start the preview audio a fixed 50 ms behind the animation after seeking,
instead of three frames, so low preview frame rates don't delay the audio.

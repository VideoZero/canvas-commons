---
'@canvas-commons/core': patch
'@canvas-commons/2d': patch
---

Load media on pages with a null origin, such as sandboxed iframes, and stop
appending the asset hash to blob and data urls.

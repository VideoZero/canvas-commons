---
'@canvas-commons/2d': patch
---

Parse SVGs whose size the browser cannot report, such as in Safari: read the
`viewBox`, `width` and `height` attributes directly and bound elliptical arcs
without measuring them.

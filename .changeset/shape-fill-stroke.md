---
'@canvas-commons/2d': patch
---

`Shape.drawFill()` and `Shape.drawStroke()` are now protected, so subclasses can
draw between the fill and the stroke.

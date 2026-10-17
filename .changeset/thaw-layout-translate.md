---
'@canvas-commons/2d': patch
---

Make `thawLayout` animate children back into the flex layout instead of
snapping, keep a node's own `translate` across `thawLayout` and `morphTo`, and
move rotated or scaled children along a straight path.

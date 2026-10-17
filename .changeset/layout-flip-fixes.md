---
'@canvas-commons/2d': patch
---

Keep flex sizing intact during animated layout changes: `add`, `insert`, and
`remove` with a duration and `editLayout` now tween the size of grown,
stretched, and `basis`-sized children instead of collapsing them, a locked node
ignores its `basis` so `basis={0}` items keep their size, and canceling a size,
padding, margin, or gap tween releases the layout lock.

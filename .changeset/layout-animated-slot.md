---
'@canvas-commons/2d': patch
---

Grow and shrink the slot of a node added, inserted, or removed with a duration:
an inserted node now starts in an empty slot between its siblings and grows to
its flex size with them, instead of appearing at its content size over a sibling
and jumping to its flex size at the end, and a removed node keeps its flex size
and position and shrinks with its slot.

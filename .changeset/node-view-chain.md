---
'@canvas-commons/2d': minor
---

`Node.view()` now resolves through the parent chain, so a node that renders its
children into an offscreen view can present that view to its descendants by
overriding `view()`. Such a node is a layout boundary: flex layouts outside it
no longer place it or its content.

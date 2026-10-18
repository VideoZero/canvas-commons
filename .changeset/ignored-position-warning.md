---
'@canvas-commons/2d': minor
---

Add `Layout.warnIgnoredPosition` to warn when `x`, `y` or `position` is set on a
node that its layout parent positions, where the value is ignored. Animated
`add`, `insert`, `remove`, `editLayout` and `thawLayout` now hand the `x` and
`y` of laid-out children back as they were before the animation.

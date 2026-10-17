---
'@canvas-commons/2d': minor
---

Add `setFontResolver` and `googleFontsResolver` to declare font families that no
stylesheet declares, in the weight and style the text uses. A font whose family
was undeclared when it was first measured is requested again once more faces are
declared, and `Code` now waits for its web font before drawing.

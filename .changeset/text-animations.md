---
'@canvas-commons/2d': minor
---

Add text animations that split a `Txt` into pieces and animate them in its
place: `textTypewriter`, `textFadeIn`, `textScaleIn`, `textRevealIn`,
`textTrackingIn`, `textFadeOut`, `textScaleOut`, `textRevealOut` and
`textTrackingOut`. Entrances leave the text split, so ligatures and kerning
don't jump when they end; exits reuse those pieces and clean up. Find the split
of a text with `getTextSplit` and call `restore()` to draw the source again.
Build your own on `splitText`.

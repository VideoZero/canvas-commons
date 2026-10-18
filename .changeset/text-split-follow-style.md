---
'@canvas-commons/2d': minor
---

Add a `followStyle` option to `splitText`, the text animations and
`Txt.split`/`splitPieces`: the pieces keep their typeface and paint bound to the
text they came from, so tweening the source's `fill`, `fontWeight` and the like
while it is split reaches the pieces.

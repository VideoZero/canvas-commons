---
'@canvas-commons/2d': patch
---

`Latex` fragments written with `{{}}` may now contain braces of their own, so
`{{\frac{a}{b}}}` is one fragment instead of being cut at the first `}}`.

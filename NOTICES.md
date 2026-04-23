# Third-Party Notices

Send2LLM includes code adapted from the following open-source projects.

---

## Obsidian Web Clipper

- Source: https://github.com/obsidianmd/obsidian-clipper
- License: MIT
- Copyright: (c) 2024 Obsidian

Portions of the following utilities were adapted (modified) from Obsidian Web Clipper:

| Send2LLM file | Adapted from |
|---|---|
| `extension/src/shared/utils.ts` — `normalizeUrl`, `EPHEMERAL_PARAMS` | `src/utils/highlighter.ts` |
| `extension/src/shared/utils.ts` — `isRestrictedUrl` | `src/managers/active-tab-manager.ts` |
| `extension/src/shared/utils.ts` — `getElementXPath`, `getElementByXPath` | `src/utils/dom-utils.ts` |
| `extension/src/shared/timing.ts` — `debounce`, `throttle` | `src/utils/debounce.ts`, `src/utils/throttle.ts` |
| `extension/src/content/index.ts` — generation counter pattern | `src/content.ts` |

### MIT License (Obsidian Web Clipper)

```
MIT License

Copyright (c) 2024 Obsidian

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

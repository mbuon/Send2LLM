# Third-Party Notices

Send2LLM draws inspiration from the following open-source projects. All
implementations in this repo are our own; this notice credits the projects
whose ideas or param lists informed our design.

---

## Obsidian Web Clipper

- Source: https://github.com/obsidianmd/obsidian-clipper
- License: MIT
- Copyright: (c) 2024 Obsidian

The following Send2LLM utilities are inspired by — but not copied from —
Obsidian Web Clipper:

| Send2LLM symbol | Inspiration |
|---|---|
| `extension/src/shared/utils.ts` — `canonicalizePageUrl`, `isTrackingParam`, `TRACKING_PARAMS_EXACT`, `TRACKING_PARAM_PREFIXES` | Their URL-normalization step strips hash + ad/UTM params before storage. We rebuilt this with a prefix-matcher plus a small exact-match set. |
| `extension/src/shared/utils.ts` — `isUninjectableUrl`, `BROWSER_INTERNAL_PROTOCOLS`, `EXTENSION_STORE_HOSTS` | Their active-tab manager centralizes the list of URLs where content scripts cannot run. We rebuilt this as two small data tables + a scanning loop. |
| `extension/src/shared/utils.ts` — `computeElementXPath`, `resolveXPath` | Their DOM utils include positional XPath builder/resolver helpers. Our builder walks iteratively instead of recursively. |
| `extension/src/shared/timing.ts` — `debounced`, `throttled` | Standard idioms also used in their codebase. Our `throttled` uses a distinct leading+trailing strategy. |
| `extension/src/content/index.ts` — epoch counter on `window` | Their content script uses a generation counter on `window` to ignore stale listeners after reload. We implement the same pattern with our own symbol name. |

The MIT license does not require this notice for original implementations;
we include it as a courtesy.

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

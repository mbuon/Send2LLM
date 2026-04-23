// Generic debounce/throttle helpers. Send2LLM implementations; see NOTICES.md
// for inspiration credit to Obsidian Web Clipper.

type AnyFn = (...args: any[]) => void;

// Fires `fn` only after `waitMs` of quiet — each call resets the timer.
export function debounced<F extends AnyFn>(fn: F, waitMs: number): (...args: Parameters<F>) => void {
  let handle: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<F>) => {
    if (handle !== undefined) clearTimeout(handle);
    handle = setTimeout(() => {
      handle = undefined;
      fn(...args);
    }, waitMs);
  };
}

// Fires `fn` at most once per `intervalMs`. Leading-edge call, plus a trailing
// call if invocations continued during the quiet window (so the final position
// isn't dropped).
export function throttled<F extends AnyFn>(fn: F, intervalMs: number): (...args: Parameters<F>) => void {
  let lastFireAt = 0;
  let trailingHandle: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: Parameters<F> | null = null;

  return (...args: Parameters<F>) => {
    const now = Date.now();
    const sinceLast = now - lastFireAt;
    pendingArgs = args;

    if (sinceLast >= intervalMs) {
      if (trailingHandle !== undefined) {
        clearTimeout(trailingHandle);
        trailingHandle = undefined;
      }
      lastFireAt = now;
      const a = pendingArgs;
      pendingArgs = null;
      fn(...a);
      return;
    }

    if (trailingHandle === undefined) {
      trailingHandle = setTimeout(() => {
        trailingHandle = undefined;
        lastFireAt = Date.now();
        if (pendingArgs) {
          const a = pendingArgs;
          pendingArgs = null;
          fn(...a);
        }
      }, intervalMs - sinceLast);
    }
  };
}

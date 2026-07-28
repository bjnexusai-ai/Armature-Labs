import { useEffect, useState } from 'react';

/**
 * Ported from the demo's runCountUps(): 700ms, cubic ease-out.
 *
 * Bug found via live click-through of Session 7's Dashboard: every
 * MetricCard showed 0 despite real, non-zero data underneath (confirmed
 * by the workflow stepper and hero card on the same page showing correct
 * real counts side-by-side). Root cause: the original implementation used
 * a `startedRef` one-shot guard so the animation effect only ever ran on
 * the very first mount — which happens while `DashboardPage` is still
 * loading and passes `value={0}` (the metrics state's initial default).
 * Once the real fetch resolved and `target` changed to the real number,
 * the guard skipped re-running the effect entirely, freezing the
 * displayed value at 0 permanently. Removed the guard so the effect
 * re-runs (and re-animates) on every real `target` change, which is what
 * "wired to real, changing data" requires — a metric that only animates
 * correctly the one time it happens to mount already-loaded isn't
 * actually correct for this app's real loading-then-loaded lifecycle.
 */
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const p = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

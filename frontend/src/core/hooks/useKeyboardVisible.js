import { useEffect, useState } from "react";

/**
 * useKeyboardVisible
 *
 * True while an on-screen keyboard is likely open. Use this to hide a fixed
 * bottom nav so it doesn't ride up and sit on top of the field being typed
 * into.
 *
 * Tracks a `baselineHeight` and treats a big-enough shrink from it as the
 * keyboard opening, using whichever height actually moves:
 *  - Most modern mobile browsers only shrink `visualViewport.height` and
 *    leave `window.innerHeight` (the layout viewport) alone — a `fixed
 *    bottom:0` element stays pinned to the old, now keyboard-covered spot.
 *  - Some WebViews (and older browsers) instead shrink `window.innerHeight`
 *    itself, or don't expose `visualViewport` at all — there, a `fixed
 *    bottom:0` element re-pins itself to the new shorter viewport and rides
 *    up with the keyboard on its own, which reads as this exact bug.
 * Comparing both against a tracked baseline (bumped whenever height grows
 * back, e.g. keyboard closes or the address bar collapses) catches either
 * case, including devices with no `visualViewport` support.
 */
export function useKeyboardVisible() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    let lastWidth = vv?.width || window.innerWidth;
    let baselineHeight = vv?.height || window.innerHeight;

    const recheck = () => {
      const currentWidth = vv?.width || window.innerWidth;
      const currentHeight = Math.min(vv?.height || window.innerHeight, window.innerHeight);

      // Width change (e.g. rotating the device) means a new baseline, not a keyboard.
      if (Math.abs(currentWidth - lastWidth) > 30) {
        lastWidth = currentWidth;
        baselineHeight = currentHeight;
        setIsKeyboardVisible(false);
        return;
      }

      if (currentHeight > baselineHeight) {
        baselineHeight = currentHeight;
      }

      setIsKeyboardVisible(baselineHeight - currentHeight > 120);
    };

    const handleOrientationChange = () => {
      setTimeout(() => {
        lastWidth = vv?.width || window.innerWidth;
        baselineHeight = vv?.height || window.innerHeight;
        setIsKeyboardVisible(false);
      }, 150);
    };

    vv?.addEventListener("resize", recheck);
    window.addEventListener("resize", recheck);
    window.addEventListener("orientationchange", handleOrientationChange);
    return () => {
      vv?.removeEventListener("resize", recheck);
      window.removeEventListener("resize", recheck);
      window.removeEventListener("orientationchange", handleOrientationChange);
    };
  }, []);

  return isKeyboardVisible;
}

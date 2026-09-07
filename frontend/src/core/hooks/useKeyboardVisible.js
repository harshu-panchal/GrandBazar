import { useEffect, useState } from "react";

/**
 * useKeyboardVisible
 *
 * True while an on-screen keyboard is likely open — the visualViewport has
 * shrunk noticeably (150px comfortably clears scroll/URL-bar jitter, well
 * under any real keyboard height) while a text field holds focus. Use this to
 * hide a fixed bottom nav so it doesn't sit on top of the field being typed
 * into.
 */
export function useKeyboardVisible() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    const isEditableFocused = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
    };

    const recheck = () => {
      const heightDiff = window.innerHeight - viewport.height;
      setIsKeyboardVisible(heightDiff > 150 && isEditableFocused());
    };

    // focusin/focusout catch the field-change case on browsers/timings where
    // the resize event lags behind the keyboard actually opening or closing.
    const handleFocusChange = () => setTimeout(recheck, 50);

    viewport.addEventListener("resize", recheck);
    document.addEventListener("focusin", handleFocusChange);
    document.addEventListener("focusout", handleFocusChange);
    return () => {
      viewport.removeEventListener("resize", recheck);
      document.removeEventListener("focusin", handleFocusChange);
      document.removeEventListener("focusout", handleFocusChange);
    };
  }, []);

  return isKeyboardVisible;
}

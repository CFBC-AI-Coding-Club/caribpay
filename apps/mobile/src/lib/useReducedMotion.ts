import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether the OS "Reduce Motion" (iOS) / "Remove animations" (Android) setting
 * is on, kept live for the lifetime of the component.
 *
 * CaribPay leans on looping motion in several places — the settlement ripple,
 * the QR scanline, skeleton pulses, spinners. All of them are decorative
 * reinforcement of a state that is *also* stated in words, so when this returns
 * true the honest thing is to hold the final frame rather than animate toward it.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

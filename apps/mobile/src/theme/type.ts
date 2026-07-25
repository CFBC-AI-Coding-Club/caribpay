/**
 * Plus Jakarta Sans wiring.
 *
 * React Native has no synthetic font weights on Android — `fontWeight: "800"`
 * silently renders Regular unless the exact face is registered. So we map every
 * weight in the ramp to its own family name and use `font(size, weight)` instead
 * of fontWeight anywhere in the app.
 */
// Imported from per-weight subpaths, not the package root: the root index
// re-exports all 14 variants, and Metro would bundle every italic TTF we never
// use (~870 kB of dead weight in the app binary).
import { PlusJakartaSans_400Regular } from "@expo-google-fonts/plus-jakarta-sans/400Regular";
import { PlusJakartaSans_500Medium } from "@expo-google-fonts/plus-jakarta-sans/500Medium";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold";
import { PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans/700Bold";
import { PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans/800ExtraBold";
import type { TextStyle } from "react-native";

export const fontAssets = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} as const;

export type Weight = 400 | 500 | 600 | 700 | 800;

const FAMILY: Record<Weight, string> = {
  400: "PlusJakartaSans_400Regular",
  500: "PlusJakartaSans_500Medium",
  600: "PlusJakartaSans_600SemiBold",
  700: "PlusJakartaSans_700Bold",
  800: "PlusJakartaSans_800ExtraBold",
};

/** Build a text style for a given size/weight from the ramp. */
export function font(size: number, weight: Weight = 400): TextStyle {
  return { fontFamily: FAMILY[weight], fontSize: size };
}

/**
 * Tight letter-spacing for large display type. The board specifies -0.02em on
 * amounts/headings and -0.01em on screen headings; RN letterSpacing is absolute
 * points, so it scales with the size.
 */
export function tight(size: number, em = -0.02): number {
  return size * em;
}

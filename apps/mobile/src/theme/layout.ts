import { useWindowDimensions } from "react-native";

/**
 * Size classes, derived from the window rather than the device model — so a
 * phone-width iPad Split View window gets the phone layout for free, and a
 * foldable gets the right one on posture change.
 */
export type SizeClass = "compact" | "regular" | "expanded";

/**
 * The widest a single column of wallet UI should ever get. Past this, line
 * length and the distance between a row's name and its amount both stop being
 * scannable — a balance sheet stretched across an iPad is harder to read, not
 * easier. Matches how mainstream banking apps treat tablets.
 */
export const CONTENT_MAX_WIDTH = 560;

export interface Layout {
  sizeClass: SizeClass;
  /** True on anything wider than a phone; use to switch structure, not to scale. */
  isWide: boolean;
  /** Width the content column should occupy, capped on wide windows. */
  contentWidth: number;
  /** Horizontal inset that centres the column on wide windows. Zero on phones. */
  gutterInset: number;
}

export function useLayout(): Layout {
  const { width } = useWindowDimensions();

  const sizeClass: SizeClass = width < 600 ? "compact" : width < 840 ? "regular" : "expanded";
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);

  return {
    sizeClass,
    isWide: sizeClass !== "compact",
    contentWidth,
    gutterInset: Math.max(0, (width - contentWidth) / 2),
  };
}

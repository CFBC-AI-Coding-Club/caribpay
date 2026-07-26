/**
 * CaribPay design tokens, transcribed from the CaribPay Mobile UI design board.
 * This is the only place raw hex/px values live — screens and components read
 * from here so a palette change lands everywhere at once.
 */
import { Platform } from "react-native";

export const color = {
  /** Screen background. */
  bg: "#F6F5FB",
  surface: "#FFFFFF",

  // Text
  ink: "#1A1340",
  inkMuted: "#5A5578",
  inkFaint: "#6E6890",
  inkSubtle: "#9A94B8",
  /** Ink on tinted (non-white) surfaces. */
  inkOnTint: "#453F6B",

  /**
   * Royal Blue is the brand primary (fills, focus ring, gradient start). White
   * text on it is only 4.23:1, so solid buttons use `interactive` and link text
   * uses `link` — the same hue darkened ~6%, visually identical but 4.97:1/5.05:1.
   */
  primary: "#5F6CF6",
  interactive: "#5560E8",
  interactivePressed: "#4348C4",
  link: "#4F59E0",
  /** Tinted primary background for soft pills, icon chips, secondary actions. */
  primarySoft: "#F0EEFE",

  // Accents — gradient stops only, never text.
  lavender: "#D689EE",
  offWhite: "#FCE7F9",

  // Status
  success: "#0E6A4C",
  successSoft: "#E4F3EC",
  error: "#C63A3A",
  errorSoft: "#FBECEC",
  errorText: "#A03535",
  errorStrong: "#B02A2A",
  errorBorder: "#F0CFD8",
  pending: "#8A5A0F",
  pendingSoft: "#FBF1DE",
  pendingBorder: "#EBD9B4",
  /** Positive delta on the dark gradient card. */
  gainOnDark: "#C4F3E0",

  // Neutral tints
  neutralSoft: "#F0EEF7",
  segmentTrack: "#EDEBF6",
  tintRow: "#F1EFF9",
  tintPill: "#E5E2F1",

  /** Dashed outline on the "add" affordance in the Quick send row. */
  dashedBorder: "#C3BDF7",
  /** Track of an indeterminate spinner, against which `link` is the moving arc. */
  spinnerTrack: "#DAD5FB",
  /** Error text that has to stay legible on the deep/scan backgrounds. */
  errorOnDark: "#FFC2C2",

  /** Ripple wash behind the transfer status mark — `success` and `interactive` at 16%. */
  rippleSettled: "rgba(14,106,76,0.16)",
  ripplePending: "rgba(85,96,232,0.16)",

  // Borders & hairlines
  border: "rgba(26,19,64,0.10)",
  borderStrong: "rgba(26,19,64,0.14)",
  borderSoft: "rgba(26,19,64,0.08)",
  hairline: "rgba(26,19,64,0.06)",
  hairlineFaint: "rgba(26,19,64,0.05)",

  // Disabled
  disabledBg: "#D8D5E8",
  disabledText: "#8681A0",
  disabledSurface: "#F4F2FA",
  disabledSurfaceText: "#A5A0BD",

  /** iOS-style home indicator pill. */
  homeIndicator: "rgba(26,19,64,0.22)",
  homeIndicatorOnDark: "rgba(255,255,255,0.40)",

  // On-dark text (over the deep gradient)
  onDark: "#FFFFFF",
  onDarkMuted: "rgba(255,255,255,0.92)",
  onDarkFaint: "rgba(255,255,255,0.75)",
  onDarkFill: "rgba(255,255,255,0.14)",
  onDarkBorder: "rgba(255,255,255,0.22)",
} as const;

/** Deep hero gradient — the app's signature surface (135°, top-left → bottom-right). */
export const deepGradient = {
  colors: ["#460D2C", "#181136", "#1E1A76"] as const,
  locations: [0, 0.4, 1] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

/** Logo gradient — accent washes and brand marks. */
export const brandGradient = {
  colors: ["#5F6CF6", "#8A7BF2", "#D689EE", "#FCE7F9"] as const,
  locations: [0, 0.3, 0.65, 1] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

/** Type ramp. 11 is the floor — nothing smaller ships. */
export const fontSize = {
  pill: 11,
  label: 12,
  small: 13,
  body: 15,
  title: 17,
  heading: 20,
  hero: 24,
  amount: 31,
  display: 40,
} as const;

/** 4pt grid. Screen gutter is 22. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  gutter: 22,
} as const;

export const radius = {
  sm: 8,
  chip: 12,
  field: 14,
  card: 16,
  cardLg: 20,
  sheet: 24,
  pill: 999,
} as const;

/**
 * Minimum touch target. Apple's floor is 44pt; Material's is 48dp — so this is
 * platform-aware rather than a single number, and Android is not shipped a
 * target that is legal on iOS but undersized on the hardware most of our users
 * actually hold.
 */
export const TOUCH_TARGET = Platform.select({ ios: 44, default: 48 });

/** Targets sit at least 8pt apart; hit slop makes up the difference for small glyphs. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/** Avatar/flag diameter in a list row. A visual dimension, not a touch target. */
export const AVATAR_SIZE = 44;

/**
 * Shadows. RN needs iOS (shadow*) and Android (elevation) spelled separately;
 * these mirror the board's box-shadows as closely as the platforms allow.
 */
export const shadow = {
  /** Cards and list containers: 0 2px 8px rgba(26,19,64,0.04) */
  card: {
    shadowColor: "#1A1340",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  /** Raised panels: 0 2px 10px rgba(26,19,64,0.05) */
  panel: {
    shadowColor: "#1A1340",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  /** Round icon buttons: 0 2px 6px rgba(26,19,64,0.06) */
  control: {
    shadowColor: "#1A1340",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  /** Quick-action tiles: 0 4px 12px rgba(26,19,64,0.06) */
  tile: {
    shadowColor: "#1A1340",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  /** Primary button glow: 0 12px 24px -8px rgba(85,96,232,0.55) */
  primary: {
    shadowColor: "#5560E8",
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  /** The gradient balance card: 0 16px 30px -12px rgba(85,96,232,0.5) */
  hero: {
    shadowColor: "#5560E8",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;

/** Tabular figures — every amount, address, and timestamp uses these. */
export const TABULAR = { fontVariant: ["tabular-nums" as const] };

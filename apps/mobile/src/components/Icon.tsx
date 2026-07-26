/**
 * The CaribPay icon set, transcribed from the design board's inline SVGs.
 *
 * Every glyph is drawn on a 24×24 grid with `stroke="currentColor"`, no fill,
 * and round caps/joins — so an icon inherits its colour from the `color` prop
 * and its optical weight from `strokeWidth`. Keep new glyphs on the same grid.
 */
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { color as palette } from "@/theme";

/** Paths for each glyph. A tuple lets one icon combine several sub-paths. */
const PATHS = {
  chevronLeft: ["M15 5 L8 12 L15 19"],
  chevronRight: ["M9 5 L16 12 L9 19"],
  chevronDown: ["M6 9 L12 15 L18 9"],
  close: ["M7 7 L17 17", "M17 7 L7 17"],
  plus: ["M12 6 V18", "M6 12 H18"],
  check: ["M5 12 L10 17 L19 7"],
  checkWide: ["M4 12 L10 18 L20 6"],
  checkBold: ["M5 12.5 L10 17.5 L19 7"],

  /** Outgoing money — arrow leaving to the top-right. */
  send: ["M7 17 L17 7", "M9 7 H17 V15"],
  /** Incoming money — arrow arriving at the bottom-left. */
  receive: ["M17 7 L7 17", "M15 17 H7 V9"],
  /** Two arrows passing — the "transfers/activity" glyph. */
  activity: ["M5 8.5 H18.5", "M15 5 L18.5 8.5 L15 12", "M19 15.5 H5.5", "M9 12 L5.5 15.5 L9 19"],
  /** Tighter swap used inside the FX converter divider. */
  swap: ["M6 9 H18 L15 6", "M18 15 H6 L9 18"],

  home: ["M3.5 11 L12 3.8 L20.5 11", "M5.5 9.5 V20.2 H18.5 V9.5"],
  scan: [
    "M4 8.5 V5.5 A1.5 1.5 0 0 1 5.5 4 H8",
    "M20 8.5 V5.5 A1.5 1.5 0 0 0 18.5 4 H16",
    "M4 15.5 V18.5 A1.5 1.5 0 0 0 5.5 20 H8",
    "M20 15.5 V18.5 A1.5 1.5 0 0 1 18.5 20 H16",
    "M4 12 H20",
  ],
  bell: ["M6 9 A6 6 0 0 1 18 9 C18 14 20 16 20 16 H4 C4 16 6 14 6 9Z", "M10 19 A2 2 0 0 0 14 19"],
  mail: ["M4 7 L12 13 L20 7"],
  lock: ["M8 10.5 V8 A4 4 0 0 1 16 8 V10.5"],
  eye: ["M2 12 C4.5 7 8 5 12 5 C16 5 19.5 7 22 12 C19.5 17 16 19 12 19 C8 19 4.5 17 2 12Z"],
  eyeOff: [
    "M2 12 C4.5 7 8 5 12 5 C16 5 19.5 7 22 12 C19.5 17 16 19 12 19 C8 19 4.5 17 2 12Z",
    "M4 20 L20 4",
  ],
  search: ["M16 16 L20 20"],
  filter: ["M4 7 H20 M7 12 H17 M10 17 H14"],
  copy: ["M15 6.5 A2.5 2.5 0 0 0 12.5 4 H6.5 A2.5 2.5 0 0 0 4 6.5 V13"],
  share: ["M8 12 L16 8 M8 12 L16 16"],
  note: ["M4 5 H20 V16 H13 L9 20 V16 H4 Z"],
  backspace: ["M10 6 H20 A1 1 0 0 1 21 7 V17 A1 1 0 0 1 20 18 H10 L3 12 Z", "M13 10 L17 14 M17 10 L13 14"],
  clock: ["M12 7.5 V12 L15.5 14"],
  warning: ["M12 4 L21 19 H3 Z", "M12 10 V14"],
  info: ["M12 11 V16"],
  help: ["M9.6 9.5 A2.5 2.5 0 1 1 12 13 V14.2"],
  logout: [
    "M14 6 H18 A1.5 1.5 0 0 1 19.5 7.5 V16.5 A1.5 1.5 0 0 1 18 18 H14",
    "M11 8.5 L7.5 12 L11 15.5",
    "M7.5 12 H15",
  ],
  pencil: ["M4 20 L8 19 L19.5 7.5 A2.1 2.1 0 0 0 16.5 4.5 L5 16 Z"],
  user: ["M5 19.5 C5 15.6 8.2 13.8 12 13.8 C15.8 13.8 19 15.6 19 19.5"],
  people: [
    "M3.5 19 C3.5 15.4 6 14 9 14 C12 14 14.5 15.4 14.5 19",
    "M15.5 5.3 A3 3 0 0 1 15.5 10.7",
    "M16.6 14.2 C18.9 14.8 20.5 16.2 20.5 19",
  ],
  peopleAdd: [
    "M3.6 19.5 C3.6 15.5 6.5 13.6 10 13.6 C13.5 13.6 16.4 15.5 16.4 19.5",
    "M18.5 8 V13 M16 10.5 H21",
  ],
  /** Empty-state chest for "no transactions". */
  archive: ["M4 7 H20 V18 A2 2 0 0 1 18 20 H6 A2 2 0 0 1 4 18 Z", "M4 7 L7 4 H17 L20 7", "M9 12 H15"],
  /** Deposit / top-up. */
  deposit: ["M12 19 V5 M5 12 L12 19 L19 12"],
  torch: [
    "M12 4 V6 M12 18 V20 M4 12 H6 M18 12 H20 M6.5 6.5 L8 8 M16 16 L17.5 17.5 M17.5 6.5 L16 8 M8 16 L6.5 17.5",
  ],
  image: ["M3.5 15 L8.5 10.5 L13 14.5 L16 12 L20.5 16"],
  shieldCheck: ["M12 3.5 L19 6 V12 C19 16.2 15.9 19.4 12 20.5 C8.1 19.4 5 16.2 5 12 V6 Z"],
  arrowRight: ["M4 12 H19", "M13 6 L19 12 L13 18"],
  /** A rate that moved in the payee's favour, and one that did not. */
  trendUp: ["M4 16.5 L10 10.5 L13.5 14 L20 7.5", "M15 7.5 H20 V12.5"],
  trendDown: ["M4 7.5 L10 13.5 L13.5 10 L20 16.5", "M15 16.5 H20 V11.5"],
} as const;

/** Extra shapes some glyphs need beyond a stroked path. */
const EXTRAS: Partial<Record<IconName, React.ReactNode>> = {
  mail: <Rect x={3} y={5} width={18} height={14} rx={3} />,
  lock: <Rect x={4.5} y={10.5} width={15} height={9.5} rx={2.5} />,
  eye: <Circle cx={12} cy={12} r={3} />,
  eyeOff: <Circle cx={12} cy={12} r={3} />,
  search: <Circle cx={11} cy={11} r={6.5} />,
  copy: <Rect x={9} y={9} width={11} height={11} rx={2.5} />,
  clock: <Circle cx={12} cy={12} r={8.5} />,
  info: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Circle cx={12} cy={7.8} r={0.9} fill="currentColor" stroke="none" />
    </>
  ),
  help: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Circle cx={12} cy={17} r={0.9} fill="currentColor" stroke="none" />
    </>
  ),
  warning: <Circle cx={12} cy={16.6} r={0.8} fill="currentColor" stroke="none" />,
  user: <Circle cx={12} cy={8} r={3.4} />,
  people: <Circle cx={9} cy={8} r={3.2} />,
  peopleAdd: <Circle cx={10} cy={8.5} r={3.6} />,
  share: (
    <>
      <Circle cx={18} cy={7} r={2.5} />
      <Circle cx={18} cy={17} r={2.5} />
      <Circle cx={6} cy={12} r={2.5} />
    </>
  ),
  torch: <Circle cx={12} cy={12} r={3.5} />,
  image: <Rect x={3.5} y={5} width={17} height={14} rx={2.5} />,
  shieldCheck: <Path d="M8.8 12 L11.2 14.4 L15.4 10" strokeWidth={2.4} />,
  /** The "wallet/card" glyph is a card outline with a magstripe. */
  card: (
    <>
      <Rect x={3} y={6} width={18} height={13} rx={3} />
      <Path d="M3 10.5 H21" />
    </>
  ),
  /** Menu is a 2×2 grid of squares. */
  grid: (
    <G>
      <Rect x={4} y={4} width={6.5} height={6.5} rx={1.7} />
      <Rect x={13.5} y={4} width={6.5} height={6.5} rx={1.7} />
      <Rect x={4} y={13.5} width={6.5} height={6.5} rx={1.7} />
      <Rect x={13.5} y={13.5} width={6.5} height={6.5} rx={1.7} />
    </G>
  ),
};

export type IconName = keyof typeof PATHS | "card" | "grid";

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({
  name,
  size = 20,
  color: stroke = palette.ink,
  strokeWidth = 1.9,
}: IconProps) {
  const paths: readonly string[] = name in PATHS ? PATHS[name as keyof typeof PATHS] : [];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      // `color` is what react-native-svg resolves `currentColor` against, so the
      // filled dots inside EXTRAS track the icon colour too.
      color={stroke}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {EXTRAS[name]}
      {paths.map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  );
}

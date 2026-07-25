/**
 * Circular country flags for the six markets CaribPay covers, transcribed from
 * the design board's `Flag` component. Each is drawn on a 48×48 grid and
 * clipped to a circle with a 1px inset ring so light flags (US, VC) still read
 * as a disc on a white card.
 */
import { View } from "react-native";
import Svg, { Circle, G, Path, Polygon, Rect } from "react-native-svg";
import type { Currency, FlagCountry } from "@caribpay/shared";
import { flagCountryFor } from "@caribpay/shared";

const FLAGS: Record<FlagCountry, React.ReactNode> = {
  KN: (
    <>
      <Rect width={48} height={48} fill="#009739" />
      <Polygon points="48,18 48,48 18,48" fill="#CE1126" />
      <Polygon points="0,28 20,48 48,20 28,0" fill="#FFD100" />
      <Polygon points="0,34 14,48 48,14 34,0" fill="#000000" />
      <Path
        d="M0,-5 L1.1,-1.5 4.8,-1.5 1.8,0.6 2.9,4.1 0,1.9 -2.9,4.1 -1.8,0.6 -4.8,-1.5 -1.1,-1.5Z"
        transform="translate(16,32)"
        fill="#FFFFFF"
      />
      <Path
        d="M0,-5 L1.1,-1.5 4.8,-1.5 1.8,0.6 2.9,4.1 0,1.9 -2.9,4.1 -1.8,0.6 -4.8,-1.5 -1.1,-1.5Z"
        transform="translate(32,16)"
        fill="#FFFFFF"
      />
    </>
  ),
  JM: (
    <>
      <Rect width={48} height={48} fill="#FCD116" />
      <Polygon points="0,3 21,24 0,45" fill="#000000" />
      <Polygon points="48,3 27,24 48,45" fill="#000000" />
      <Polygon points="3,0 24,21 45,0" fill="#009B3A" />
      <Polygon points="3,48 24,27 45,48" fill="#009B3A" />
    </>
  ),
  BB: (
    <>
      <Rect width={16} height={48} fill="#00267F" />
      <Rect x={16} width={16} height={48} fill="#FFC726" />
      <Rect x={32} width={16} height={48} fill="#00267F" />
      <G fill="#000000">
        <Polygon points="24,8 21,17 27,17" />
        <Rect x={22.8} y={15} width={2.4} height={22} />
        <Rect x={18.5} y={20.5} width={11} height={2.4} />
      </G>
      <G fill="none" stroke="#000000" strokeWidth={2.2} strokeLinecap="round">
        <Path d="M19.5 21 C18 17 18 14 18.6 12" />
        <Path d="M28.5 21 C30 17 30 14 29.4 12" />
      </G>
    </>
  ),
  TT: (
    <>
      <Rect width={48} height={48} fill="#CE1126" />
      <Polygon points="0,14 14,0 48,34 34,48" fill="#FFFFFF" />
      <Polygon points="0,21 21,0 48,27 27,48" fill="#000000" />
    </>
  ),
  VC: (
    <>
      <Rect width={12} height={48} fill="#003DA5" />
      <Rect x={12} width={24} height={48} fill="#FCD116" />
      <Rect x={36} width={12} height={48} fill="#078930" />
      <G fill="#078930">
        <Rect x={16.5} y={17.5} width={7} height={7} transform="rotate(45 20 21)" />
        <Rect x={24.5} y={17.5} width={7} height={7} transform="rotate(45 28 21)" />
        <Rect x={20.5} y={25.5} width={7} height={7} transform="rotate(45 24 29)" />
      </G>
    </>
  ),
  US: (
    <>
      <Rect width={48} height={48} fill="#FFFFFF" />
      <G fill="#B22234">
        {[0, 7.4, 14.8, 22.2, 29.6, 37, 44.3].map((y) => (
          <Rect key={y} y={y} width={48} height={3.7} />
        ))}
      </G>
      <Rect width={21} height={20} fill="#3C3B6E" />
      <G fill="#FFFFFF">
        {[
          [4.5, 4.5],
          [10.5, 4.5],
          [16.5, 4.5],
          [7.5, 10],
          [13.5, 10],
          [4.5, 15.5],
          [10.5, 15.5],
          [16.5, 15.5],
        ].map(([cx, cy]) => (
          <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.2} />
        ))}
      </G>
    </>
  ),
};

export interface FlagProps {
  /** ISO country code. Codes without a designed flag fall back via `currency`. */
  country?: string | null;
  /** Used to pick a representative flag when `country` is unknown. */
  currency?: Currency;
  size?: number;
}

export function Flag({ country, currency = "XCD", size = 24 }: FlagProps) {
  const code = flagCountryFor(country, currency);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 48 48">
        {FLAGS[code]}
        {/* Inset hairline so pale flags keep a visible edge on white. */}
        <Circle cx={24} cy={24} r={23.5} fill="none" stroke="rgba(14,27,46,0.14)" strokeWidth={1} />
      </Svg>
    </View>
  );
}

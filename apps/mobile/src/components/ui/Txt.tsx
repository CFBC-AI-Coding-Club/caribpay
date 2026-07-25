import { Text, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { color as palette, font, TABULAR, type Weight } from "@/theme";

export interface TxtProps extends Omit<TextProps, "style"> {
  size?: number;
  weight?: Weight;
  color?: string;
  /** Tabular figures — use for money, addresses, timestamps, rates. */
  tabular?: boolean;
  /** Negative tracking for display type, in em (design uses -0.01 / -0.02). */
  tracking?: number;
  align?: TextStyle["textAlign"];
  /** Multiplier applied to size; the board's body copy sits around 1.45–1.5. */
  leading?: number;
  style?: StyleProp<TextStyle>;
}

/**
 * Every piece of text in the app goes through here so it picks up the right
 * Plus Jakarta Sans face — React Native will not synthesise weights on Android.
 */
export function Txt({
  size = 15,
  weight = 500,
  color = palette.ink,
  tabular = false,
  tracking,
  align,
  leading,
  style,
  ...rest
}: TxtProps) {
  return (
    <Text
      style={[
        font(size, weight),
        { color },
        tabular && TABULAR,
        tracking !== undefined && { letterSpacing: size * tracking },
        align !== undefined && { textAlign: align },
        leading !== undefined && { lineHeight: size * leading },
        style,
      ]}
      {...rest}
    />
  );
}

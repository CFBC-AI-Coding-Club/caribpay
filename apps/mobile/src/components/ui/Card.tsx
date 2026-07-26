import type { ReactNode } from "react";
import { Image, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { color, deepGradient, radius, shadow, space } from "@/theme";

/** White surface with the standard card shadow. */
export function Card({
  children,
  style,
  padded = true,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <View
      style={[
        {
          backgroundColor: color.surface,
          borderRadius: radius.card,
          padding: padded ? 14 : 0,
        },
        shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );
  if (onPress === undefined) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {body}
    </Pressable>
  );
}

/**
 * The deep-gradient hero card — total balance, wallet balance, menu profile.
 * The watermark is the logo mark bled off the top-right corner at low opacity.
 */
export function GradientCard({
  children,
  style,
  watermark = true,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  watermark?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <LinearGradient
      colors={[...deepGradient.colors]}
      locations={[...deepGradient.locations]}
      start={deepGradient.start}
      end={deepGradient.end}
      style={[
        {
          borderRadius: radius.cardLg,
          padding: space.gutter,
          overflow: "hidden",
        },
        shadow.hero,
        style,
      ]}
    >
      {watermark && (
        <Image
          accessibilityIgnoresInvertColors
          source={require("../../../assets/logo-mark.png")}
          style={{
            position: "absolute",
            right: -30,
            top: -28,
            width: 160,
            height: 160,
            opacity: 0.15,
          }}
          resizeMode="contain"
        />
      )}
      {children}
    </LinearGradient>
  );
  if (onPress === undefined) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.92 }}>
      {body}
    </Pressable>
  );
}

/**
 * A white container whose children are separated by hairlines — the detail
 * tables on Review, Transfer detail, Profile, and Menu.
 */
export function RowGroup({
  children,
  style,
  paddingHorizontal = 18,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  paddingHorizontal?: number;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: color.surface,
          borderRadius: radius.cardLg,
          paddingHorizontal,
        },
        shadow.panel,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Card chrome for a row rendered inside a virtualized list.
 *
 * A `Card` cannot wrap a group of rows once the list is virtualized — the rows
 * are siblings, not children — so each row carries the part of the card it sits
 * on: the first row rounds the top, the last rounds the bottom, and every row
 * paints the surface. Visually identical to a wrapping Card.
 */
export function groupedRowStyle(index: number, total: number): ViewStyle {
  const first = index === 0;
  const last = index === total - 1;
  return {
    backgroundColor: color.surface,
    paddingHorizontal: 14,
    borderTopLeftRadius: first ? radius.card : 0,
    borderTopRightRadius: first ? radius.card : 0,
    borderBottomLeftRadius: last ? radius.card : 0,
    borderBottomRightRadius: last ? radius.card : 0,
  };
}

/** One line of a RowGroup. `last` drops the divider. */
export function Row({
  children,
  last = false,
  onPress,
  paddingVertical = 14,
}: {
  children: ReactNode;
  last?: boolean;
  onPress?: () => void;
  paddingVertical?: number;
}) {
  const body = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space.md,
        paddingVertical,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: last ? "transparent" : color.hairline,
      }}
    >
      {children}
    </View>
  );
  if (onPress === undefined) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {body}
    </Pressable>
  );
}

import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { color, space } from "@/theme";
import { Txt } from "./Txt";

/**
 * A leading-visual / title+subtitle / trailing row. Every list in the app
 * (wallets, transactions, contacts, menu) is this shape, so keeping it in one
 * place is what makes those lists look like siblings.
 */
export function ListRow({
  leading,
  title,
  subtitle,
  /** Extra node beside the subtitle, e.g. the HOME wallet tag. */
  subtitleAccessory,
  trailing,
  onPress,
  divider = false,
  paddingVertical = 12,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  subtitleAccessory?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  divider?: boolean;
  paddingVertical?: number;
}) {
  const body = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingVertical,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: color.hairlineFaint,
      }}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={15} weight={700} numberOfLines={1}>
          {title}
        </Txt>
        {(subtitle !== undefined || subtitleAccessory !== undefined) && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            {subtitle !== undefined && (
              <Txt size={12} weight={500} color={color.inkMuted} numberOfLines={1}>
                {subtitle}
              </Txt>
            )}
            {subtitleAccessory}
          </View>
        )}
      </View>
      {trailing}
    </View>
  );

  if (onPress === undefined) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {body}
    </Pressable>
  );
}

/** Uppercase section label above a group — "TODAY", "ALREADY OPEN". */
export function SectionLabel({ children, style }: { children: string; style?: object }) {
  return (
    <Txt
      size={11}
      weight={700}
      color={color.inkFaint}
      style={[{ letterSpacing: 0.9, textTransform: "uppercase" }, style]}
    >
      {children}
    </Txt>
  );
}

/** Left-aligned section heading with an optional trailing action. */
export function SectionHeader({
  title,
  action,
  onAction,
  meta,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  meta?: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: space.md,
      }}
    >
      <Txt size={17} weight={800}>
        {title}
      </Txt>
      {action !== undefined ? (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button">
          <Txt size={13} weight={600} color={color.link}>
            {action}
          </Txt>
        </Pressable>
      ) : meta !== undefined ? (
        <Txt size={12} weight={600} color={color.inkMuted}>
          {meta}
        </Txt>
      ) : null}
    </View>
  );
}

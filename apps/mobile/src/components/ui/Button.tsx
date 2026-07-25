import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { color, radius, shadow, space } from "@/theme";
import { Icon, type IconName } from "@/components/Icon";
import { Txt } from "./Txt";

export type ButtonVariant =
  | "primary"
  /** White with a hairline border. */
  | "secondary"
  /** Transparent, ink label — for the lower-priority action in a stack. */
  | "ghost"
  /** White with a red label — destructive but not alarming. */
  | "danger"
  /** White label on the deep gradient; used on Welcome / Scan. */
  | "onDark"
  /** Solid white on the deep gradient — the primary action there. */
  | "onDarkPrimary"
  /** Transparent with a light label, for the low-priority action on dark. */
  | "onDarkGhost";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** 52pt is the default full-width action; 48 for inline/paired buttons. */
  height?: number;
  style?: StyleProp<ViewStyle>;
}

interface Skin {
  bg: string;
  pressedBg: string;
  fg: string;
  border?: string;
  shadow?: object;
}

const SKINS: Record<ButtonVariant, Skin> = {
  primary: {
    bg: color.interactive,
    pressedBg: color.interactivePressed,
    fg: color.onDark,
    shadow: shadow.primary,
  },
  secondary: {
    bg: color.surface,
    pressedBg: color.segmentTrack,
    fg: color.ink,
    border: color.borderStrong,
  },
  ghost: { bg: "transparent", pressedBg: color.neutralSoft, fg: color.inkMuted },
  danger: {
    bg: color.surface,
    pressedBg: color.errorSoft,
    fg: color.errorStrong,
    border: "rgba(198,58,58,0.35)",
  },
  onDark: {
    bg: color.onDarkFill,
    pressedBg: "rgba(255,255,255,0.24)",
    fg: color.onDark,
    border: color.onDarkBorder,
  },
  onDarkPrimary: { bg: color.onDark, pressedBg: color.segmentTrack, fg: color.link },
  onDarkGhost: {
    bg: "transparent",
    pressedBg: "rgba(255,255,255,0.12)",
    fg: color.onDarkMuted,
  },
};

/**
 * The one button in the app. Press darkens one step and never scales; disabled
 * drops the shadow so it stops reading as raised.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
  height = 52,
  style,
}: ButtonProps) {
  const skin = SKINS[variant];
  const inert = disabled || loading;
  const solid = variant === "primary";

  const bg = disabled ? (solid ? color.disabledBg : color.disabledSurface) : skin.bg;
  const fg = disabled ? (solid ? color.disabledText : color.disabledSurfaceText) : skin.fg;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      accessibilityLabel={label}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height,
          borderRadius: radius.card,
          backgroundColor: pressed && !inert ? skin.pressedBg : bg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space.sm,
          paddingHorizontal: space.xxl,
        },
        skin.border !== undefined && {
          borderWidth: 1,
          borderColor: disabled ? color.borderSoft : skin.border,
        },
        // The glow reads as "raised", so it drops on press and when disabled.
        skin.shadow !== undefined && !disabled && !pressed ? skin.shadow : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon !== undefined && <Icon name={icon} size={18} color={fg} strokeWidth={2.2} />}
          <Txt size={height >= 52 ? 17 : 15} weight={700} color={fg}>
            {label}
          </Txt>
        </>
      )}
    </Pressable>
  );
}

/** 44pt circular icon button — back, notifications, share, close. */
export function IconButton({
  icon,
  onPress,
  color: fg = color.ink,
  background = color.surface,
  accessibilityLabel,
  size = 44,
  strokeWidth = 2.2,
  elevated = true,
  badge = false,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  background?: string;
  accessibilityLabel: string;
  size?: number;
  strokeWidth?: number;
  elevated?: boolean;
  badge?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? color.segmentTrack : background,
        },
        elevated && shadow.control,
      ]}
    >
      <Icon name={icon} size={size * 0.48} color={fg} strokeWidth={strokeWidth} />
      {badge && (
        <View
          style={{
            position: "absolute",
            top: 10,
            right: 11,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color.error,
            borderWidth: 2,
            borderColor: color.surface,
          }}
        />
      )}
    </Pressable>
  );
}

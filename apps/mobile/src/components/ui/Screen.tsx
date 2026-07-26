import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { color, deepGradient, radius, space, useLayout } from "@/theme";
import { IconButton } from "./Button";
import { Txt } from "./Txt";

/**
 * Screen chrome: safe-area padding, the right status-bar style for the
 * background, and the deep gradient when a screen calls for it.
 */
export function Screen({
  children,
  dark = false,
  /** Paint the whole screen with the deep hero gradient. */
  gradient = false,
  background,
  style,
  edges = { top: true, bottom: true },
}: {
  children: ReactNode;
  dark?: boolean;
  gradient?: boolean;
  background?: string;
  style?: StyleProp<ViewStyle>;
  edges?: { top?: boolean; bottom?: boolean };
}) {
  const insets = useSafeAreaInsets();
  const { gutterInset } = useLayout();
  const pad = {
    paddingTop: edges.top === false ? 0 : insets.top,
    // Side insets keep content off a landscape notch; on a wide window they also
    // centre the column instead of stretching it across a tablet.
    paddingLeft: Math.max(insets.left, gutterInset),
    paddingRight: Math.max(insets.right, gutterInset),
    paddingBottom: edges.bottom === false ? 0 : insets.bottom,
  };
  const body = <View style={[{ flex: 1 }, pad, style]}>{children}</View>;

  return (
    <>
      <StatusBar style={dark || gradient ? "light" : "dark"} />
      {gradient ? (
        <LinearGradient
          colors={[...deepGradient.colors]}
          locations={[...deepGradient.locations]}
          start={deepGradient.start}
          end={deepGradient.end}
          style={{ flex: 1 }}
        >
          {body}
        </LinearGradient>
      ) : (
        <View style={{ flex: 1, backgroundColor: background ?? (dark ? color.ink : color.bg) }}>
          {body}
        </View>
      )}
    </>
  );
}

/**
 * Centred screen title with an optional back affordance and trailing control.
 * The spacer keeps the title optically centred when there is no trailing item.
 */
export function ScreenHeader({
  title,
  onBack,
  backIcon = "chevronLeft",
  trailing,
  onDark = false,
}: {
  title?: string;
  onBack?: (() => void) | false;
  backIcon?: "chevronLeft" | "close";
  trailing?: ReactNode;
  onDark?: boolean;
}) {
  const router = useRouter();
  const showBack = onBack !== false;
  const fg = onDark ? color.onDark : color.ink;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: space.xl,
        paddingTop: space.xs,
        paddingBottom: space.sm,
      }}
    >
      {showBack ? (
        <IconButton
          icon={backIcon}
          accessibilityLabel="Go back"
          onPress={onBack === undefined ? () => router.back() : onBack}
          color={fg}
          background={onDark ? color.onDarkFill : color.surface}
          elevated={!onDark}
          strokeWidth={backIcon === "close" ? 2.4 : 2.2}
        />
      ) : (
        <View style={{ width: 44 }} />
      )}
      {title !== undefined && (
        <Txt size={17} weight={700} color={fg} numberOfLines={1} style={{ flex: 1 }} align="center">
          {title}
        </Txt>
      )}
      <View style={{ width: 44, alignItems: "flex-end" }}>{trailing}</View>
    </View>
  );
}

/**
 * Deep-gradient header with the content rising over it on a rounded sheet.
 * Used by Login, Register, and Profile.
 */
export function SheetScreen({
  header,
  children,
  contentStyle,
}: {
  header: ReactNode;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const { gutterInset } = useLayout();
  const sides = {
    paddingLeft: Math.max(insets.left, gutterInset),
    paddingRight: Math.max(insets.right, gutterInset),
  };
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[...deepGradient.colors]}
        locations={[...deepGradient.locations]}
        start={deepGradient.start}
        end={deepGradient.end}
        style={{ paddingTop: insets.top, paddingBottom: 54 }}
      >
        <View style={sides}>{header}</View>
      </LinearGradient>
      <View
        style={[
          {
            flex: 1,
            backgroundColor: color.bg,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            marginTop: -32,
          },
          sides,
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

/** The iOS home-indicator pill the board draws at the foot of every screen. */
export function HomeIndicator({ onDark = false }: { onDark?: boolean }) {
  const insets = useSafeAreaInsets();
  // Devices with a real gesture bar draw their own; only render the stand-in
  // when the OS is not already reserving space for one.
  if (insets.bottom > 0) return <View style={{ height: space.sm }} />;
  return (
    <View style={{ alignItems: "center", paddingTop: space.sm, paddingBottom: 10 }}>
      <View
        style={{
          width: 134,
          height: 5,
          borderRadius: 3,
          backgroundColor: onDark ? color.homeIndicatorOnDark : color.homeIndicator,
        }}
      />
    </View>
  );
}

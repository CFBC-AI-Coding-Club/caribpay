import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Easing, View, type StyleProp, type ViewStyle } from "react-native";
import { color, radius, space } from "@/theme";
import { Icon, type IconName } from "@/components/Icon";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { Button } from "./Button";
import { Txt } from "./Txt";

/** Centred illustration + copy + optional action. Used for every empty screen. */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  actionIcon,
  tone = "primary",
}: {
  icon: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: IconName;
  tone?: "primary" | "muted";
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 44,
        gap: space.sm,
      }}
    >
      <Icon
        name={icon}
        size={58}
        color={tone === "primary" ? color.link : color.inkFaint}
        strokeWidth={1.4}
      />
      <Txt size={20} weight={800} tracking={-0.01} align="center" style={{ marginTop: space.md }}>
        {title}
      </Txt>
      <Txt size={13} weight={500} color={color.inkMuted} align="center" leading={1.5} style={{ maxWidth: 250 }}>
        {body}
      </Txt>
      {actionLabel !== undefined && (
        <Button
          label={actionLabel}
          icon={actionIcon}
          onPress={onAction}
          style={{ marginTop: space.md, alignSelf: "center", paddingHorizontal: space.xxl }}
        />
      )}
    </View>
  );
}

/** Full-screen error with a retry. */
export function ErrorState({
  title = "Something went wrong",
  body,
  onRetry,
}: {
  title?: string;
  body: string;
  onRetry?: () => void;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 40,
        gap: space.sm,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: color.errorSoft,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: space.xs,
        }}
      >
        <Icon name="warning" size={34} color={color.error} strokeWidth={1.9} />
      </View>
      <Txt size={20} weight={800} align="center">
        {title}
      </Txt>
      <Txt size={13} weight={500} color={color.inkMuted} align="center" leading={1.5} style={{ maxWidth: 260 }}>
        {body}
      </Txt>
      {onRetry !== undefined && (
        <Button label="Try again" onPress={onRetry} style={{ marginTop: space.md }} />
      )}
    </View>
  );
}

/** Inline notice — the "rate moved" and "transfer failed" callouts. */
export function Notice({
  tone,
  title,
  body,
  reference,
  icon,
}: {
  tone: "pending" | "error" | "primary";
  title: string;
  body: string;
  /** Machine-readable error code, shown small so support can quote it. */
  reference?: string;
  icon?: IconName;
}) {
  const skin = {
    pending: { bg: color.pendingSoft, border: color.pendingBorder, fg: color.pending, body: color.pending },
    error: { bg: color.errorSoft, border: color.errorBorder, fg: color.errorStrong, body: color.errorText },
    primary: { bg: color.primarySoft, border: "transparent", fg: color.link, body: color.link },
  }[tone];
  const glyph: IconName = icon ?? (tone === "error" ? "warning" : tone === "pending" ? "clock" : "info");

  return (
    <View
      style={{
        backgroundColor: skin.bg,
        borderWidth: skin.border === "transparent" ? 0 : 1,
        borderColor: skin.border,
        borderRadius: radius.card,
        padding: 14,
        flexDirection: "row",
        gap: space.md,
        alignItems: "flex-start",
      }}
    >
      <Icon name={glyph} size={19} color={skin.fg} strokeWidth={1.9} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={13} weight={800} color={skin.fg}>
          {title}
        </Txt>
        <Txt size={13} weight={500} color={skin.body} leading={1.45}>
          {body}
        </Txt>
        {reference !== undefined && (
          <Txt size={11} weight={600} color={skin.body} tabular style={{ marginTop: space.sm }}>
            Ref {reference}
          </Txt>
        )}
      </View>
    </View>
  );
}

/** Pulsing placeholder block for loading lists. */
export function Skeleton({
  width,
  height,
  radius: r = radius.sm,
  style,
}: {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0.5)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    // Reduce Motion: hold a steady mid-opacity block. It still reads as
    // "content is loading here" without the pulse.
    if (reducedMotion) {
      pulse.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: r, backgroundColor: color.tintRow, opacity: pulse },
        style,
      ]}
    />
  );
}

/** Centred spinner for whole-screen loads. */
export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.md }}>
      <ActivityIndicator color={color.interactive} size="large" />
      {label !== undefined && (
        <Txt size={13} weight={500} color={color.inkMuted}>
          {label}
        </Txt>
      )}
    </View>
  );
}

import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { color, space } from "@/theme";
import { Icon } from "@/components/Icon";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { Txt } from "./Txt";

export type StepState = "done" | "active" | "upcoming" | "failed";

export interface Step {
  label: string;
  /** Timestamp, or a status line like "Clearing across the region…". */
  detail?: string;
  state: StepState;
}

/** Indeterminate ring for the in-flight step. */
function Spinner({ size = 28 }: { size?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin, reducedMotion]);

  // Reduce Motion: a static two-tone ring. The step's label already says
  // "Pending settlement", so nothing is communicated by the rotation alone.
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 3,
        borderColor: color.spinnerTrack,
        borderTopColor: color.link,
        transform: reducedMotion
          ? []
          : [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
      }}
    />
  );
}

function Marker({ state, size }: { state: StepState; size: number }) {
  if (state === "active") return <Spinner size={size} />;
  if (state === "upcoming") {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: "rgba(26,19,64,0.18)",
          backgroundColor: color.bg,
        }}
      />
    );
  }
  const failed = state === "failed";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: failed ? color.error : color.success,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon
        name={failed ? "close" : "check"}
        size={size * 0.54}
        color={color.onDark}
        strokeWidth={3}
      />
    </View>
  );
}

/**
 * The settlement progress rail: initiated → pending settlement → settled/failed.
 * Connector colour reflects the step *above* it, so a failed leg shows the
 * break in the chain.
 */
export function Timeline({ steps, markerSize = 28 }: { steps: Step[]; markerSize?: number }) {
  return (
    <View>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const next = steps[index + 1];
        const connector =
          step.state === "done" && next?.state === "failed"
            ? color.errorBorder
            : step.state === "done"
              ? color.success
              : "rgba(26,19,64,0.12)";

        const labelColor =
          step.state === "failed"
            ? color.error
            : step.state === "active"
              ? color.link
              : step.state === "upcoming"
                ? color.inkFaint
                : color.ink;

        return (
          <View key={step.label} style={{ flexDirection: "row", gap: 14 }}>
            <View style={{ alignItems: "center" }}>
              <Marker state={step.state} size={markerSize} />
              {!last && <View style={{ width: 2, flex: 1, minHeight: 20, backgroundColor: connector }} />}
            </View>
            <View style={{ paddingBottom: last ? 0 : space.xl, flex: 1 }}>
              <Txt size={15} weight={700} color={labelColor}>
                {step.label}
              </Txt>
              {step.detail !== undefined && (
                <Txt
                  size={12}
                  weight={500}
                  color={step.state === "upcoming" ? color.inkFaint : color.inkMuted}
                  tabular
                  style={{ marginTop: 2 }}
                >
                  {step.detail}
                </Txt>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Compressed variant for the transfer receipt.
 *
 * Same rail as `Timeline`, at 20pt with the timestamp pulled onto the label's
 * own line. A receipt is read after the fact, so it wants the whole history
 * visible at once rather than the roomy, one-step-at-a-time pacing of the live
 * screen — but it keeps the connected rail, because dots alone lose the
 * ordering and the break in the chain when something failed.
 */
export function TimelineCompact({ steps, markerSize = 20 }: { steps: Step[]; markerSize?: number }) {
  return (
    <View>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const next = steps[index + 1];
        const connector =
          step.state === "done" && next?.state === "failed"
            ? color.errorBorder
            : step.state === "done"
              ? color.success
              : "rgba(26,19,64,0.12)";

        const labelColor =
          step.state === "failed"
            ? color.error
            : step.state === "active"
              ? color.link
              : step.state === "upcoming"
                ? color.inkFaint
                : color.ink;

        return (
          <View key={step.label} style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ alignItems: "center" }}>
              <Marker state={step.state} size={markerSize} />
              {!last && (
                <View style={{ width: 2, flex: 1, minHeight: 12, backgroundColor: connector }} />
              )}
            </View>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                paddingBottom: last ? 0 : space.md,
                minHeight: markerSize,
              }}
            >
              <Txt size={13} weight={700} color={labelColor} style={{ flexShrink: 1 }}>
                {step.label}
              </Txt>
              {step.detail !== undefined && (
                <Txt
                  size={12}
                  weight={500}
                  color={step.state === "upcoming" ? color.inkFaint : color.inkMuted}
                  tabular
                  numberOfLines={1}
                  align="right"
                  style={{ flex: 1 }}
                >
                  {step.detail}
                </Txt>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

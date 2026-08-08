import { Platform, Pressable, Switch, View, type StyleProp, type ViewStyle } from "react-native";
import { color, radius, space, TOUCH_TARGET } from "@/theme";
import { Txt } from "./Txt";

/** Pill-in-a-track segmented control — Send (Contact/Address/Scan), Add contact. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: color.segmentTrack,
          borderRadius: radius.field,
          padding: 4,
          flexDirection: "row",
          gap: 4,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[
              {
                flex: 1,
                minHeight: TOUCH_TARGET,
                paddingVertical: 6,
                borderRadius: radius.chip,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: active ? color.surface : "transparent",
              },
              active && {
                shadowColor: color.ink,
                shadowOpacity: 0.08,
                shadowRadius: 3,
                shadowOffset: { width: 0, height: 1 },
                elevation: 1,
              },
            ]}
          >
            <Txt size={13} weight={active ? 700 : 600} color={active ? color.ink : color.inkMuted}>
              {option.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontal filter chips — the Transfers feed. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            // hitSlop rather than a taller pill: the chip row's visual rhythm
            // comes from the board, but the tappable area still has to clear the
            // platform floor.
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            style={{
              backgroundColor: active ? color.interactive : color.surface,
              borderWidth: active ? 0 : 1,
              borderColor: "rgba(26,19,64,0.09)",
              paddingHorizontal: 14,
              paddingVertical: 8,
              justifyContent: "center",
              borderRadius: radius.pill,
            }}
          >
            <Txt size={13} weight={active ? 700 : 600} color={active ? color.onDark : color.inkOnTint}>
              {option.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The real platform switch, brand-tinted.
 *
 * Deliberately the platform's own `Switch` rather than a hand-rolled pill: a
 * custom one matches neither the iOS switch (51×31, distinctive thumb) nor
 * Material 3's (52×32, icon in the thumb), so a fluent user on either platform
 * reads it as an off-spec control for no gain. Themed via the track colour.
 */
export function Toggle({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  accessibilityLabel: string;
}) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: color.disabledBg, true: color.interactive }}
      thumbColor={Platform.OS === "android" ? color.surface : undefined}
      ios_backgroundColor={color.disabledBg}
    />
  );
}


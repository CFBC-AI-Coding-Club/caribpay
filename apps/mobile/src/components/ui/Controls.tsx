import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { color, radius, shadow, space } from "@/theme";
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
                height: 44,
                borderRadius: radius.chip,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: active ? color.surface : "transparent",
              },
              active && {
                shadowColor: "#000",
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
            style={{
              backgroundColor: active ? color.interactive : color.surface,
              borderWidth: active ? 0 : 1,
              borderColor: "rgba(26,19,64,0.09)",
              paddingHorizontal: 14,
              paddingVertical: 8,
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
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={{
        width: 48,
        height: 28,
        borderRadius: radius.pill,
        backgroundColor: value ? color.interactive : color.disabledBg,
        padding: 4,
        justifyContent: "center",
        alignItems: value ? "flex-end" : "flex-start",
      }}
    >
      <View
        style={[
          { width: 22, height: 22, borderRadius: 11, backgroundColor: color.surface },
          shadow.control,
        ]}
      />
    </Pressable>
  );
}

/** Radio dot used by the Add wallet currency list. */
export function RadioDot({ selected }: { selected: boolean }) {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: selected ? color.primary : color.borderStrong,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {selected && (
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color.interactive }} />
      )}
    </View>
  );
}

import { Pressable, View } from "react-native";
import { color, radius, space } from "@/theme";
import { Icon } from "@/components/Icon";
import { Txt } from "./Txt";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

/**
 * On-screen numeric keypad for the Send amount. The compose screen drives the
 * amount as a string so we never round-trip through a float; this just edits it.
 */
export function Keypad({ onKey }: { onKey: (key: string) => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        paddingHorizontal: 30,
        columnGap: space.sm,
      }}
    >
      {KEYS.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={key === "back" ? "Delete" : key}
          onPress={() => onKey(key)}
          style={({ pressed }) => ({
            width: `${100 / 3}%`,
            height: 48,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: radius.chip,
            backgroundColor: pressed ? color.segmentTrack : "transparent",
          })}
        >
          {key === "back" ? (
            <Icon name="backspace" size={24} color={color.ink} strokeWidth={1.9} />
          ) : (
            <Txt size={24} weight={700}>
              {key}
            </Txt>
          )}
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Apply a keypad press to a decimal amount string.
 * Guards: one decimal point, at most `exponent` decimals, no leading zeroes.
 */
export function applyKey(current: string, key: string, exponent = 2): string {
  if (key === "back") return current.length <= 1 ? "0" : current.slice(0, -1);
  if (key === ".") return current.includes(".") ? current : `${current}.`;

  const [whole = "", frac] = current.split(".");
  if (frac !== undefined) {
    return frac.length >= exponent ? current : `${current}${key}`;
  }
  if (whole === "0") return key;
  // Keep the typed amount within the safe-integer range the ledger accepts.
  if (whole.length >= 12) return current;
  return `${current}${key}`;
}

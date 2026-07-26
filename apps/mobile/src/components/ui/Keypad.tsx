import { Pressable, View } from "react-native";
import { color, radius, space } from "@/theme";
import { Icon } from "@/components/Icon";
import { Txt } from "./Txt";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

const KEY_HEIGHT = 48;
/** Half the gap between key surfaces, applied as padding on each cell. */
const KEY_INSET = space.xs;

/**
 * On-screen numeric keypad for the Send amount. The compose screen drives the
 * amount as a string so we never round-trip through a float; this just edits it.
 */
export function Keypad({ onKey }: { onKey: (key: string) => void }) {
  return (
    // Three columns, and the spacing lives on the cells rather than on the row.
    // A `columnGap` here would be added *after* the three 33.33% widths, so the
    // line broke after two keys and the pad rendered 2×6 with the digits out of
    // order. Percentage widths and pixel gaps cannot share a wrapping row.
    // The 4pt cell padding gives the board's 8pt gutter between key surfaces,
    // vertically as well, and 26 + 4 lands the key edge on the sanctioned 30.
    <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 30 - KEY_INSET }}>
      {KEYS.map((key) => (
        <View key={key} style={{ width: "33.3333%", padding: KEY_INSET }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={key === "back" ? "Delete" : key}
            onPress={() => onKey(key)}
            style={({ pressed }) => ({
              height: KEY_HEIGHT,
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
        </View>
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

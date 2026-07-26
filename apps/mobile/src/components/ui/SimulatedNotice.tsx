import { View } from "react-native";
import { color, radius, space } from "@/theme";
import { Icon } from "@/components/Icon";
import { Txt } from "./Txt";

/**
 * Every screen that names a real financial institution carries this.
 *
 * The institutions in this app are real and named; we have no relationship with
 * any of them and nothing here connects to a bank. If a judge photographs a
 * screen showing Republic Bank's name, the disclaimer has to be in the same
 * photograph — which is why this is a component in the kit rather than a string
 * someone remembers to add.
 */
export function SimulatedNotice({ compact = false }: { compact?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        backgroundColor: color.pendingSoft,
        borderWidth: 1,
        borderColor: color.pendingBorder,
        borderRadius: compact ? radius.chip : radius.card,
        paddingHorizontal: compact ? 10 : 14,
        paddingVertical: compact ? 6 : 10,
      }}
    >
      <Icon name="info" size={compact ? 14 : 17} color={color.pending} strokeWidth={1.9} />
      <Txt size={compact ? 11 : 13} weight={600} color={color.pending} style={{ flex: 1 }}>
        Simulated — no live bank connection
      </Txt>
    </View>
  );
}

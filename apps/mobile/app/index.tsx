import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors } from "@/components/ui";

// The auth gate in the root layout redirects away from here on launch; this is
// just the splash shown while tokens hydrate.
export default function Index() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});

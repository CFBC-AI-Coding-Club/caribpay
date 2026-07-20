import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import type { Transaction } from "@caribpay/shared";

export const colors = {
  bg: "#f4f6f8",
  card: "#ffffff",
  text: "#12232e",
  muted: "#6b7c88",
  primary: "#0a7d5a",
  primaryText: "#ffffff",
  border: "#dfe6ea",
  danger: "#b00020",
  pendingBg: "#fff3cd",
  pendingText: "#8a6d00",
  settledBg: "#d9f2e6",
  settledText: "#0a7d5a",
  failedBg: "#fbe0e3",
  failedText: "#b00020",
};

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled === true || loading === true;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.button, isDisabled && styles.buttonDisabled]}
    >
      {loading === true ? (
        <ActivityIndicator color={colors.primaryText} />
      ) : (
        <Text style={styles.buttonText}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  ...props
}: { label: string } & TextInputProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        {...props}
      />
    </View>
  );
}

export function ErrorText({ message }: { message?: string | null }) {
  if (message === undefined || message === null || message === "") return null;
  return <Text style={styles.errorText}>{message}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

const STATUS_STYLES: Record<
  Transaction["status"],
  { bg: string; fg: string; label: string }
> = {
  initiated: { bg: colors.pendingBg, fg: colors.pendingText, label: "Initiated" },
  pending_settlement: { bg: colors.pendingBg, fg: colors.pendingText, label: "Pending" },
  settled: { bg: colors.settledBg, fg: colors.settledText, label: "Settled" },
  failed: { bg: colors.failedBg, fg: colors.failedText, label: "Failed" },
};

export function StatusPill({ status }: { status: Transaction["status"] }) {
  const s = STATUS_STYLES[status];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.primaryText, fontWeight: "600", fontSize: 16 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { color: colors.muted, marginBottom: 6, fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  errorText: { color: colors.danger, marginBottom: 10 },
  muted: { color: colors.muted },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" },
  pillText: { fontSize: 12, fontWeight: "700" },
});

import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { formatMoney } from "@caribpay/shared";
import { useTransfer } from "@/api/hooks";
import { Card, Muted, PrimaryButton, StatusPill, colors } from "@/components/ui";
import { useRouter } from "expo-router";

export default function TransferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const transfer = useTransfer(id);
  const tx = transfer.data;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {tx === undefined ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          <Card style={styles.amountCard}>
            <Muted>You sent</Muted>
            <Text style={styles.amount}>
              {formatMoney(tx.sourceAmountMinor, tx.sourceCurrency)}
            </Text>
            {tx.sourceCurrency !== tx.destCurrency ? (
              <Text style={styles.converted}>
                → {formatMoney(tx.destAmountMinor, tx.destCurrency)}
              </Text>
            ) : null}
            <View style={styles.pill}>
              <StatusPill status={tx.status} />
            </View>
          </Card>

          <Card>
            {tx.status === "pending_settlement" || tx.status === "initiated" ? (
              <View style={styles.statusRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.statusText}>Settling through CAPSS…</Text>
              </View>
            ) : tx.status === "settled" ? (
              <Text style={styles.settledText}>Settlement complete — funds delivered.</Text>
            ) : (
              <Text style={styles.failedText}>
                Transfer failed{tx.failureReason !== null ? `: ${tx.failureReason}` : ""}. Your
                funds were returned.
              </Text>
            )}
          </Card>

          <Card>
            <DetailRow label="Status" value={tx.status.replace("_", " ")} />
            {tx.fxRateUsed !== null ? (
              <DetailRow
                label="Rate"
                value={`1 ${tx.sourceCurrency} = ${tx.fxRateUsed} ${tx.destCurrency}`}
              />
            ) : null}
            {tx.note !== null && tx.note !== "" ? <DetailRow label="Note" value={tx.note} /> : null}
            <DetailRow label="Created" value={new Date(tx.createdAt).toLocaleString()} />
            {tx.settledAt !== null ? (
              <DetailRow label="Settled" value={new Date(tx.settledAt).toLocaleString()} />
            ) : null}
            <DetailRow label="Reference" value={tx.id} />
          </Card>

          <PrimaryButton title="Done" onPress={() => router.replace("/(tabs)/home")} />
        </>
      )}
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  center: { paddingVertical: 80, alignItems: "center" },
  amountCard: { alignItems: "center", paddingVertical: 28 },
  amount: { fontSize: 32, fontWeight: "800", color: colors.text, marginTop: 4 },
  converted: { fontSize: 18, color: colors.muted, marginTop: 4 },
  pill: { marginTop: 14 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  settledText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
  failedText: { color: colors.danger, fontSize: 15, fontWeight: "600" },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: 16,
  },
  detailLabel: { color: colors.muted, fontSize: 14 },
  detailValue: { color: colors.text, fontSize: 14, fontWeight: "600", flexShrink: 1 },
});

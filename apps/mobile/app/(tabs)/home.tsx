import { useCallback } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { formatMoney, type Transaction } from "@caribpay/shared";
import { useMe, useTransactions, useWallets } from "@/api/hooks";
import { Card, Muted, StatusPill, colors } from "@/components/ui";

export default function HomeScreen() {
  const wallets = useWallets();
  const transactions = useTransactions();
  const me = useMe();

  const refetchAll = useCallback(() => {
    void wallets.refetch();
    void transactions.refetch();
  }, [wallets, transactions]);

  // Refresh balances whenever the tab regains focus (e.g. after a transfer).
  useFocusEffect(refetchAll);

  const refreshing = wallets.isRefetching || transactions.isRefetching;
  const currentUserId = me.data?.user.id;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} />}
    >
      <Card style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total balance</Text>
        {wallets.data === undefined ? (
          <Text style={styles.totalValue}>—</Text>
        ) : (
          <Text style={styles.totalValue}>
            {formatMoney(wallets.data.totalBalance.amountMinor, wallets.data.totalBalance.currency)}
          </Text>
        )}
        <Muted>Across all your wallets</Muted>
      </Card>

      <Text style={styles.sectionTitle}>Wallets</Text>
      {wallets.data?.wallets.map((wallet) => (
        <Card key={wallet.id} style={styles.rowCard}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.walletCurrency}>{wallet.currency}</Text>
              <Muted>{wallet.address}</Muted>
            </View>
            <Text style={styles.walletBalance}>
              {formatMoney(wallet.balanceMinor, wallet.currency)}
            </Text>
          </View>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Regional transfers</Text>
      {transactions.data?.items.length === 0 ? (
        <Muted>No transfers yet.</Muted>
      ) : (
        transactions.data?.items.map((tx) => (
          <TransactionRow key={tx.id} tx={tx} currentUserId={currentUserId} />
        ))
      )}
    </ScrollView>
  );
}

function TransactionRow({
  tx,
  currentUserId,
}: {
  tx: Transaction;
  currentUserId: string | undefined;
}) {
  const outgoing = currentUserId !== undefined && tx.senderUserId === currentUserId;
  const amountMinor = outgoing ? tx.sourceAmountMinor : tx.destAmountMinor;
  const currency = outgoing ? tx.sourceCurrency : tx.destCurrency;
  const sign = outgoing ? "-" : "+";

  return (
    <Card style={styles.rowCard}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.txTitle}>
            {outgoing ? "Sent" : "Received"}
            {tx.sourceCurrency !== tx.destCurrency
              ? ` · ${tx.sourceCurrency}→${tx.destCurrency}`
              : ""}
          </Text>
          {tx.note !== null && tx.note !== "" ? <Muted>{tx.note}</Muted> : null}
          <View style={styles.pillWrap}>
            <StatusPill status={tx.status} />
          </View>
        </View>
        <Text style={[styles.txAmount, { color: outgoing ? colors.text : colors.primary }]}>
          {sign}
          {formatMoney(amountMinor, currency)}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 10 },
  totalCard: { backgroundColor: colors.card, alignItems: "flex-start" },
  totalLabel: { color: colors.muted, fontSize: 14, marginBottom: 4 },
  totalValue: { fontSize: 34, fontWeight: "800", color: colors.text, marginBottom: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 14, marginBottom: 2 },
  rowCard: { paddingVertical: 14 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  flex: { flex: 1, paddingRight: 12 },
  walletCurrency: { fontSize: 16, fontWeight: "700", color: colors.text },
  walletBalance: { fontSize: 16, fontWeight: "700", color: colors.text },
  txTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  txAmount: { fontSize: 15, fontWeight: "700" },
  pillWrap: { marginTop: 6 },
});

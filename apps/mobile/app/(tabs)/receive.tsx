import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { formatMoney, type Currency } from "@caribpay/shared";
import { useQrReceive, useWallets } from "@/api/hooks";
import { Card, Muted, colors } from "@/components/ui";

export default function ReceiveScreen() {
  const wallets = useWallets();
  const [currency, setCurrency] = useState<Currency | undefined>(undefined);
  const receive = useQrReceive(currency);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (receive.data === undefined) return;
    await Clipboard.setStringAsync(receive.data.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {wallets.data !== undefined && wallets.data.wallets.length > 1 ? (
        <View style={styles.chipsRow}>
          {wallets.data.wallets.map((wallet) => {
            const active = (currency ?? receive.data?.currency) === wallet.currency;
            return (
              <Pressable
                key={wallet.id}
                onPress={() => setCurrency(wallet.currency)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {wallet.currency}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Card style={styles.qrCard}>
        {receive.data === undefined ? (
          <Muted>Loading your QR…</Muted>
        ) : (
          <>
            <View style={styles.qrBox}>
              <QRCode value={receive.data.payload} size={220} />
            </View>
            <Text style={styles.name}>{receive.data.displayName}</Text>
            <Muted>Scan to pay in {receive.data.currency}</Muted>
          </>
        )}
      </Card>

      {receive.data !== undefined ? (
        <Card style={styles.addressCard}>
          <Text style={styles.addressLabel}>Wallet address</Text>
          <Text style={styles.address}>{receive.data.walletAddress}</Text>
          <Pressable style={styles.copyButton} onPress={onCopy}>
            <Text style={styles.copyText}>{copied ? "Copied!" : "Copy address"}</Text>
          </Pressable>
        </Card>
      ) : null}

      {wallets.data !== undefined ? (
        <Muted>
          Balance:{" "}
          {formatMoney(
            wallets.data.wallets.find((w) => w.currency === receive.data?.currency)?.balanceMinor ??
              0,
            receive.data?.currency ?? "XCD",
          )}
        </Muted>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, alignItems: "center", gap: 14 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: "600" },
  chipTextActive: { color: colors.primaryText },
  qrCard: { alignItems: "center", width: "100%", paddingVertical: 24 },
  qrBox: { padding: 16, backgroundColor: "#fff", borderRadius: 12 },
  name: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 16 },
  addressCard: { width: "100%" },
  addressLabel: { color: colors.muted, fontSize: 13, fontWeight: "600", marginBottom: 6 },
  address: { fontSize: 16, fontWeight: "700", color: colors.text, letterSpacing: 1, marginBottom: 12 },
  copyButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  copyText: { color: colors.primary, fontWeight: "700" },
});

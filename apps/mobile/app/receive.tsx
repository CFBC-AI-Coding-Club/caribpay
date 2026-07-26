import { useState } from "react";
import { Image, Pressable, ScrollView, Share, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import {
  CURRENCY_NAMES,
  CURRENCY_SYMBOLS,
  SUPPORTED_CURRENCIES,
  type Currency,
} from "@caribpay/shared";
import { color, radius, shadow, space } from "@/theme";
import { Icon } from "@/components/Icon";
import { Flag } from "@/components/Flag";
import {
  Button,
  ErrorState,
  HomeIndicator,
  Loading,
  PickerSheet,
  Screen,
  ScreenHeader,
  Txt,
} from "@/components/ui";
import { useQrReceive, useWallets } from "@/api/hooks";

export default function ReceiveScreen() {
  const params = useLocalSearchParams<{ currency?: string }>();
  const wallets = useWallets();
  const [currency, setCurrency] = useState<Currency | undefined>(
    params.currency as Currency | undefined,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const receive = useQrReceive(currency);
  const owned = wallets.data?.wallets ?? [];

  const options = SUPPORTED_CURRENCIES.filter((c) => owned.some((w) => w.currency === c)).map(
    (c) => ({
      value: c,
      label: CURRENCY_NAMES[c],
      detail: `Receive into your ${CURRENCY_SYMBOLS[c]} wallet`,
      leading: <Flag currency={c} size={30} />,
    }),
  );

  async function copyAddress() {
    if (receive.data === undefined) return;
    await Clipboard.setStringAsync(receive.data.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareAddress() {
    if (receive.data === undefined) return;
    const { displayName, walletAddress, currency: c } = receive.data;
    await Share.share({
      message: `Pay ${displayName} on CaribPay\n${walletAddress} (${CURRENCY_SYMBOLS[c]})\nNo fees, no US dollar.`,
    }).catch(() => undefined);
  }

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Receive money" />

      {receive.isError ? (
        <ErrorState
          body="We couldn't build your QR code. Check your connection and try again."
          onRetry={() => void receive.refetch()}
        />
      ) : receive.isPending || receive.data === undefined ? (
        <Loading label="Building your code…" />
      ) : (
        // A ScrollView rather than a fixed column: the QR block and the two
        // actions below it are taller than a small phone at large text sizes, and
        // an unreachable "Copy address" is the whole point of this screen missed.
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            paddingHorizontal: space.gutter,
            paddingTop: 10,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change which wallet receives"
            onPress={() => setPickerOpen(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              backgroundColor: color.surface,
              borderWidth: 1,
              borderColor: color.borderSoft,
              paddingLeft: 8,
              paddingRight: 14,
              paddingVertical: 6,
              borderRadius: radius.pill,
            }}
          >
            <Flag currency={receive.data.currency} size={24} />
            <Txt size={13} weight={700}>
              Into {CURRENCY_SYMBOLS[receive.data.currency]} wallet
            </Txt>
            <Icon name="chevronDown" size={14} color={color.inkMuted} strokeWidth={2.4} />
          </Pressable>

          {/* The signed payload is what the scanner verifies — not the bare address. */}
          <View
            style={[
              {
                marginTop: space.lg,
                backgroundColor: color.surface,
                borderRadius: radius.cardLg,
                padding: 22,
              },
              shadow.panel,
            ]}
          >
            <View style={{ width: 232, height: 232, alignItems: "center", justifyContent: "center" }}>
              <QRCode
                value={receive.data.payload}
                size={232}
                color={color.ink}
                backgroundColor={color.surface}
                ecl="Q"
              />
              <View
                style={{
                  position: "absolute",
                  width: 52,
                  height: 52,
                  borderRadius: 15,
                  backgroundColor: color.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 5,
                  borderColor: color.surface,
                }}
              >
                <Image
                  accessibilityIgnoresInvertColors
                  source={require("../assets/logo-tile.png")}
                  style={{ width: 42, height: 42, borderRadius: 12 }}
                />
              </View>
            </View>
          </View>

          <View style={{ alignItems: "center", marginTop: space.lg }}>
            <Txt size={17} weight={800} numberOfLines={1}>
              {receive.data.displayName}
            </Txt>
            <Txt size={13} weight={500} color={color.inkMuted} style={{ marginTop: 4 }}>
              Scan to pay me in {CURRENCY_SYMBOLS[receive.data.currency]} — no fees
            </Txt>
          </View>

          <View
            style={[
              {
                width: "100%",
                marginTop: space.lg,
                backgroundColor: color.surface,
                borderRadius: radius.card,
                paddingHorizontal: space.lg,
                paddingVertical: space.md,
              },
              shadow.card,
            ]}
          >
            <Txt size={11} weight={600} color={color.inkMuted}>
              Your wallet address
            </Txt>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginTop: 6,
              }}
            >
              <Txt size={15} weight={700} tabular style={{ flex: 1 }}>
                {receive.data.walletAddress}
              </Txt>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy wallet address"
                onPress={() => void copyAddress()}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.chip,
                  backgroundColor: color.primarySoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={copied ? "check" : "copy"} size={17} color={color.link} strokeWidth={1.9} />
              </Pressable>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: space.md, width: "100%" }}>
            <Button
              label={copied ? "Copied" : "Copy"}
              icon={copied ? "check" : "copy"}
              height={52}
              style={{ flex: 1, paddingHorizontal: space.md }}
              onPress={() => void copyAddress()}
            />
            <Button
              label="Share"
              icon="share"
              variant="secondary"
              height={52}
              style={{ flex: 1, paddingHorizontal: space.md }}
              onPress={() => void shareAddress()}
            />
          </View>
        </ScrollView>
      )}

      <PickerSheet
        visible={pickerOpen}
        title="Receive into"
        options={options}
        value={receive.data?.currency}
        onSelect={setCurrency}
        onClose={() => setPickerOpen(false)}
      />
      <HomeIndicator />
    </Screen>
  );
}

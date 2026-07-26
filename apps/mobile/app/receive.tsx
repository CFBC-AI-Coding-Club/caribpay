import { useState } from "react";
import { Image, Pressable, ScrollView, Share, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { CURRENCY_SYMBOLS } from "@caribpay/shared";
import { color, radius, shadow, space } from "@/theme";
import { Icon } from "@/components/Icon";
import { Flag } from "@/components/Flag";
import {
  Button,
  EmptyState,
  ErrorState,
  HomeIndicator,
  Loading,
  Screen,
  ScreenHeader,
  Txt,
} from "@/components/ui";
import { useQrReceive } from "@/api/hooks";
import { useRouter } from "expo-router";
import { ApiRequestError } from "@/api/client";

/**
 * Your address, large and copyable, with the signed QR beneath it.
 *
 * The address leads because it is the thing a person can say over a phone call —
 * which is the whole reason for moving off `CW-…` identifiers. The QR is the
 * same address, signed, for when the two phones are in the same room.
 */
export default function ReceiveScreen() {
  const router = useRouter();
  const receive = useQrReceive();
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (receive.data === undefined) return;
    await Clipboard.setStringAsync(receive.data.vpa);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareAddress() {
    if (receive.data === undefined) return;
    const { displayName, vpa, currency } = receive.data;
    await Share.share({
      message: `Pay ${displayName} on CaribPay\n${vpa} (${CURRENCY_SYMBOLS[currency]})\nNo fees, no US dollar.`,
    }).catch(() => undefined);
  }

  const notPayable =
    receive.error instanceof ApiRequestError &&
    (receive.error.code === "NO_LINKED_ACCOUNT" || receive.error.code === "NO_ADDRESS");

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Receive money" />

      {notPayable ? (
        // The QR is withheld rather than shown dead — a code that cannot be paid
        // would be worse than none — but copying the address is still allowed,
        // because it works the moment a bank is linked.
        <EmptyState
          icon="card"
          title="The address is yours, the landing place is missing"
          body="Money arrives at a bank account, and you have not linked one yet. Nobody can pay you until you do — and no one else can ever take this address."
          actionLabel="Connect an account"
          actionIcon="plus"
          onAction={() => router.replace("/accounts/link")}
        />
      ) : receive.isError ? (
        <ErrorState
          body="We couldn't build your code. Check your connection and try again."
          onRetry={() => void receive.refetch()}
        />
      ) : receive.isPending || receive.data === undefined ? (
        <Loading label="Building your code…" />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            paddingHorizontal: space.gutter,
            paddingTop: 10,
          }}
        >
          <View
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
            <Flag currency={receive.data.currency} country={receive.data.countryCode} size={24} />
            <Txt size={13} weight={700}>
              Arrives as {CURRENCY_SYMBOLS[receive.data.currency]}
            </Txt>
          </View>

          {/* The address leads: it is the part a person can say out loud. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Copy your address, ${receive.data.vpa}`}
            onPress={() => void copyAddress()}
            style={[
              {
                width: "100%",
                marginTop: space.lg,
                backgroundColor: color.surface,
                borderRadius: radius.cardLg,
                paddingHorizontal: space.lg,
                paddingVertical: space.lg,
                alignItems: "center",
                gap: 6,
              },
              shadow.panel,
            ]}
          >
            <Txt size={11} weight={600} color={color.inkMuted}>
              YOUR CARIBPAY ADDRESS
            </Txt>
            {/* 31px — larger than the screen title, because it is the payload. */}
            <Txt size={31} weight={800} tabular align="center" numberOfLines={1} adjustsFontSizeToFit>
              {receive.data.vpa}
            </Txt>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              <Icon
                name={copied ? "check" : "copy"}
                size={14}
                color={copied ? color.success : color.link}
                strokeWidth={2}
              />
              <Txt size={12} weight={700} color={copied ? color.success : color.link}>
                {copied ? "Copied" : "Tap to copy"}
              </Txt>
            </View>
          </Pressable>

          <View
            style={[
              {
                marginTop: space.lg,
                backgroundColor: color.surface,
                borderRadius: radius.cardLg,
                padding: 22,
              },
              shadow.card,
            ]}
          >
            <View style={{ width: 200, height: 200, alignItems: "center", justifyContent: "center" }}>
              <QRCode
                value={receive.data.payload}
                size={200}
                color={color.ink}
                backgroundColor={color.surface}
                ecl="Q"
              />
              <View
                style={{
                  position: "absolute",
                  width: 48,
                  height: 48,
                  borderRadius: 14,
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
                  style={{ width: 38, height: 38, borderRadius: 11 }}
                />
              </View>
            </View>
          </View>

          <Txt size={13} weight={500} color={color.inkMuted} align="center" style={{ marginTop: space.md }}>
            Scan to pay {receive.data.displayName} — no fees
          </Txt>
          <Txt size={11} weight={500} color={color.inkFaint} align="center" style={{ marginTop: 4 }}>
            Signed by CaribPay. A screenshot of this code still works.
          </Txt>

          <View style={{ flexDirection: "row", gap: 10, marginTop: space.lg, width: "100%" }}>
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
      <HomeIndicator />
    </Screen>
  );
}

import { useEffect, useRef } from "react";
import { Animated, Easing, Share, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { formatAmount, formatRate, type Transaction } from "@caribpay/shared";
import { color, space } from "@/theme";
import { Icon } from "@/components/Icon";
import {
  Button,
  ErrorState,
  HomeIndicator,
  Loading,
  Notice,
  Screen,
  ScreenHeader,
  Timeline,
  Txt,
  type Step,
} from "@/components/ui";
import { useTransfer } from "@/api/hooks";
import { timeWithSeconds } from "@/lib/datetime";

/** Concentric circles expanding outward — the "in flight" and "done" flourish. */
function Ripple({ tint, count = 2 }: { tint: string; count?: number }) {
  const waves = useRef(
    Array.from({ length: count }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    const animations = waves.map((wave, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 950),
          Animated.timing(wave, {
            toValue: 1,
            duration: 1900,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [waves]);

  return (
    <>
      {waves.map((wave, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            width: 126,
            height: 126,
            borderRadius: 63,
            backgroundColor: tint,
            opacity: wave.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [
              { scale: wave.interpolate({ inputRange: [0, 1], outputRange: [0.55, 2.3] }) },
            ],
          }}
        />
      ))}
    </>
  );
}

/** The settled checkmark pops in once. */
function Pop({ children }: { children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(0.82)).current;
  useEffect(() => {
    Animated.timing(scale, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.back(2)),
      useNativeDriver: true,
    }).start();
  }, [scale]);
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

function statusSteps(tx: Transaction): Step[] {
  const terminal = tx.status === "settled" || tx.status === "failed";
  return [
    { label: "Initiated", detail: timeWithSeconds(tx.createdAt), state: "done" },
    {
      label: "Pending settlement",
      detail: terminal ? undefined : "Clearing across the region…",
      state: terminal ? "done" : "active",
    },
    tx.status === "failed"
      ? {
          label: "Settlement failed",
          detail: tx.settledAt === null ? undefined : timeWithSeconds(tx.settledAt),
          state: "failed",
        }
      : {
          label: "Settled",
          detail:
            tx.settledAt === null ? "Delivered to recipient" : timeWithSeconds(tx.settledAt),
          state: tx.status === "settled" ? "done" : "upcoming",
        },
  ];
}

export default function TransferStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const transfer = useTransfer(id);

  if (transfer.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Transfer" onBack={false} />
        <Loading label="Starting your transfer…" />
      </Screen>
    );
  }

  if (transfer.isError || transfer.data === undefined) {
    return (
      <Screen>
        <ScreenHeader title="Transfer" onBack={() => router.replace("/(tabs)/home")} />
        <ErrorState
          title="We lost track of this transfer"
          body="It may still be settling. Check your activity feed in a moment."
          onRetry={() => void transfer.refetch()}
        />
      </Screen>
    );
  }

  const tx = transfer.data;
  const recipientName = tx.counterparty?.displayName ?? "the recipient";
  const firstName = recipientName.split(" ")[0] ?? recipientName;
  const received = formatAmount(tx.destAmountMinor, tx.destCurrency);

  const settled = tx.status === "settled";
  const failed = tx.status === "failed";

  async function shareReceipt() {
    const lines = [
      `CaribPay transfer${settled ? " — sent" : ""}`,
      `${formatAmount(tx.sourceAmountMinor, tx.sourceCurrency)} → ${received}`,
      `To ${recipientName}`,
      tx.fxRateUsed === null
        ? null
        : formatRate(tx.fxRateUsed, tx.sourceCurrency, tx.destCurrency),
      "Fee: free",
      `Reference: ${tx.id}`,
    ].filter((line): line is string => line !== null);
    // Best-effort: a dismissed share sheet is not an error worth surfacing.
    await Share.share({ message: lines.join("\n") }).catch(() => undefined);
  }

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Transfer" onBack={false} />

      <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 30, paddingTop: 18 }}>
        {/* Status mark */}
        <View
          style={{
            width: 126,
            height: 126,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 10,
          }}
        >
          {!failed && <Ripple tint={settled ? "rgba(18,128,92,0.16)" : "rgba(85,96,232,0.16)"} count={settled ? 1 : 2} />}
          {failed ? (
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: color.errorSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 31,
                  backgroundColor: color.error,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="close" size={32} color={color.onDark} strokeWidth={2.6} />
              </View>
            </View>
          ) : settled ? (
            <Pop>
              <View
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 42,
                  backgroundColor: color.success,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="checkBold" size={42} color={color.onDark} strokeWidth={2.6} />
              </View>
            </Pop>
          ) : (
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: color.interactive,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="clock" size={38} color={color.onDark} strokeWidth={2} />
            </View>
          )}
        </View>

        <View style={{ alignItems: "center", marginTop: space.xl }}>
          <Txt size={24} weight={800} align="center">
            {failed ? "Transfer failed" : settled ? "Sent!" : `Sending to ${firstName}…`}
          </Txt>
          {failed ? (
            <Txt size={15} weight={500} color={color.inkMuted} align="center" style={{ marginTop: 6 }}>
              No money left your wallet.
            </Txt>
          ) : settled ? (
            <Txt size={15} weight={500} color={color.inkMuted} align="center" style={{ marginTop: 6 }}>
              <Txt size={15} weight={700}>
                {received}
              </Txt>{" "}
              delivered to {recipientName}
            </Txt>
          ) : (
            <Txt size={15} weight={500} color={color.inkMuted} align="center" style={{ marginTop: 4 }}>
              {received} · usually a few seconds
            </Txt>
          )}
        </View>

        {failed && (
          <View style={{ width: "100%", marginTop: space.lg }}>
            <Notice
              tone="error"
              title="Settlement did not complete"
              body="Your hold was reversed in full. Starting again gives you a fresh quote."
              reference={tx.failureReason ?? undefined}
            />
          </View>
        )}

        <View style={{ width: "100%", marginTop: failed ? space.lg : 26, paddingHorizontal: 6 }}>
          <Timeline steps={statusSteps(tx)} markerSize={failed || settled ? 26 : 28} />
        </View>

        <View style={{ flex: 1 }} />

        <View style={{ width: "100%", gap: 10, paddingBottom: 6 }}>
          {failed ? (
            <>
              <Button label="Try again" onPress={() => router.replace("/send")} />
              <Button
                label="Back to home"
                variant="secondary"
                onPress={() => router.replace("/(tabs)/home")}
              />
            </>
          ) : settled ? (
            <>
              <Button label="Done" onPress={() => router.replace("/(tabs)/home")} />
              <Button
                label="Share receipt"
                variant="secondary"
                icon="share"
                height={48}
                onPress={() => void shareReceipt()}
              />
            </>
          ) : (
            <>
              {/*
                The board shows "Cancel transfer" here, but once the hold is posted
                and the settlement job is queued there is no cancel path in this
                architecture — so we don't offer a button that cannot work.
              */}
              <Button
                label="View details"
                variant="secondary"
                onPress={() => router.push(`/transaction/${tx.id}`)}
              />
              <Button
                label="Back to home"
                variant="ghost"
                onPress={() => router.replace("/(tabs)/home")}
              />
            </>
          )}
        </View>
      </View>
      <HomeIndicator />
    </Screen>
  );
}

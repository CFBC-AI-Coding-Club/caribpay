import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, ScrollView, Share, View } from "react-native";
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
import { useReducedMotion } from "@/lib/useReducedMotion";

/** Concentric circles expanding outward — the "in flight" and "done" flourish. */
function Ripple({ tint, count = 2 }: { tint: string; count?: number }) {
  const waves = useRef(
    Array.from({ length: count }, () => new Animated.Value(0)),
  ).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
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
  }, [waves, reducedMotion]);

  // Reduce Motion: drop the expanding waves entirely. They are pure atmosphere —
  // the status mark, headline, and timeline all still say what is happening.
  if (reducedMotion) return null;

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
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(reducedMotion ? 1 : 0.82)).current;

  useEffect(() => {
    if (reducedMotion) {
      scale.setValue(1);
      return;
    }
    Animated.timing(scale, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.back(2)),
      useNativeDriver: true,
    }).start();
  }, [scale, reducedMotion]);

  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

/**
 * Speak the terminal outcome once, when it happens. Announcing the pending
 * state too would talk over the user while they are still reading the screen —
 * only the resolution is worth interrupting for.
 */
function useSettlementAnnouncement(
  status: Transaction["status"],
  recipientName: string,
  received: string,
): void {
  const announced = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "completed" && status !== "failed") return;
    if (announced.current === status) return;
    announced.current = status;

    AccessibilityInfo.announceForAccessibility(
      status === "completed"
        ? `Sent. ${received} delivered to ${recipientName}.`
        : "Transfer failed. No money left your account.",
    );
  }, [status, recipientName, received]);
}

/**
 * Eight saga states onto three steps a payer needs.
 *
 * "Held at your bank" is the honest name for `debit_held`: the money is reserved
 * but has not moved, and if the next step fails it is released in full. Saying
 * "sent" there would be a lie the reversal screen then has to undo.
 */
function statusSteps(tx: Transaction): Step[] {
  const held =
    tx.status === "debit_held" ||
    tx.status === "credit_pending" ||
    tx.status === "completed";
  const done = tx.status === "completed";
  const undone = tx.status === "reversed" || tx.status === "reversal_pending";

  return [
    {
      label: "Held at your bank",
      detail: timeWithSeconds(tx.createdAt),
      state: tx.status === "failed" ? "failed" : held || undone ? "done" : "active",
    },
    {
      label: "Clearing across the region",
      detail: done ? undefined : undone ? "Reversing" : "Instructing their bank…",
      state: done ? "done" : undone ? "failed" : held ? "active" : "upcoming",
    },
    tx.status === "failed" || undone
      ? {
          label: tx.status === "reversed" ? "Returned in full" : "Returning your money",
          detail: tx.status === "reversed" ? "No money left your account" : undefined,
          state: tx.status === "reversed" ? "failed" : "active",
        }
      : {
          label: "Delivered",
          detail: tx.settledAt === null ? "Into their account" : timeWithSeconds(tx.settledAt),
          state: done ? "done" : "upcoming",
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

  const settled = tx.status === "completed";
  const failed = tx.status === "failed";

  // This screen changes under the user while they watch it. Sighted users get
  // the mark, the headline, and the timeline; without an explicit announcement a
  // screen-reader user gets nothing at all for the one event they care about.
  useSettlementAnnouncement(tx.status, recipientName, received);

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

      {/*
        Scrolls rather than clips: the failure state adds a notice above the
        timeline and two buttons below it, which overflows a small phone once the
        system text size goes up. The flex spacer below still pins the actions to
        the foot whenever the content does fit.
      */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          paddingHorizontal: space.gutter,
          paddingTop: 18,
        }}
      >
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
          {!failed && (
            <Ripple
              tint={settled ? color.rippleSettled : color.ripplePending}
              count={settled ? 1 : 2}
            />
          )}
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

        <View
          style={{ alignItems: "center", marginTop: space.xl }}
          accessibilityLiveRegion="polite"
          accessible
        >
          <Txt size={24} weight={800} align="center">
            {failed ? "Transfer failed" : settled ? "Sent!" : `Sending to ${firstName}…`}
          </Txt>
          {failed ? (
            <Txt size={15} weight={500} color={color.inkMuted} align="center" style={{ marginTop: 6 }}>
              No money left your account.
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
      </ScrollView>
      <HomeIndicator />
    </Screen>
  );
}

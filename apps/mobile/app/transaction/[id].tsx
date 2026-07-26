import { useEffect, useState } from "react";
import { ScrollView, Share, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { formatAmount, formatRate, shortReference, type Transaction } from "@caribpay/shared";
import { color, space } from "@/theme";
import { Icon } from "@/components/Icon";
import {
  Avatar,
  Button,
  Card,
  ErrorState,
  HomeIndicator,
  IconButton,
  Loading,
  Row,
  RowGroup,
  Screen,
  ScreenHeader,
  StatusBadge,
  TimelineCompact,
  Txt,
  type Step,
} from "@/components/ui";
import { useTransfer } from "@/api/hooks";
import { useDraftStore } from "@/stores/draft";
import { dateTimeLabel } from "@/lib/datetime";

function DetailRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Row paddingVertical={12}>
      <Txt size={13} weight={600} color={color.inkMuted}>
        {label}
      </Txt>
      <Txt size={value.length > 22 ? 13 : 15} weight={700} color={tone} tabular numberOfLines={1}>
        {value}
      </Txt>
    </Row>
  );
}

/**
 * The same three steps the live status screen shows, in the same words.
 *
 * A receipt that renames the stages someone just watched makes them wonder
 * whether they are looking at the same transfer, so the vocabulary is shared
 * deliberately — only the timestamps get longer, since a receipt is read on a
 * different day from the one it happened on.
 */
function timelineSteps(tx: Transaction): Step[] {
  const held =
    tx.status === "debit_held" || tx.status === "credit_pending" || tx.status === "completed";
  const done = tx.status === "completed";
  const undone = tx.status === "reversed" || tx.status === "reversal_pending";
  const settledAt = tx.settledAt === null ? undefined : dateTimeLabel(tx.settledAt);

  return [
    {
      label: "Held at your bank",
      detail: dateTimeLabel(tx.createdAt),
      state: tx.status === "failed" ? "failed" : held || undone ? "done" : "active",
    },
    {
      label: "Cleared across the region",
      detail: done ? settledAt : undone ? "Reversed" : "In progress",
      state: done ? "done" : undone ? "failed" : held ? "active" : "upcoming",
    },
    tx.status === "failed" || undone
      ? {
          label: tx.status === "reversed" ? "Returned in full" : "Returning your money",
          detail: tx.status === "reversed" ? settledAt : undefined,
          state: tx.status === "reversed" ? "failed" : "active",
        }
      : { label: "Delivered", detail: settledAt, state: done ? "done" : "upcoming" },
  ];
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const transfer = useTransfer(id);
  const reset = useDraftStore((s) => s.reset);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (transfer.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Transfer detail" />
        <Loading />
      </Screen>
    );
  }

  if (transfer.isError || transfer.data === undefined) {
    return (
      <Screen>
        <ScreenHeader title="Transfer detail" />
        <ErrorState
          title="Transfer not found"
          body="This transfer isn't on your account, or it has not finished being created."
          onRetry={() => void transfer.refetch()}
        />
      </Screen>
    );
  }

  const tx = transfer.data;
  const incoming = tx.direction === "in";
  const name = tx.counterparty?.displayName ?? "CaribPay";
  const crossCurrency = tx.sourceCurrency !== tx.destCurrency;
  const reference = shortReference(tx.id);

  async function copyReference() {
    await Clipboard.setStringAsync(reference);
    setCopied(true);
  }

  // The leg that belongs to this user, signed the way they experienced it.
  const ownAmount = incoming ? tx.destAmountMinor : -tx.sourceAmountMinor;
  const ownCurrency = incoming ? tx.destCurrency : tx.sourceCurrency;

  async function shareReceipt() {
    await Share.share({
      message: [
        "CaribPay transfer",
        `${incoming ? "Received from" : "Sent to"} ${name}`,
        `${formatAmount(tx.sourceAmountMinor, tx.sourceCurrency)} → ${formatAmount(tx.destAmountMinor, tx.destCurrency)}`,
        tx.fxRateUsed === null ? null : formatRate(tx.fxRateUsed, tx.sourceCurrency, tx.destCurrency),
        "Fee: free",
        `Reference: ${reference}`,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    }).catch(() => undefined);
  }

  function sendAgain() {
    const vpa = tx.counterparty?.vpa;
    if (vpa === undefined || vpa === null) return;
    reset();
    // Back through confirmation: their address may now reach a different
    // account, and a receipt is not a substitute for asking the directory.
    router.push({ pathname: "/send/confirm", params: { key: vpa } });
  }

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader
        title="Transfer detail"
        trailing={
          <IconButton
            icon="share"
            accessibilityLabel="Share receipt"
            strokeWidth={1.9}
            onPress={() => void shareReceipt()}
          />
        }
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.md }}>
        <View style={{ alignItems: "center", gap: space.sm, paddingTop: 10 }}>
          {tx.counterparty === null ? (
            <Avatar name={name} size={60} badgeBackground={color.bg} />
          ) : (
            <Avatar
              name={name}
              size={60}
              country={tx.counterparty.countryCode}
              currency={incoming ? tx.sourceCurrency : tx.destCurrency}
              badgeBackground={color.bg}
            />
          )}
          <View style={{ alignItems: "center" }}>
            <Txt size={12} weight={600} color={color.inkMuted}>
              {incoming ? "Received from" : "Sent to"}
            </Txt>
            <Txt size={17} weight={800} numberOfLines={1}>
              {name}
            </Txt>
          </View>
          <Txt
            size={31}
            weight={800}
            tracking={-0.02}
            tabular
            color={tx.status === "failed" ? color.inkMuted : incoming ? color.success : color.ink}
            style={{ marginTop: 2 }}
          >
            {formatAmount(ownAmount, ownCurrency, { sign: "always" })}
          </Txt>
          <StatusBadge status={tx.status} size={12} />
        </View>

        <RowGroup style={{ marginTop: space.lg }}>
          <DetailRow label="Amount sent" value={formatAmount(tx.sourceAmountMinor, tx.sourceCurrency)} />
          <DetailRow
            label="Amount received"
            value={formatAmount(tx.destAmountMinor, tx.destCurrency)}
            tone={color.link}
          />
          {tx.fxRateUsed !== null && (
            <DetailRow
              label="FX rate used"
              value={formatRate(tx.fxRateUsed, tx.sourceCurrency, tx.destCurrency)}
            />
          )}
          <DetailRow label="Fee" value="Free" tone={color.success} />
          <DetailRow
            label="Route"
            value={
              crossCurrency
                ? `${tx.sourceCurrency} → ${tx.destCurrency} · direct`
                : `${tx.sourceCurrency} · direct`
            }
          />
          {tx.counterparty !== null && (
            <DetailRow label="Counterparty" value={tx.counterparty.vpa ?? tx.counterparty.displayName} />
          )}
          {tx.failureReason !== null && (
            <DetailRow label="Failure" value={tx.failureReason} tone={color.errorText} />
          )}
          {/*
            The short reference, not the uuid. This is the string someone reads
            down a phone line or types into a support form, and it is derived
            from the id rather than being a second identifier — so it stays
            correct without anything having to keep the two in step. Tap to copy.
          */}
          <Row paddingVertical={12} last onPress={() => void copyReference()}>
            <Txt size={13} weight={600} color={color.inkMuted}>
              Reference
            </Txt>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Txt size={15} weight={800} tabular>
                {reference}
              </Txt>
              <Icon
                name={copied ? "check" : "copy"}
                size={15}
                color={copied ? color.success : color.inkFaint}
                strokeWidth={2}
              />
            </View>
          </Row>
        </RowGroup>

        {tx.note !== null && tx.note !== "" && (
          <Card style={{ marginTop: space.md, paddingHorizontal: space.lg }}>
            <Txt size={11} weight={600} color={color.inkMuted}>
              Note
            </Txt>
            <Txt size={13} weight={500} style={{ marginTop: 2 }}>
              {tx.note}
            </Txt>
          </Card>
        )}

        <Card style={{ marginTop: space.md, paddingHorizontal: space.lg }}>
          <Txt size={13} weight={700} color={color.inkMuted} style={{ marginBottom: space.sm }}>
            Timeline
          </Txt>
          <TimelineCompact steps={timelineSteps(tx)} />
        </Card>

        {!incoming && tx.counterparty !== null && (
          <Button
            label="Send again"
            variant="secondary"
            onPress={sendAgain}
            style={{ marginTop: space.lg }}
          />
        )}
      </ScrollView>
      <HomeIndicator />
    </Screen>
  );
}

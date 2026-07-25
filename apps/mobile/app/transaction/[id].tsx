import { ScrollView, Share, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { formatAmount, formatRate, type Transaction } from "@caribpay/shared";
import { color, space } from "@/theme";
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

function timelineSteps(tx: Transaction): Step[] {
  const terminal = tx.status === "settled" || tx.status === "failed";
  const settledAt = tx.settledAt === null ? undefined : dateTimeLabel(tx.settledAt);
  return [
    { label: "Initiated", detail: dateTimeLabel(tx.createdAt), state: "done" },
    {
      label: "Pending settlement",
      detail: terminal ? undefined : "In progress",
      state: terminal ? "done" : "active",
    },
    tx.status === "failed"
      ? { label: "Settlement failed", detail: settledAt, state: "failed" }
      : {
          label: "Settled",
          detail: settledAt,
          state: tx.status === "settled" ? "done" : "upcoming",
        },
  ];
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const transfer = useTransfer(id);
  const setRecipient = useDraftStore((s) => s.setRecipient);
  const reset = useDraftStore((s) => s.reset);

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
        `Reference: ${tx.id}`,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    }).catch(() => undefined);
  }

  function sendAgain() {
    if (tx.counterparty === null) return;
    reset();
    setRecipient({
      address: tx.counterparty.walletAddress,
      displayName: tx.counterparty.displayName,
      countryCode: tx.counterparty.countryCode,
      currency: tx.destCurrency,
    });
    router.push("/send");
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
            <DetailRow label="Counterparty" value={tx.counterparty.walletAddress} />
          )}
          {tx.failureReason !== null && (
            <DetailRow label="Failure" value={tx.failureReason} tone={color.errorText} />
          )}
          <Row paddingVertical={12} last>
            <Txt size={13} weight={600} color={color.inkMuted}>
              Reference
            </Txt>
            <Txt size={12} weight={700} tabular numberOfLines={1} style={{ flexShrink: 1 }}>
              {tx.id}
            </Txt>
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

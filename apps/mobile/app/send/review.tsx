import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { formatAmount, formatRate, toMinor, type Currency } from "@caribpay/shared";
import { color, radius, shadow, space } from "@/theme";
import { Icon } from "@/components/Icon";
import {
  Avatar,
  Button,
  HomeIndicator,
  Notice,
  Pill,
  Row,
  RowGroup,
  Screen,
  ScreenHeader,
  Txt,
} from "@/components/ui";
import { useCreateTransfer, useFxQuote } from "@/api/hooks";
import { useDraftStore } from "@/stores/draft";
import { ApiRequestError, ApiUnreachableError } from "@/api/client";
import { countdownLabel, secondsUntil } from "@/lib/datetime";

/**
 * Two different truths, and blurring them is the worst thing this screen can do.
 * A request the server rejected never posted, so saying so is honest. A request
 * we never heard back from may well have posted — the transfer could be settling
 * right now — so the only honest thing is to say we do not know and point at the
 * place that does. Retrying is safe either way: the draft's idempotency key makes
 * a second attempt replay the first rather than send twice.
 */
function SendError({ error }: { error: unknown }) {
  if (error instanceof ApiRequestError && error.status < 500) {
    return (
      <Notice
        tone="error"
        title="Could not send this transfer"
        body={error.message}
        reference={error.code}
      />
    );
  }

  const lead =
    error instanceof ApiUnreachableError && error.timedOut
      ? "The connection timed out before we heard back."
      : "We didn't hear back from CaribPay.";
  return (
    <Notice
      tone="pending"
      title="We couldn't confirm this transfer"
      body={`${lead} We don't know yet whether it went through — check your Transfers list first, and it will be there if it did.`}
    />
  );
}

function DetailRow({
  label,
  children,
  last = false,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <Row last={last}>
      <Txt size={13} weight={600} color={color.inkMuted}>
        {label}
      </Txt>
      {children}
    </Row>
  );
}

export default function SendReviewScreen() {
  const router = useRouter();
  const draft = useDraftStore();
  const reset = useDraftStore((s) => s.reset);
  const setQuote = useDraftStore((s) => s.setQuote);
  const createTransfer = useCreateTransfer();

  const recipient = draft.recipient;
  const sourceCurrency = draft.sourceCurrency;

  // The quote the user agreed to on the previous screen.
  const reviewedQuote = draft.quote;
  const sourceAmountMinor =
    sourceCurrency === null ? null : safeToMinor(draft.amount, sourceCurrency);
  const crossCurrency =
    sourceCurrency !== null && recipient !== null && sourceCurrency !== recipient.currency;

  // Re-price in the background. If the new number differs from what the user
  // reviewed, we surface it rather than quietly sending a different amount.
  const fresh = useFxQuote(
    sourceCurrency ?? "XCD",
    recipient?.currency ?? "XCD",
    crossCurrency ? (sourceAmountMinor ?? 0) : 0,
  );

  const [remaining, setRemaining] = useState(() =>
    reviewedQuote === null ? 0 : secondsUntil(reviewedQuote.expiresAt),
  );
  useEffect(() => {
    if (reviewedQuote === null) return;
    const id = setInterval(() => setRemaining(secondsUntil(reviewedQuote.expiresAt)), 1000);
    return () => clearInterval(id);
  }, [reviewedQuote]);

  if (recipient === null || sourceCurrency === null || sourceAmountMinor === null) {
    return (
      <Screen>
        <ScreenHeader title="Review transfer" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xxl, gap: space.lg }}>
          <Txt size={17} weight={700} align="center">
            This transfer is no longer set up
          </Txt>
          <Button label="Start again" onPress={() => router.replace("/send")} />
        </View>
      </Screen>
    );
  }

  const destCurrency = recipient.currency;
  const expired = crossCurrency && reviewedQuote !== null && remaining <= 0;
  const drifted =
    crossCurrency &&
    reviewedQuote !== null &&
    fresh.data !== undefined &&
    fresh.data.destAmountMinor !== reviewedQuote.destAmountMinor;

  // What we would actually send right now.
  const effectiveQuote = expired || drifted ? fresh.data : reviewedQuote;
  const destAmountMinor = crossCurrency
    ? effectiveQuote?.destAmountMinor
    : sourceAmountMinor;

  const needsReconfirm = expired || drifted;
  const canSend =
    !createTransfer.isPending &&
    (!crossCurrency || (effectiveQuote !== undefined && effectiveQuote !== null));

  // The quote id travels in the request body, so confirming a re-priced quote is
  // a different transfer and must not replay the earlier attempt's response.
  const idempotencyKey =
    effectiveQuote == null
      ? draft.idempotencyKey
      : `${draft.idempotencyKey}-${effectiveQuote.id}`;

  // An arrow const, not a hoisted `function`, so the null-guard above narrows here.
  const send = () => {
    if (!canSend) return;
    createTransfer.mutate(
      {
        toKey: recipient.key,
        sourceAccountId: draft.sourceAccountId!,
        sourceCurrency,
        destCurrency,
        sourceAmountMinor,
        note: draft.note.trim() === "" ? undefined : draft.note.trim(),
        quoteId: crossCurrency ? (effectiveQuote?.id ?? undefined) : undefined,
        idempotencyKey,
      },
      {
        onSuccess: (tx) => {
          reset();
          // Collapse the send flow before showing status, so the now-enabled
          // back gesture returns to the tab root rather than to a compose
          // screen whose draft we just cleared.
          if (router.canDismiss()) router.dismissAll();
          router.replace(`/transfer/${tx.id}`);
        },
      },
    );
  };

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Review transfer" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.sm }}
      >
        {needsReconfirm && effectiveQuote != null && reviewedQuote !== null && (
          <Notice
            tone="pending"
            title="The rate moved while you were away"
            body="Nothing has been sent. Here's the current rate — confirm to continue, or go back and change the amount."
          />
        )}

        {createTransfer.isError && (
          <View style={{ paddingTop: needsReconfirm ? space.md : 0 }}>
            <SendError error={createTransfer.error} />
          </View>
        )}

        {/* Recipient */}
        <View style={{ alignItems: "center", gap: 10, marginTop: needsReconfirm ? space.lg : 14 }}>
          <Avatar
            name={recipient.maskedName}
            size={needsReconfirm ? 60 : 66}
            country={recipient.countryCode}
            currency={destCurrency}
            badgeBackground={color.bg}
          />
          <View style={{ alignItems: "center" }}>
            <Txt size={12} weight={600} color={color.inkMuted}>
              Sending to
            </Txt>
            <Txt size={needsReconfirm ? 17 : 20} weight={800} numberOfLines={1}>
              {recipient.maskedName}
            </Txt>
            {!needsReconfirm && (
              <Txt size={12} weight={500} color={color.inkMuted} tabular>
                {recipient.primaryVpa}
              </Txt>
            )}
          </View>
        </View>

        <RowGroup style={{ marginTop: space.lg }}>
          <DetailRow label="You send">
            <Txt size={17} weight={800} tabular>
              {formatAmount(sourceAmountMinor, sourceCurrency)}
            </Txt>
          </DetailRow>

          {needsReconfirm && reviewedQuote !== null && (
            <DetailRow label="Old quote">
              <Txt
                size={13}
                weight={600}
                color={color.inkFaint}
                tabular
                style={{ textDecorationLine: "line-through" }}
              >
                {formatAmount(reviewedQuote.destAmountMinor, destCurrency)}
              </Txt>
            </DetailRow>
          )}

          <DetailRow label={needsReconfirm ? "They receive now" : "They receive"}>
            <Txt size={17} weight={800} color={color.link} tabular>
              {destAmountMinor === undefined
                ? "…"
                : formatAmount(destAmountMinor, destCurrency)}
            </Txt>
          </DetailRow>

          {needsReconfirm && reviewedQuote !== null && destAmountMinor !== undefined && (
            <DetailRow label="Difference">
              <Txt size={13} weight={700} color={color.pending} tabular>
                {formatAmount(destAmountMinor - reviewedQuote.destAmountMinor, destCurrency, {
                  sign: "always",
                })}
              </Txt>
            </DetailRow>
          )}

          {crossCurrency && (
            <DetailRow label={needsReconfirm ? "New rate" : "Rate (locked)"}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                {effectiveQuote != null && (
                  <Txt size={13} weight={700} tabular>
                    {formatRate(effectiveQuote.rate, sourceCurrency, destCurrency)}
                  </Txt>
                )}
                <Pill
                  tone="primary"
                  label={countdownLabel(
                    effectiveQuote == null ? 0 : secondsUntil(effectiveQuote.expiresAt),
                  )}
                />
              </View>
            </DetailRow>
          )}

          <DetailRow label="Fee">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Txt size={13} weight={800} color={color.success}>
                Free
              </Txt>
              <Pill tone="success" label="No US$" />
            </View>
          </DetailRow>

          <DetailRow label="Arrives" last>
            <Txt size={13} weight={700}>
              Usually within minutes
            </Txt>
          </DetailRow>
        </RowGroup>

        {draft.note.trim() !== "" && (
          <View
            style={[
              {
                marginTop: space.md,
                backgroundColor: color.surface,
                borderRadius: radius.field,
                padding: 14,
                flexDirection: "row",
                gap: 10,
              },
              shadow.card,
            ]}
          >
            <Icon name="note" size={17} color={color.inkMuted} strokeWidth={1.8} />
            <View style={{ flex: 1 }}>
              <Txt size={11} weight={600} color={color.inkMuted}>
                Note
              </Txt>
              <Txt size={13} weight={500}>
                {draft.note.trim()}
              </Txt>
            </View>
          </View>
        )}

      </ScrollView>

      {/*
        Pinned action zone. Keeping it out of the scroll view means the rate-moved
        notice and its three extra rows no longer push "Confirm & send" downward
        while the thumb is already travelling toward it.
      */}
      <View style={{ gap: 10, paddingHorizontal: space.gutter, paddingTop: space.md }}>
        <Button
          label={needsReconfirm ? "Confirm at new rate" : "Confirm & send"}
          icon={needsReconfirm ? undefined : "checkWide"}
          loading={createTransfer.isPending}
          disabled={!canSend}
          onPress={send}
        />
        <Button
          label={needsReconfirm ? "Change amount" : "Back"}
          variant="secondary"
          height={needsReconfirm ? 52 : 48}
          onPress={() => {
            setQuote(null);
            router.back();
          }}
        />
      </View>
      <HomeIndicator />
    </Screen>
  );
}

function safeToMinor(amount: string, currency: Currency): number | null {
  try {
    const minor = toMinor(amount, currency);
    return minor > 0 ? minor : null;
  } catch {
    return null;
  }
}

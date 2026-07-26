import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  formatAmount,
  formatRate,
  shortReference,
  toMinor,
  type Currency,
} from "@caribpay/shared";
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
import { useDraftStore, type DraftRecipient } from "@/stores/draft";
import { ApiRequestError, ApiUnreachableError } from "@/api/client";
import { countdownLabel, secondsUntil, timeLabel } from "@/lib/datetime";

/**
 * Two different truths, and blurring them is the worst thing this flow can do.
 * A request the server refused never posted, so saying so is honest. A request
 * we never heard back from may well have posted — the transfer could be settling
 * right now — so the only honest thing is to say we do not know and point at the
 * place that does. Each gets a whole screen, because each has different actions
 * and leaving "Confirm & send" underneath either one invites the wrong move.
 */

/**
 * Rejected: the switch answered, and the answer was no.
 *
 * There is deliberately **no "Try again"**. The request was understood and
 * refused; sending the identical thing again gets the identical answer, and a
 * retry button here would only teach people to hammer it. The reason is stated
 * plainly, the balance is confirmed untouched, and both offered actions lead
 * somewhere real.
 */
function Rejected({
  error,
  recipient,
  sourceAmountMinor,
  sourceCurrency,
  attemptedAt,
  onChangeRecipient,
}: {
  error: ApiRequestError;
  recipient: DraftRecipient;
  sourceAmountMinor: number;
  sourceCurrency: Currency;
  attemptedAt: number;
  onChangeRecipient: () => void;
}) {
  const router = useRouter();

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Not sent" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.sm }}
      >
        <View style={{ alignItems: "center", gap: 10, marginTop: space.lg }}>
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: color.errorSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="close" size={26} color={color.error} strokeWidth={2.4} />
          </View>
          <Txt size={22} weight={800} align="center" tracking={-0.02}>
            This transfer was not sent
          </Txt>
          <Txt size={14} weight={500} color={color.inkMuted} align="center" leading={1.5}>
            Nothing left your account. There is nothing to cancel.
          </Txt>
        </View>

        <RowGroup style={{ marginTop: space.xl }}>
          <Row alignTop>
            <Txt size={13} weight={600} color={color.inkMuted}>
              Reason given
            </Txt>
            <Txt
              size={13}
              weight={700}
              align="right"
              leading={1.4}
              style={{ flex: 1, marginLeft: space.lg }}
            >
              {error.message}
            </Txt>
          </Row>
          <Row>
            <Txt size={13} weight={600} color={color.inkMuted}>
              Your balance
            </Txt>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Txt size={13} weight={700} color={color.success}>
                Unchanged
              </Txt>
              <Icon name="check" size={14} color={color.success} strokeWidth={2.4} />
            </View>
          </Row>
          <Row>
            <Txt size={13} weight={600} color={color.inkMuted}>
              You were sending
            </Txt>
            <Txt size={13} weight={700} tabular>
              {formatAmount(sourceAmountMinor, sourceCurrency)}
            </Txt>
          </Row>
          <Row>
            <Txt size={13} weight={600} color={color.inkMuted}>
              To
            </Txt>
            <Txt size={13} weight={700} numberOfLines={1} style={{ flex: 1 }} align="right">
              {recipient.maskedName}
            </Txt>
          </Row>
          <Row last>
            <Txt size={13} weight={600} color={color.inkMuted}>
              Attempted
            </Txt>
            <Txt size={13} weight={700} tabular>
              {timeLabel(new Date(attemptedAt).toISOString())}
            </Txt>
          </Row>
        </RowGroup>

        <Txt size={12} weight={500} color={color.inkFaint} tabular style={{ marginTop: space.md }}>
          Ref {error.code}
        </Txt>
      </ScrollView>

      <View style={{ gap: 10, paddingHorizontal: space.gutter, paddingTop: space.md }}>
        <Button label="Choose another recipient" onPress={onChangeRecipient} />
        <Button
          label="Back to home"
          variant="secondary"
          height={48}
          onPress={() => {
            if (router.canDismiss()) router.dismissAll();
            router.replace("/(tabs)/home");
          }}
        />
      </View>
      <HomeIndicator />
    </Screen>
  );
}

/**
 * Outcome unknown: we asked, and never heard back.
 *
 * The hardest state to write honestly, because the tempting copy — "it failed",
 * "try again" — is wrong in both directions. The request may well have posted;
 * the transfer could be settling right now. So this screen refuses to claim an
 * outcome, hands over a reference that identifies the attempt, says what is
 * being done about it, and sends the user to the one place that will know.
 */
function OutcomeUnknown({
  error,
  reference,
  recipient,
  sourceAmountMinor,
  sourceCurrency,
  attemptedAt,
}: {
  error: unknown;
  reference: string;
  recipient: DraftRecipient;
  sourceAmountMinor: number;
  sourceCurrency: Currency;
  attemptedAt: number;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const lead =
    error instanceof ApiUnreachableError && error.timedOut
      ? "The connection timed out before we heard back."
      : "We didn't hear back after sending your request.";

  async function copy() {
    await Clipboard.setStringAsync(reference);
    setCopied(true);
  }

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Outcome unknown" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.sm }}
      >
        <View style={{ alignItems: "center", gap: 10, marginTop: space.lg }}>
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: color.pendingSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="clock" size={26} color={color.pending} strokeWidth={2.2} />
          </View>
          <Txt size={22} weight={800} align="center" tracking={-0.02}>
            We don&rsquo;t know yet
          </Txt>
          <Txt size={14} weight={500} color={color.inkMuted} align="center" leading={1.5}>
            {lead} This transfer may have gone through, so don&rsquo;t start it again from scratch.
          </Txt>
        </View>

        <RowGroup style={{ marginTop: space.xl }}>
          <Row>
            <Txt size={13} weight={600} color={color.inkMuted}>
              Reference
            </Txt>
            <Txt size={15} weight={800} tabular>
              {reference}
            </Txt>
          </Row>
          <Row>
            <Txt size={13} weight={600} color={color.inkMuted}>
              Amount
            </Txt>
            <Txt size={13} weight={700} tabular>
              {formatAmount(sourceAmountMinor, sourceCurrency)}
            </Txt>
          </Row>
          <Row>
            <Txt size={13} weight={600} color={color.inkMuted}>
              To
            </Txt>
            <Txt size={13} weight={700} numberOfLines={1} style={{ flex: 1 }} align="right">
              {recipient.maskedName}
            </Txt>
          </Row>
          <Row last>
            <Txt size={13} weight={600} color={color.inkMuted}>
              Last seen
            </Txt>
            <Txt size={13} weight={700} tabular>
              {timeLabel(new Date(attemptedAt).toISOString())}
            </Txt>
          </Row>
        </RowGroup>

        <View style={{ marginTop: space.md }}>
          <Notice
            tone="primary"
            icon="info"
            title="What we are doing about it"
            body="If your request reached us it is already being worked through and will appear in your transfers. If it never arrived, nothing was held and nothing will happen. Either way this resolves without you doing anything."
          />
        </View>
      </ScrollView>

      <View style={{ gap: 10, paddingHorizontal: space.gutter, paddingTop: space.md }}>
        <Button
          label="Open my transfers"
          onPress={() => {
            if (router.canDismiss()) router.dismissAll();
            router.replace("/(tabs)/activity");
          }}
        />
        <Button
          label={copied ? "Reference copied" : "Copy reference"}
          icon={copied ? "check" : "copy"}
          variant="secondary"
          height={48}
          onPress={() => void copy()}
        />
      </View>
      <HomeIndicator />
    </Screen>
  );
}

/**
 * The rate moved: what they would have received, and what they will.
 *
 * Two numbers side by side rather than one struck-through row, because the
 * question being asked is a comparison and the eye should be able to make it in
 * one movement. The sentence underneath does the subtraction so nobody has to —
 * and it names the person, since "you receive 4.54 less" would be wrong: the
 * payer sends the same amount either way.
 */
function WasNow({
  was,
  now,
  currency,
  firstName,
}: {
  was: number;
  now: number;
  currency: Currency;
  firstName: string;
}) {
  const delta = now - was;
  const better = delta >= 0;

  return (
    <View
      style={[
        {
          marginTop: space.md,
          backgroundColor: color.surface,
          borderRadius: radius.card,
          padding: 16,
          gap: 12,
        },
        shadow.card,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt size={11} weight={700} color={color.inkFaint}>
            WAS
          </Txt>
          <Txt size={18} weight={700} color={color.inkFaint} tabular numberOfLines={1}>
            {formatAmount(was, currency)}
          </Txt>
        </View>
        <Icon name="arrowRight" size={18} color={color.inkFaint} strokeWidth={2} />
        <View style={{ flex: 1, gap: 4, alignItems: "flex-end" }}>
          <Txt size={11} weight={700} color={color.inkMuted}>
            NOW
          </Txt>
          <Txt size={18} weight={800} tabular numberOfLines={1}>
            {formatAmount(now, currency)}
          </Txt>
        </View>
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: color.hairlineFaint,
          paddingTop: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Icon
          name={better ? "trendUp" : "trendDown"}
          size={15}
          color={better ? color.success : color.pending}
          strokeWidth={2.2}
        />
        <Txt size={13} weight={600} style={{ flex: 1 }}>
          {firstName} receives {formatAmount(Math.abs(delta), currency)} {better ? "more" : "less"}
        </Txt>
      </View>
    </View>
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

  // The switch answered no. A refusal and a silence are different outcomes with
  // different actions, so each takes over the screen rather than sitting as a
  // banner above a "Confirm & send" button that would repeat the mistake.
  if (createTransfer.isError) {
    const error = createTransfer.error;
    if (error instanceof ApiRequestError && error.status < 500) {
      return (
        <Rejected
          error={error}
          recipient={recipient}
          sourceAmountMinor={sourceAmountMinor}
          sourceCurrency={sourceCurrency}
          attemptedAt={createTransfer.submittedAt}
          onChangeRecipient={() => {
            reset();
            router.replace("/send");
          }}
        />
      );
    }
    return (
      <OutcomeUnknown
        error={error}
        reference={shortReference(draft.idempotencyKey)}
        recipient={recipient}
        sourceAmountMinor={sourceAmountMinor}
        sourceCurrency={sourceCurrency}
        attemptedAt={createTransfer.submittedAt}
      />
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
          <>
            <Notice
              tone="pending"
              title="The rate moved while you were away"
              body="Nothing has been sent. Confirm to continue at the rate below, or go back and change the amount."
            />
            <WasNow
              was={reviewedQuote.destAmountMinor}
              now={effectiveQuote.destAmountMinor}
              currency={destCurrency}
              firstName={recipient.maskedName.split(" ")[0] ?? "They"}
            />
          </>
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

          <DetailRow label="They receive">
            <Txt size={17} weight={800} color={color.link} tabular>
              {destAmountMinor === undefined ? "…" : formatAmount(destAmountMinor, destCurrency)}
            </Txt>
          </DetailRow>

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
              {/* Settled green: a zero fee is a good outcome, not a neutral fact. */}
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

        {/*
          The hold explained before the money moves. "Holds" is the honest verb:
          the money is reserved at the payer's bank and released in full if the
          other side declines.
        */}
        <Txt
          size={12}
          weight={500}
          color={color.inkMuted}
          leading={1.45}
          style={{ marginTop: space.md }}
        >
          Your bank holds {formatAmount(sourceAmountMinor, sourceCurrency)} now and releases it
          when {recipient.maskedName.split(" ")[0]}&rsquo;s bank confirms. If that fails, the hold
          is released in full.
        </Txt>
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

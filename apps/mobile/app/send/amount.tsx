import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import {
  CURRENCY_NAMES,
  CURRENCY_SYMBOLS,
  formatAmount,
  formatRate,
  groupDigits,
  toMinor,
  type Currency,
} from "@caribpay/shared";
import { color, radius, shadow, space } from "@/theme";
import { Icon } from "@/components/Icon";
import { Flag } from "@/components/Flag";
import {
  Button,
  HomeIndicator,
  Keypad,
  Notice,
  PickerSheet,
  Pill,
  Screen,
  ScreenHeader,
  Txt,
  applyKey,
} from "@/components/ui";
import { useAccountBalance, useAccounts, useFxQuote } from "@/api/hooks";
import { useDraftStore } from "@/stores/draft";
import { useDebounce } from "@/lib/useDebounce";
import { countdownLabel, secondsUntil } from "@/lib/datetime";

function safeToMinor(amount: string, currency: Currency): number | null {
  try {
    const minor = toMinor(amount, currency);
    return minor > 0 ? minor : null;
  } catch {
    return null;
  }
}

/** Live countdown on the quote's 60-second lock. */
function useQuoteCountdown(expiresAt: string | undefined): number | null {
  const [remaining, setRemaining] = useState(() =>
    expiresAt === undefined ? null : secondsUntil(expiresAt),
  );
  useEffect(() => {
    if (expiresAt === undefined) {
      setRemaining(null);
      return;
    }
    setRemaining(secondsUntil(expiresAt));
    const id = setInterval(() => setRemaining(secondsUntil(expiresAt)), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

/**
 * Step three: how much.
 *
 * The typed figure is grouped as it is entered, so the digit count a payer
 * checks here reads the same as it will on the review screen. An
 * order-of-magnitude slip is the error this screen exists to prevent.
 */
export default function SendAmountScreen() {
  const router = useRouter();
  const accounts = useAccounts();
  const draft = useDraftStore();
  const setSourceAccount = useDraftStore((s) => s.setSourceAccount);
  const [pickerOpen, setPickerOpen] = useState(false);

  const linked = accounts.data?.accounts ?? [];
  const recipient = draft.recipient;

  const sourceAccount =
    linked.find((a) => a.id === draft.sourceAccountId) ?? linked.find((a) => a.isDefault) ?? linked[0];
  const sourceCurrency = sourceAccount?.currency;

  // Default the funding account once the list arrives.
  useEffect(() => {
    if (draft.sourceAccountId === null && sourceAccount !== undefined) {
      setSourceAccount(sourceAccount.id, sourceAccount.currency);
    }
  }, [draft.sourceAccountId, sourceAccount, setSourceAccount]);

  const balance = useAccountBalance(sourceAccount?.id);
  const debouncedAmount = useDebounce(draft.amount, 350);
  const sourceAmountMinor =
    sourceCurrency === undefined ? null : safeToMinor(debouncedAmount, sourceCurrency);
  const crossCurrency =
    sourceCurrency !== undefined && recipient !== null && sourceCurrency !== recipient.currency;

  const quote = useFxQuote(
    sourceCurrency ?? "XCD",
    recipient?.currency ?? "XCD",
    crossCurrency ? (sourceAmountMinor ?? 0) : 0,
  );
  const lockRemaining = useQuoteCountdown(quote.data?.expiresAt);

  const destAmountMinor = crossCurrency ? quote.data?.destAmountMinor : sourceAmountMinor;
  const typedMinor =
    sourceCurrency === undefined ? null : safeToMinor(draft.amount, sourceCurrency);
  const available = balance.data?.availableMinor;
  const overBalance = typedMinor !== null && available !== undefined && typedMinor > available;

  const canReview =
    recipient !== null &&
    sourceAccount !== undefined &&
    typedMinor !== null &&
    !overBalance &&
    (!crossCurrency || quote.data !== undefined);

  const accountOptions = useMemo(
    () =>
      linked.map((a) => ({
        value: a.id,
        label: a.institutionDisplayName,
        detail: `${a.accountNumberMasked} · ${CURRENCY_NAMES[a.currency]}`,
        leading: <Flag currency={a.currency} country={a.countryCode} size={30} />,
      })),
    [linked],
  );

  if (recipient === null) {
    // Landed here without a recipient — send them back rather than guessing.
    router.replace("/send");
    return null;
  }

  function proceed() {
    if (!canReview) return;
    draft.setQuote(quote.data ?? null);
    router.push("/send/review");
  }

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Amount" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: space.sm }}>
        <View
          style={[
            {
              marginHorizontal: space.gutter,
              marginTop: space.md,
              backgroundColor: color.surface,
              borderRadius: radius.cardLg,
              padding: 18,
            },
            shadow.panel,
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Txt size={13} weight={600} color={color.inkMuted}>
              You send
            </Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change the account you're sending from"
              onPress={() => setPickerOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: color.tintRow,
                paddingHorizontal: 8,
                paddingVertical: 6,
                borderRadius: radius.pill,
              }}
            >
              <Flag currency={sourceCurrency} country={sourceAccount?.countryCode} size={18} />
              <Txt size={13} weight={700}>
                {sourceCurrency === undefined ? "—" : CURRENCY_SYMBOLS[sourceCurrency]}
              </Txt>
              <Icon name="chevronDown" size={13} color={color.inkMuted} strokeWidth={2.4} />
            </Pressable>
          </View>
          <Txt
            size={31}
            weight={800}
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ marginTop: 4 }}
          >
            {sourceCurrency === undefined
              ? "—"
              : `${CURRENCY_SYMBOLS[sourceCurrency]}${groupDigits(draft.amount)}`}
          </Txt>

          <View style={{ height: 1, backgroundColor: color.borderSoft, marginVertical: space.md }} />

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Txt size={13} weight={600} color={color.inkMuted}>
              They receive
            </Txt>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: color.tintRow,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: radius.pill,
              }}
            >
              <Flag currency={recipient.currency} country={recipient.countryCode} size={18} />
              <Txt size={13} weight={700}>
                {CURRENCY_SYMBOLS[recipient.currency]}
              </Txt>
            </View>
          </View>
          <Txt size={31} weight={800} color={color.link} tabular numberOfLines={1} style={{ marginTop: 4 }}>
            {destAmountMinor === undefined || destAmountMinor === null
              ? quote.isFetching
                ? "…"
                : `${CURRENCY_SYMBOLS[recipient.currency]}0.00`
              : formatAmount(destAmountMinor, recipient.currency)}
          </Txt>
        </View>

        <View
          style={{
            marginHorizontal: space.gutter,
            marginTop: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space.sm,
          }}
        >
          <Txt size={13} weight={600} color={color.inkMuted} tabular style={{ flex: 1 }}>
            {crossCurrency && quote.data !== undefined && sourceCurrency !== undefined
              ? formatRate(quote.data.rate, sourceCurrency, recipient.currency)
              : crossCurrency
                ? "Getting today's rate…"
                : "Same currency · no conversion"}
          </Txt>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {crossCurrency && lockRemaining !== null && lockRemaining > 0 && (
              <Pill tone="primary" icon="clock" label={`Locks ${countdownLabel(lockRemaining)}`} />
            )}
            <Pill tone="success" label="Fee-free" />
          </View>
        </View>

        {overBalance && sourceCurrency !== undefined && available !== undefined && (
          <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md }}>
            <Notice
              tone="error"
              title="More than your bank has available"
              body={`Your ${sourceAccount?.institutionDisplayName} account has ${formatAmount(
                available,
                sourceCurrency,
              )} available right now.`}
            />
          </View>
        )}

        {crossCurrency && quote.isError && (
          <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md }}>
            <Notice
              tone="error"
              title="No rate for this pair"
              body="We can't price this conversion right now. Try a different account."
            />
          </View>
        )}
      </ScrollView>

      {/* Pinned: neither the keypad nor the primary action may scroll away. */}
      <View style={{ paddingTop: space.md }}>
        <Keypad onKey={(key) => draft.setAmount(applyKey(draft.amount, key))} />
        <View style={{ paddingHorizontal: space.gutter, paddingTop: 6 }}>
          <Button
            label="Review transfer"
            disabled={!canReview}
            loading={crossCurrency && quote.isFetching && quote.data === undefined}
            onPress={proceed}
          />
        </View>
      </View>

      <PickerSheet
        visible={pickerOpen}
        title="Send from"
        options={accountOptions}
        value={sourceAccount?.id}
        onSelect={(id) => {
          const picked = linked.find((a) => a.id === id);
          if (picked !== undefined) setSourceAccount(picked.id, picked.currency);
        }}
        onClose={() => setPickerOpen(false)}
      />
      <HomeIndicator />
    </Screen>
  );
}

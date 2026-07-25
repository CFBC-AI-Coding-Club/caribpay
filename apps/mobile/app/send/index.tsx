import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  CURRENCY_NAMES,
  CURRENCY_SYMBOLS,
  COUNTRY_NAMES,
  formatAmount,
  formatRate,
  homeCurrencyFor,
  toMinor,
  type Currency,
} from "@caribpay/shared";
import { color, radius, shadow, space } from "@/theme";
import { Icon } from "@/components/Icon";
import { Flag } from "@/components/Flag";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  HomeIndicator,
  Keypad,
  ListRow,
  Loading,
  Notice,
  PickerSheet,
  Pill,
  Screen,
  ScreenHeader,
  Segmented,
  TextField,
  Txt,
  applyKey,
} from "@/components/ui";
import { useAddressLookup, useContacts, useFxQuote, useMe, useWallets } from "@/api/hooks";
import { useDraftStore, type DraftRecipient } from "@/stores/draft";
import { useDebounce } from "@/lib/useDebounce";
import { countdownLabel, secondsUntil } from "@/lib/datetime";

type Mode = "contact" | "address" | "scan";

const MODES = [
  { value: "contact" as const, label: "Contact" },
  { value: "address" as const, label: "Address" },
  { value: "scan" as const, label: "Scan QR" },
];

/** Parse a typed amount to minor units, or null when it isn't a usable number. */
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

export default function SendComposeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();

  const wallets = useWallets();
  const me = useMe();

  const draft = useDraftStore();
  const setSourceCurrency = useDraftStore((s) => s.setSourceCurrency);
  const [mode, setMode] = useState<Mode>("contact");
  const [addressInput, setAddressInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const owned = wallets.data?.wallets ?? [];
  const homeCurrency =
    me.data === undefined ? undefined : homeCurrencyFor(me.data.user.countryCode);

  // Default the funding wallet: an explicit ?from wins, then home, then the first.
  const sourceCurrency: Currency | undefined =
    draft.sourceCurrency ??
    (params.from as Currency | undefined) ??
    (owned.some((w) => w.currency === homeCurrency) ? homeCurrency : owned[0]?.currency);

  const sourceUnset = draft.sourceCurrency === null;
  useEffect(() => {
    if (sourceUnset && sourceCurrency !== undefined) setSourceCurrency(sourceCurrency);
  }, [sourceUnset, sourceCurrency, setSourceCurrency]);

  const sourceWallet = owned.find((w) => w.currency === sourceCurrency);
  const destCurrency = draft.recipient?.currency;

  const debouncedAmount = useDebounce(draft.amount, 350);
  const sourceAmountMinor =
    sourceCurrency === undefined ? null : safeToMinor(debouncedAmount, sourceCurrency);
  const crossCurrency =
    sourceCurrency !== undefined && destCurrency !== undefined && sourceCurrency !== destCurrency;

  const quote = useFxQuote(
    sourceCurrency ?? "XCD",
    destCurrency ?? "XCD",
    crossCurrency ? (sourceAmountMinor ?? 0) : 0,
  );
  const lockRemaining = useQuoteCountdown(quote.data?.expiresAt);

  // What the recipient gets: the quoted amount cross-currency, else the same amount.
  const destAmountMinor = crossCurrency ? quote.data?.destAmountMinor : sourceAmountMinor;

  const typedMinor = sourceCurrency === undefined ? null : safeToMinor(draft.amount, sourceCurrency);
  const overBalance =
    typedMinor !== null && sourceWallet !== undefined && typedMinor > sourceWallet.balanceMinor;

  const canReview =
    draft.recipient !== null &&
    sourceCurrency !== undefined &&
    typedMinor !== null &&
    !overBalance &&
    (!crossCurrency || quote.data !== undefined);

  const walletOptions = useMemo(
    () =>
      owned.map((w) => ({
        value: w.currency,
        label: CURRENCY_NAMES[w.currency],
        detail: `${formatAmount(w.balanceMinor, w.currency)} available`,
        leading: <Flag currency={w.currency} size={30} />,
        disabled: w.balanceMinor === 0,
        disabledNote: "Empty",
      })),
    [owned],
  );

  function chooseContact(recipient: DraftRecipient) {
    draft.setRecipient(recipient);
  }

  function proceed() {
    if (!canReview) return;
    draft.setQuote(quote.data ?? null);
    router.push("/send/review");
  }

  if (wallets.isPending || me.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Send money" />
        <Loading label="Getting your wallets…" />
      </Screen>
    );
  }

  if (owned.length === 0 || owned.every((w) => w.balanceMinor === 0)) {
    return (
      <Screen>
        <ScreenHeader title="Send money" />
        <EmptyState
          icon="card"
          title="Nothing to send yet"
          body="Add money to a wallet and you'll be able to send it anywhere in the region."
          actionLabel="Receive money"
          onAction={() => router.replace("/receive")}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Send money" />

      {draft.recipient === null ? (
        <>
          <Segmented
            options={MODES}
            value={mode}
            onChange={(next) => {
              setMode(next);
              if (next === "scan") router.push("/scan");
            }}
            style={{ marginHorizontal: space.gutter, marginTop: 2 }}
          />
          {mode === "contact" ? (
            <ContactPicker onPick={chooseContact} />
          ) : mode === "address" ? (
            <AddressPicker value={addressInput} onChange={setAddressInput} onPick={chooseContact} />
          ) : (
            <Loading label="Opening the scanner…" />
          )}
        </>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.sm }}>
          {/* Recipient */}
          <Card style={{ marginHorizontal: space.gutter, marginTop: space.md, paddingHorizontal: 12 }}>
            <ListRow
              leading={
                <Avatar
                  name={draft.recipient.displayName}
                  size={42}
                  country={draft.recipient.countryCode}
                  currency={draft.recipient.currency}
                />
              }
              title={draft.recipient.displayName}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    draft.setRecipient(null);
                    setAddressInput("");
                  }}
                  style={{
                    height: 44,
                    paddingHorizontal: 14,
                    borderRadius: radius.chip,
                    backgroundColor: color.primarySoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Txt size={13} weight={700} color={color.link}>
                    Change
                  </Txt>
                </Pressable>
              }
            />
            <Txt size={11} weight={500} color={color.inkMuted} tabular style={{ paddingBottom: 10 }}>
              {draft.recipient.address} ·{" "}
              {COUNTRY_NAMES[draft.recipient.countryCode] ?? draft.recipient.countryCode}
            </Txt>
          </Card>

          {/* Converter */}
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
                accessibilityLabel="Change the wallet you're sending from"
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
                <Flag currency={sourceCurrency} size={18} />
                <Txt size={13} weight={700}>
                  {sourceCurrency === undefined ? "—" : CURRENCY_SYMBOLS[sourceCurrency]}
                </Txt>
                <Icon name="chevronDown" size={13} color={color.inkMuted} strokeWidth={2.4} />
              </Pressable>
            </View>
            <Txt size={31} weight={800} tabular style={{ marginTop: 4 }}>
              {sourceCurrency === undefined
                ? "—"
                : `${CURRENCY_SYMBOLS[sourceCurrency]}${draft.amount}`}
            </Txt>

            <View style={{ height: 1, backgroundColor: color.borderSoft, marginVertical: space.md }}>
              <View
                style={{
                  position: "absolute",
                  right: 0,
                  top: -17,
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: color.primarySoft,
                  borderWidth: 3,
                  borderColor: color.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="swap" size={17} color={color.link} strokeWidth={2} />
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Txt size={13} weight={600} color={color.inkMuted}>
                They receive
              </Txt>
              {/* Fixed by the recipient's wallet — not a choice, so no chevron. */}
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
                <Flag currency={destCurrency} country={draft.recipient.countryCode} size={18} />
                <Txt size={13} weight={700}>
                  {destCurrency === undefined ? "—" : CURRENCY_SYMBOLS[destCurrency]}
                </Txt>
              </View>
            </View>
            <Txt size={31} weight={800} color={color.link} tabular style={{ marginTop: 4 }}>
              {destAmountMinor === undefined || destAmountMinor === null || destCurrency === undefined
                ? quote.isFetching
                  ? "…"
                  : `${destCurrency === undefined ? "" : CURRENCY_SYMBOLS[destCurrency]}0.00`
                : formatAmount(destAmountMinor, destCurrency)}
            </Txt>
          </View>

          {/* Rate + guarantees */}
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
              {crossCurrency && quote.data !== undefined && sourceCurrency !== undefined && destCurrency !== undefined
                ? formatRate(quote.data.rate, sourceCurrency, destCurrency)
                : crossCurrency
                  ? "Getting today's rate…"
                  : "Same currency · no conversion"}
            </Txt>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {crossCurrency && lockRemaining !== null && (
                <Pill
                  tone="primary"
                  icon="clock"
                  label={lockRemaining > 0 ? `Locks ${countdownLabel(lockRemaining)}` : "Refreshing"}
                />
              )}
              <Pill tone="success" label="Fee-free" />
            </View>
          </View>

          {overBalance && sourceWallet !== undefined && sourceCurrency !== undefined && (
            <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md }}>
              <Notice
                tone="error"
                title="More than this wallet holds"
                body={`Your ${CURRENCY_SYMBOLS[sourceCurrency]} wallet has ${formatAmount(
                  sourceWallet.balanceMinor,
                  sourceCurrency,
                )} available.`}
              />
            </View>
          )}

          {crossCurrency && quote.isError && (
            <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md }}>
              <Notice
                tone="error"
                title="No rate for this pair"
                body="We can't price this conversion right now. Try a different wallet."
              />
            </View>
          )}

          <View style={{ height: space.lg }} />
          <Keypad onKey={(key) => draft.setAmount(applyKey(draft.amount, key))} />

          <View style={{ paddingHorizontal: space.gutter, paddingTop: 6 }}>
            <Button
              label="Review transfer"
              disabled={!canReview}
              loading={crossCurrency && quote.isFetching && quote.data === undefined}
              onPress={proceed}
            />
          </View>
        </ScrollView>
      )}

      <PickerSheet
        visible={pickerOpen}
        title="Send from"
        options={walletOptions}
        value={sourceCurrency}
        onSelect={(currency) => draft.setSourceCurrency(currency)}
        onClose={() => setPickerOpen(false)}
      />
      <HomeIndicator />
    </Screen>
  );
}

/** Pick from saved contacts. */
function ContactPicker({ onPick }: { onPick: (recipient: DraftRecipient) => void }) {
  const router = useRouter();
  const contacts = useContacts();

  if (contacts.isPending) return <Loading label="Loading contacts…" />;
  if (contacts.data === undefined || contacts.data.length === 0) {
    return (
      <EmptyState
        icon="peopleAdd"
        title="No saved contacts"
        body="Add someone, or switch to Address and paste a wallet address."
        actionLabel="Add contact"
        actionIcon="plus"
        onAction={() => router.push("/contact/add")}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.gutter, gap: 10 }}>
      {contacts.data.map((contact) => (
        <Card key={contact.id} padded={false} style={{ paddingHorizontal: 14 }}>
          <ListRow
            onPress={() =>
              onPick({
                address: contact.walletAddress,
                displayName: contact.displayName,
                countryCode: contact.countryCode,
                currency: contact.currency,
              })
            }
            leading={
              <Avatar
                name={contact.displayName}
                size={44}
                country={contact.countryCode}
                currency={contact.currency}
              />
            }
            title={contact.displayName}
            subtitle={`${contact.walletAddress} · ${CURRENCY_SYMBOLS[contact.currency]}`}
            trailing={<Icon name="chevronRight" size={18} color={color.inkSubtle} strokeWidth={2.2} />}
          />
        </Card>
      ))}
    </ScrollView>
  );
}

/** Type or paste a wallet address; we confirm the owner before continuing. */
function AddressPicker({
  value,
  onChange,
  onPick,
}: {
  value: string;
  onChange: (value: string) => void;
  onPick: (recipient: DraftRecipient) => void;
}) {
  const normalized = value.trim().toUpperCase();
  const lookup = useAddressLookup(normalized);

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.gutter, gap: space.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <TextField
        label="Wallet address"
        value={value}
        onChangeText={onChange}
        placeholder="CW-XXXX-XXXX-XXXX-XXXX"
        autoCapitalize="characters"
        autoCorrect={false}
        hint="Ask them to open Receive and share their address."
      />

      {lookup.isFetching && <Loading label="Looking up that address…" />}

      {lookup.isError && (
        <Notice
          tone="error"
          title="No account for that address"
          body="Double-check the address — every CaribPay address looks like CW-XXXX-XXXX-XXXX-XXXX."
        />
      )}

      {lookup.data !== undefined && (
        <Card style={{ paddingHorizontal: 14 }}>
          <ListRow
            onPress={() =>
              onPick({
                address: lookup.data.walletAddress,
                displayName: lookup.data.displayName,
                countryCode: lookup.data.countryCode,
                currency: lookup.data.currency,
              })
            }
            leading={
              <Avatar
                name={lookup.data.displayName}
                size={44}
                country={lookup.data.countryCode}
                currency={lookup.data.currency}
              />
            }
            title={lookup.data.displayName}
            subtitle={`${COUNTRY_NAMES[lookup.data.countryCode] ?? lookup.data.countryCode} · ${
              CURRENCY_SYMBOLS[lookup.data.currency]
            }`}
            trailing={<Icon name="chevronRight" size={18} color={color.inkSubtle} strokeWidth={2.2} />}
          />
        </Card>
      )}
    </ScrollView>
  );
}

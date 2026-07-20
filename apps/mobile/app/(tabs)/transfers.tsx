import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  SUPPORTED_CURRENCIES,
  WALLET_ADDRESS_PATTERN,
  formatMoney,
  toMinor,
  type Currency,
} from "@caribpay/shared";
import { useContacts, useCreateTransfer, useFxQuote, useWallets } from "@/api/hooks";
import { ApiRequestError } from "@/api/client";
import { useDebounce } from "@/lib/useDebounce";
import { Card, ErrorText, Field, Muted, PrimaryButton, colors } from "@/components/ui";

function safeToMinor(amount: string, currency: Currency): number | null {
  try {
    const minor = toMinor(amount, currency);
    return minor > 0 ? minor : null;
  } catch {
    return null;
  }
}

export default function SendScreen() {
  const router = useRouter();
  const wallets = useWallets();
  const contacts = useContacts();
  const createTransfer = useCreateTransfer();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [sourceCurrency, setSourceCurrency] = useState<Currency>("XCD");
  const [destCurrency, setDestCurrency] = useState<Currency>("XCD");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const debouncedAmount = useDebounce(amount, 400);
  const sourceAmountMinor = safeToMinor(debouncedAmount, sourceCurrency);
  const crossCurrency = sourceCurrency !== destCurrency;

  const quote = useFxQuote(sourceCurrency, destCurrency, crossCurrency ? sourceAmountMinor ?? 0 : 0);

  const ownedCurrencies = useMemo(
    () => wallets.data?.wallets.map((w) => w.currency) ?? [],
    [wallets.data],
  );

  const addressValid = WALLET_ADDRESS_PATTERN.test(recipient);
  const canSubmit =
    addressValid && sourceAmountMinor !== null && (!crossCurrency || quote.data !== undefined);

  const onSubmit = () => {
    setError(null);
    if (sourceAmountMinor === null) {
      setError("Enter a valid amount");
      return;
    }
    if (!addressValid) {
      setError("Enter a valid recipient address");
      return;
    }
    createTransfer.mutate(
      {
        recipientAddress: recipient.trim(),
        sourceCurrency,
        destCurrency,
        sourceAmountMinor,
        note: note.trim() === "" ? undefined : note.trim(),
        quoteId: crossCurrency ? quote.data?.id : undefined,
      },
      {
        onSuccess: (tx) => {
          setRecipient("");
          setAmount("");
          setNote("");
          router.push(`/transfer/${tx.id}`);
        },
        onError: (e) =>
          setError(e instanceof ApiRequestError ? e.message : "Could not start transfer"),
      },
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ErrorText message={error} />

        <Field
          label="Recipient wallet address"
          value={recipient}
          onChangeText={setRecipient}
          placeholder="CW-XXXX-XXXX-XXXX-XXXX"
          autoCapitalize="characters"
        />

        {contacts.data !== undefined && contacts.data.length > 0 ? (
          <View style={styles.contactsRow}>
            {contacts.data.map((contact) => (
              <Pressable
                key={contact.id}
                style={styles.contactChip}
                onPress={() => setRecipient(contact.walletAddress)}
              >
                <Text style={styles.contactChipText}>{contact.displayName}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={styles.label}>From wallet</Text>
        <CurrencyChips
          options={ownedCurrencies.length > 0 ? ownedCurrencies : [...SUPPORTED_CURRENCIES]}
          selected={sourceCurrency}
          onSelect={(c) => setSourceCurrency(c)}
        />

        <Text style={styles.label}>Recipient receives</Text>
        <CurrencyChips
          options={[...SUPPORTED_CURRENCIES]}
          selected={destCurrency}
          onSelect={(c) => setDestCurrency(c)}
        />

        <Field
          label={`Amount (${sourceCurrency})`}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />

        {crossCurrency ? (
          <Card style={styles.quoteCard}>
            {sourceAmountMinor === null ? (
              <Muted>Enter an amount to see the live rate</Muted>
            ) : quote.isFetching ? (
              <Muted>Fetching rate…</Muted>
            ) : quote.data !== undefined ? (
              <View>
                <Text style={styles.quoteLine}>
                  They receive{" "}
                  <Text style={styles.quoteStrong}>
                    {formatMoney(quote.data.destAmountMinor, destCurrency)}
                  </Text>
                </Text>
                <Muted>
                  Rate 1 {sourceCurrency} = {quote.data.rate} {destCurrency}
                </Muted>
              </View>
            ) : quote.isError ? (
              <Muted>Rate unavailable for this pair</Muted>
            ) : null}
          </Card>
        ) : null}

        <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="What's it for?" autoCapitalize="sentences" />

        <PrimaryButton
          title="Send"
          onPress={onSubmit}
          loading={createTransfer.isPending}
          disabled={!canSubmit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CurrencyChips({
  options,
  selected,
  onSelect,
}: {
  options: Currency[];
  selected: Currency;
  onSelect: (c: Currency) => void;
}) {
  const unique = [...new Set(options)];
  return (
    <View style={styles.chipsRow}>
      {unique.map((currency) => {
        const active = currency === selected;
        return (
          <Pressable
            key={currency}
            onPress={() => onSelect(currency)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{currency}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  label: { color: colors.muted, marginBottom: 8, fontSize: 13, fontWeight: "600" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: "600" },
  chipTextActive: { color: colors.primaryText },
  contactsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  contactChip: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.card,
  },
  contactChipText: { color: colors.primary, fontWeight: "600" },
  quoteCard: { marginBottom: 16, backgroundColor: colors.card },
  quoteLine: { color: colors.text, fontSize: 15, marginBottom: 4 },
  quoteStrong: { fontWeight: "800" },
});

import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { CURRENCY_SYMBOLS, type Contact } from "@caribpay/shared";
import { AVATAR_SIZE, color, space } from "@/theme";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui/Avatar";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  HomeIndicator,
  ListRow,
  Loading,
  Notice,
  Screen,
  ScreenHeader,
  Segmented,
  TextField,
  Txt,
} from "@/components/ui";
import { useAccounts, useContacts } from "@/api/hooks";
import { useDraftStore } from "@/stores/draft";
import { useGoBack } from "@/lib/nav";

type Mode = "contact" | "address";

const MODES = [
  { value: "contact" as const, label: "Contacts" },
  { value: "address" as const, label: "Address" },
];

/**
 * Step one of the send flow: who.
 *
 * The amount screen is deliberately downstream of confirming a name. Paying the
 * wrong person is the failure this product cannot take back, so the address is
 * resolved and the payee shown before any number is typed.
 */
export default function SendRecipientScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const accounts = useAccounts();
  const contacts = useContacts();
  const reset = useDraftStore((s) => s.reset);

  const [mode, setMode] = useState<Mode>("contact");
  const [typed, setTyped] = useState("");

  const linked = accounts.data?.accounts ?? [];

  function confirm(key: string) {
    reset();
    router.push({ pathname: "/send/confirm", params: { key } });
  }

  if (accounts.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Send money" />
        <Loading label="Getting your accounts…" />
      </Screen>
    );
  }

  if (linked.length === 0) {
    return (
      <Screen edges={{ bottom: false }}>
        <ScreenHeader title="Send money" />
        <View style={{ flex: 1, paddingHorizontal: space.gutter, paddingTop: space.xl }}>
          <Txt size={24} weight={800} tracking={-0.02}>
            Sending needs a bank account
          </Txt>
          <Txt size={15} weight={500} color={color.inkMuted} leading={1.5} style={{ marginTop: 8 }}>
            CaribPay instructs your bank to move the money — it never holds it. Link an account and
            this screen opens straight into your contacts.
          </Txt>
        </View>
        <View style={{ paddingHorizontal: space.gutter, gap: 10 }}>
          <Button
            label="Connect an account"
            icon="plus"
            onPress={() => router.replace("/accounts/link")}
          />
          <Button label="Not now" variant="ghost" height={48} onPress={goBack} />
        </View>
        <HomeIndicator />
      </Screen>
    );
  }

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Send money" />

      <Segmented
        options={MODES}
        value={mode}
        onChange={setMode}
        style={{ marginHorizontal: space.gutter, marginTop: 2 }}
      />

      {mode === "contact" ? (
        <ContactPicker
          contacts={contacts.data}
          pending={contacts.isPending}
          failed={contacts.isError}
          onRetry={() => void contacts.refetch()}
          onPick={confirm}
        />
      ) : (
        <AddressEntry value={typed} onChange={setTyped} onSubmit={() => confirm(typed)} />
      )}

      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.sm }}>
        <Button
          label="Scan a QR code"
          variant="secondary"
          icon="scan"
          onPress={() => router.push("/scan")}
        />
      </View>
      <HomeIndicator />
    </Screen>
  );
}

function ContactPicker({
  contacts,
  pending,
  failed,
  onRetry,
  onPick,
}: {
  contacts: Contact[] | undefined;
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
  onPick: (key: string) => void;
}) {
  const router = useRouter();
  if (pending) return <Loading label="Loading contacts…" />;
  // "No saved contacts" would be a lie when the list simply did not load.
  if (failed) {
    return (
      <ErrorState
        title="We can't load your contacts"
        body="You can still switch to Address and enter one directly."
        onRetry={onRetry}
      />
    );
  }
  if (contacts === undefined || contacts.length === 0) {
    return (
      <EmptyState
        icon="peopleAdd"
        title="No saved contacts"
        body="Add someone, or switch to Address and enter a CaribPay address, phone number, or email."
        actionLabel="Add contact"
        actionIcon="plus"
        onAction={() => router.push("/contact/add")}
      />
    );
  }

  return (
    <FlatList
      data={contacts}
      keyExtractor={(contact) => contact.id}
      contentContainerStyle={{ padding: space.gutter, gap: 10 }}
      renderItem={({ item }) => (
        <Card
          padded={false}
          style={{ paddingHorizontal: 14, opacity: item.currency === null ? 0.55 : 1 }}
        >
          <ListRow
            onPress={
              item.currency === null
                ? undefined
                : () => onPick(item.primaryVpa ?? item.savedKey)
            }
            leading={
              <Avatar
                name={item.displayName}
                size={AVATAR_SIZE}
                country={item.countryCode}
                currency={item.currency ?? undefined}
              />
            }
            title={item.displayName}
            subtitle={
              item.currency === null
                ? "Cannot receive yet"
                : `${item.primaryVpa ?? item.savedKey} · ${CURRENCY_SYMBOLS[item.currency]}`
            }
            trailing={
              item.currency === null ? undefined : (
                <Icon name="chevronRight" size={18} color={color.inkSubtle} strokeWidth={2.2} />
              )
            }
          />
        </Card>
      )}
    />
  );
}

function AddressEntry({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const ready = value.trim().length >= 3;
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: space.gutter, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <TextField
          label="CaribPay address, phone, or email"
          value={value}
          onChangeText={onChange}
          placeholder="name@caribpay"
          autoCapitalize="none"
          autoCorrect={false}
          hint="An address, a phone number, or an email — whichever they gave you."
        />

        <Notice
          tone="primary"
          icon="info"
          title="You'll see their name before you send"
          body="We look the address up and show you who it reaches. Nothing moves until you confirm."
        />

        <Button label="Continue" disabled={!ready} onPress={onSubmit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

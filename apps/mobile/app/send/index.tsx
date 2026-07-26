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
      <Screen>
        <ScreenHeader title="Send money" />
        <EmptyState
          icon="card"
          title="Connect a bank account first"
          body="CaribPay moves money between banks — it never holds it. Connect the account you want to pay from."
          actionLabel="Connect an account"
          actionIcon="plus"
          onAction={() => router.replace("/accounts/link")}
        />
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
        <ContactPicker contacts={contacts.data} pending={contacts.isPending} onPick={confirm} />
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
  onPick,
}: {
  contacts: Contact[] | undefined;
  pending: boolean;
  onPick: (key: string) => void;
}) {
  const router = useRouter();
  if (pending) return <Loading label="Loading contacts…" />;
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
        <Card padded={false} style={{ paddingHorizontal: 14 }}>
          <ListRow
            onPress={() => onPick(item.primaryVpa ?? item.savedKey)}
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
                ? `${item.primaryVpa ?? item.savedKey} · no bank connected yet`
                : `${item.primaryVpa ?? item.savedKey} · ${CURRENCY_SYMBOLS[item.currency]}`
            }
            trailing={<Icon name="chevronRight" size={18} color={color.inkSubtle} strokeWidth={2.2} />}
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
          hint="Ask them to open Receive and share their address."
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

import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { createContactRequestSchema } from "@caribpay/shared";
import { useContacts, useCreateContact, useLogout, useMe } from "@/api/hooks";
import { ApiRequestError } from "@/api/client";
import { Card, ErrorText, Field, Muted, PrimaryButton, colors } from "@/components/ui";

export default function MenuScreen() {
  const me = useMe();
  const contacts = useContacts();
  const logout = useLogout();
  const createContact = useCreateContact();

  const [address, setAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onAddContact = () => {
    setError(null);
    setSaved(false);
    const parsed = createContactRequestSchema.safeParse({ walletAddress: address, displayName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the contact details");
      return;
    }
    createContact.mutate(parsed.data, {
      onSuccess: () => {
        setAddress("");
        setDisplayName("");
        setSaved(true);
      },
      onError: (e) =>
        setError(e instanceof ApiRequestError ? e.message : "Could not save contact"),
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.name}>{me.data?.user.fullName ?? "—"}</Text>
        <Muted>{me.data?.user.email ?? ""}</Muted>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>Country: {me.data?.user.countryCode ?? "—"}</Text>
          <Text style={styles.meta}>KYC: {me.data?.user.kycStatus ?? "—"}</Text>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Add a contact</Text>
      <Card>
        <ErrorText message={error} />
        {saved ? <Text style={styles.saved}>Contact saved.</Text> : null}
        <Field
          label="Wallet address"
          value={address}
          onChangeText={setAddress}
          placeholder="CW-XXXX-XXXX-XXXX-XXXX"
          autoCapitalize="characters"
        />
        <Field
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="e.g. Marlon"
          autoCapitalize="words"
        />
        <PrimaryButton
          title="Save contact"
          onPress={onAddContact}
          loading={createContact.isPending}
        />
      </Card>

      <Text style={styles.sectionTitle}>Contacts</Text>
      {contacts.data === undefined || contacts.data.length === 0 ? (
        <Muted>No saved contacts yet.</Muted>
      ) : (
        contacts.data.map((contact) => (
          <Card key={contact.id} style={styles.contactCard}>
            <Text style={styles.contactName}>{contact.displayName}</Text>
            <Muted>{contact.walletAddress}</Muted>
          </Card>
        ))
      )}

      <View style={styles.signOut}>
        <PrimaryButton title="Sign out" onPress={() => logout.mutate()} loading={logout.isPending} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 10 },
  name: { fontSize: 20, fontWeight: "800", color: colors.text },
  metaRow: { flexDirection: "row", gap: 16, marginTop: 10 },
  meta: { color: colors.muted, fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 14 },
  saved: { color: colors.primary, marginBottom: 10, fontWeight: "600" },
  contactCard: { paddingVertical: 12 },
  contactName: { fontSize: 15, fontWeight: "700", color: colors.text },
  signOut: { marginTop: 24 },
});

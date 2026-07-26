import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { COUNTRY_NAMES, CURRENCY_SYMBOLS } from "@caribpay/shared";
import { color, radius, shadow, space } from "@/theme";
import { Icon } from "@/components/Icon";
import {
  Avatar,
  Button,
  Card,
  Field,
  HomeIndicator,
  Loading,
  Notice,
  Screen,
  ScreenHeader,
  TextField,
  Toggle,
  Txt,
} from "@/components/ui";
import { useResolveKey, useCreateContact } from "@/api/hooks";
import { ApiRequestError } from "@/api/client";

export default function AddContactScreen() {
  const router = useRouter();
  const createContact = useCreateContact();

  // A scan hands the address back here rather than hijacking the flow.
  const { key: scannedKey } = useLocalSearchParams<{ key?: string }>();
  const [address, setAddress] = useState(scannedKey ?? "");
  const [displayName, setDisplayName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [pinned, setPinned] = useState(true);

  const normalized = address.trim();
  const lookup = useResolveKey(normalized, normalized.length >= 3);
  const found = lookup.data;

  // Prefill the display name from the resolved account, but stop once the user
  // has typed their own — their label wins.
  useEffect(() => {
    if (found !== undefined && !nameEdited) setDisplayName(found.maskedName);
  }, [found, nameEdited]);

  const canSave = found !== undefined && displayName.trim() !== "" && !createContact.isPending;

  function save() {
    if (!canSave) return;
    createContact.mutate(
      { key: found.key, displayName: displayName.trim(), pinned },
      { onSuccess: () => router.replace("/(tabs)/contacts") },
    );
  }

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Add contact" backIcon="close" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.md, gap: 14 }}
          keyboardShouldPersistTaps="handled"
        >
          <Button
            label="Scan their QR code"
            icon="scan"
            variant="secondary"
            onPress={() => router.push({ pathname: "/scan", params: { returnTo: "contact" } })}
          />

          {createContact.isError && (
            <Notice
              tone="error"
              title="Could not save this contact"
              body={
                createContact.error instanceof ApiRequestError
                  ? createContact.error.message
                  : "Something went wrong. Try again."
              }
            />
          )}

          <TextField
            label="Their CaribPay address"
            value={address}
            onChangeText={setAddress}
            placeholder="name@caribpay"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {lookup.isFetching && <Loading label="Looking up that address…" />}

          {lookup.isError && (
            <Notice
              tone="error"
              title={
                lookup.error instanceof ApiRequestError && lookup.error.code === "OWN_ADDRESS"
                  ? "That's your own address"
                  : "No account found"
              }
              body={
                lookup.error instanceof ApiRequestError && lookup.error.code === "OWN_ADDRESS"
                  ? "Enter their CaribPay address, phone number, or email."
                  : "Check it and try again — a CaribPay address looks like name@caribpay."
              }
            />
          )}

          {found !== undefined && (
            <>
              <Card style={{ paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: space.md }}>
                <Avatar
                  name={found.maskedName}
                  size={44}
                  country={found.countryCode}
                  currency={found.currency}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt size={11} weight={600} color={color.success}>
                    Account found
                  </Txt>
                  <Txt size={15} weight={700} numberOfLines={1}>
                    {found.maskedName}
                  </Txt>
                  <Txt size={12} weight={500} color={color.inkMuted}>
                    {COUNTRY_NAMES[found.countryCode] ?? found.countryCode} ·{" "}
                    {CURRENCY_SYMBOLS[found.currency]}
                  </Txt>
                </View>
                <Icon name="check" size={20} color={color.success} strokeWidth={2.6} />
              </Card>

              <TextField
                label="Display name"
                value={displayName}
                onChangeText={(next) => {
                  setNameEdited(true);
                  setDisplayName(next);
                }}
                placeholder="What you'll call them"
                autoCapitalize="words"
                hint="Only you can see this name."
              />

              <View
                style={[
                  {
                    backgroundColor: color.surface,
                    borderRadius: radius.card,
                    padding: 14,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: space.md,
                  },
                  shadow.card,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Txt size={15} weight={700}>
                    Pin to Quick send
                  </Txt>
                  <Txt size={12} weight={500} color={color.inkMuted} style={{ marginTop: 2 }}>
                    Show on the Contacts row
                  </Txt>
                </View>
                <Toggle value={pinned} onChange={setPinned} accessibilityLabel="Pin to Quick send" />
              </View>
            </>
          )}
        </ScrollView>

        <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: space.sm }}>
          <Button
            label="Save contact"
            disabled={!canSave}
            loading={createContact.isPending}
            onPress={save}
          />
        </View>
      </KeyboardAvoidingView>
      <HomeIndicator />
    </Screen>
  );
}

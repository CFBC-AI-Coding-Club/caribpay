import { useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { COUNTRY_NAMES, CURRENCY_NAMES, type Institution } from "@caribpay/shared";
import { color, space } from "@/theme";
import { Flag } from "@/components/Flag";
import { Icon } from "@/components/Icon";
import {
  Button,
  HomeIndicator,
  Notice,
  PickerSheet,
  Screen,
  ScreenHeader,
  SelectField,
  TextField,
  Txt,
} from "@/components/ui";
import { useInstitutions, useLinkAccount, useMe } from "@/api/hooks";
import { ApiRequestError } from "@/api/client";

/**
 * What connecting an account does and does not grant.
 *
 * Stated as two lists rather than a paragraph of reassurance, because the
 * question people actually have — "what are you now able to do to my money?" —
 * is answered by the boundary, not by adjectives. The cannot column is the one
 * that earns the permission, so it is not softened into a footnote.
 */
function Permissions() {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: space.sm }}>
        <Txt size={11} weight={700} color={color.inkMuted}>
          WHAT CARIBPAY CAN DO
        </Txt>
        {[
          "Ask your bank what this account holds, when you open the app",
          "Ask your bank to hold and send an amount you have approved",
          "Receive money into this account from anyone with your address",
        ].map((line) => (
          <View key={line} style={{ flexDirection: "row", gap: space.sm }}>
            <Icon name="check" size={16} color={color.success} strokeWidth={2.6} />
            <Txt size={13} weight={500} leading={1.45} style={{ flex: 1 }}>
              {line}
            </Txt>
          </View>
        ))}
      </View>

      <View
        style={{
          gap: space.sm,
          borderTopWidth: 1,
          borderTopColor: color.hairlineFaint,
          paddingTop: space.md,
        }}
      >
        <Txt size={11} weight={700} color={color.inkMuted}>
          WHAT CARIBPAY CANNOT DO
        </Txt>
        {[
          "Hold your money — it never leaves your bank except to reach the person you paid",
          "Move anything you have not approved on screen",
          "See your account number, your statements, or anything you spend elsewhere",
          "Keep a copy of your balance",
        ].map((line) => (
          <View key={line} style={{ flexDirection: "row", gap: space.sm }}>
            <Icon name="close" size={16} color={color.inkFaint} strokeWidth={2.6} />
            <Txt size={13} weight={500} color={color.inkMuted} leading={1.45} style={{ flex: 1 }}>
              {line}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Connect an account at a member bank.
 *
 * The picker puts the user's own country first, because nearly every account
 * will be there.
 */
export default function LinkAccountScreen() {
  const router = useRouter();
  const me = useMe();
  const institutions = useInstitutions();
  const link = useLinkAccount();

  const [institutionId, setInstitutionId] = useState<string | undefined>();
  const [accountRef, setAccountRef] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const homeCountry = me.data?.user.countryCode;

  const linkable = useMemo(() => {
    const all = (institutions.data ?? []).filter((i) => i.supportsAccountLinking);
    return [...all].sort((a, b) => {
      const aHome = a.countryCode === homeCountry ? 0 : 1;
      const bHome = b.countryCode === homeCountry ? 0 : 1;
      if (aHome !== bHome) return aHome - bHome;
      return a.sortOrder - b.sortOrder;
    });
  }, [institutions.data, homeCountry]);

  const options = linkable.map((i: Institution) => ({
    value: i.id,
    label: i.displayName,
    detail: `${COUNTRY_NAMES[i.countryCode] ?? i.countryCode} · ${CURRENCY_NAMES[i.currency]}`,
    leading: <Flag country={i.countryCode} currency={i.currency} size={30} />,
  }));

  const selected = linkable.find((i) => i.id === institutionId);
  const canSubmit = institutionId !== undefined && accountRef.trim().length >= 4 && !link.isPending;

  function submit() {
    if (!canSubmit || institutionId === undefined) return;
    link.mutate(
      { institutionId, accountRef: accountRef.trim(), makeDefault: false },
      { onSuccess: () => router.replace("/accounts") },
    );
  }

  // The wait names the bank being contacted. "Loading…" here would leave someone
  // wondering who exactly is being asked for access to their account, at the one
  // moment they are most entitled to know.
  if (link.isPending && selected !== undefined) {
    return (
      <Screen edges={{ bottom: false }}>
        <ScreenHeader title="Connect an account" onBack={false} />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: space.gutter,
            gap: space.lg,
          }}
        >
          <Flag country={selected.countryCode} currency={selected.currency} size={64} />
          <ActivityIndicator color={color.link} />
          <View style={{ alignItems: "center", gap: 6 }}>
            <Txt size={17} weight={700} align="center">
              Checking with {selected.displayName}…
            </Txt>
            <Txt size={13} weight={500} color={color.inkMuted} align="center" leading={1.45}>
              Confirming the account exists and belongs to you. Nothing is moved.
            </Txt>
          </View>
        </View>
        <HomeIndicator />
      </Screen>
    );
  }

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Connect an account" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: space.gutter, gap: space.lg }}
          keyboardShouldPersistTaps="handled"
        >
          {link.isError && (
            <Notice
              tone="error"
              title="We couldn't connect that account"
              body={
                link.error instanceof ApiRequestError
                  ? link.error.message
                  : "Check your connection and try again."
              }
            />
          )}

          <SelectField
            label="Your bank"
            value={selected?.displayName ?? "Choose a bank"}
            leading={
              selected === undefined ? undefined : (
                <Flag country={selected.countryCode} currency={selected.currency} size={24} />
              )
            }
            onPress={() => setPickerOpen(true)}
          />

          <TextField
            label="Account number"
            value={accountRef}
            onChangeText={setAccountRef}
            placeholder="SKNANB-ACCT-4001"
            autoCapitalize="characters"
            autoCorrect={false}
            hint="We verify it with your bank and store only a reference — never your balance."
          />

          <Permissions />

          <Button
            label="Connect account"
            onPress={submit}
            loading={link.isPending}
            disabled={!canSubmit}
          />

          <Txt size={12} weight={500} color={color.inkMuted} align="center">
            Demo accounts: SKNANB-ACCT-4001 · NCB-ACCT-4001 · REPUBLICBB-ACCT-4001 ·
            REPUBLICTT-ACCT-4001
          </Txt>
        </ScrollView>
      </KeyboardAvoidingView>

      <PickerSheet
        visible={pickerOpen}
        title="Choose your bank"
        options={options}
        value={institutionId}
        onSelect={setInstitutionId}
        onClose={() => setPickerOpen(false)}
      />
      <HomeIndicator />
    </Screen>
  );
}

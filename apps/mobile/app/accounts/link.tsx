import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { COUNTRY_NAMES, CURRENCY_NAMES, type Institution } from "@caribpay/shared";
import { color, space } from "@/theme";
import { Flag } from "@/components/Flag";
import {
  Button,
  HomeIndicator,
  Notice,
  PickerSheet,
  Screen,
  ScreenHeader,
  SelectField,
  SimulatedNotice,
  TextField,
  Txt,
} from "@/components/ui";
import { useInstitutions, useLinkAccount, useMe } from "@/api/hooks";
import { ApiRequestError } from "@/api/client";

/**
 * Connect an account at a member bank.
 *
 * The picker puts the user's own country first, because nearly every account
 * will be there. Every institution named is simulated, and the notice saying so
 * is on this screen rather than buried in settings.
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
          <SimulatedNotice />

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

          <Notice
            tone="primary"
            icon="shieldCheck"
            title="CaribPay never holds your money"
            body="Your money stays in this account. We ask your bank to move it when you send, and we ask what it holds when you look."
          />

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

import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { color, space } from "@/theme";
import { Icon } from "@/components/Icon";
import {
  Button,
  HomeIndicator,
  Notice,
  Screen,
  ScreenHeader,
  TextField,
  Txt,
} from "@/components/ui";
import { useClaimKey, useVpaAvailability } from "@/api/hooks";
import { useDebounce } from "@/lib/useDebounce";
import { ApiRequestError } from "@/api/client";

const PSP = "caribpay";

const REASON_COPY: Record<string, string> = {
  taken: "Someone already has that one.",
  confusable: "Too easily mistaken for an address already in use.",
  reserved: "That one is reserved.",
  psp_not_active: "That provider isn't issuing addresses yet.",
  malformed: "3–20 characters, starting with a letter. Letters, numbers, dots, dashes.",
};

/**
 * Claim a memorable address.
 *
 * Availability is checked as you type, and the refusal says *which* rule you hit
 * — including "too easily mistaken for one already in use", which is a real
 * answer rather than a vague no.
 */
export default function ClaimAddressScreen() {
  const router = useRouter();
  const [local, setLocal] = useState("");
  const claim = useClaimKey();

  const candidate = local.trim() === "" ? "" : `${local.trim().toLowerCase()}@${PSP}`;
  const debounced = useDebounce(candidate, 350);
  const availability = useVpaAvailability(debounced, debounced.length >= 3);

  const settled = availability.data !== undefined && availability.data.vpa === debounced;
  const available = settled && availability.data.available;
  const canSubmit = available && !claim.isPending && candidate === debounced;

  function submit() {
    if (!canSubmit) return;
    claim.mutate(
      { type: "vpa", value: candidate, makePrimary: true },
      { onSuccess: () => router.replace("/directory/keys") },
    );
  }

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Claim an address" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: space.gutter, gap: space.lg }}
          keyboardShouldPersistTaps="handled"
        >
          <Txt size={15} weight={500} color={color.inkMuted} leading={1.5}>
            Pick something people can say over the phone. This becomes the address you share to get
            paid.
          </Txt>

          <TextField
            label="Your address"
            value={local}
            onChangeText={setLocal}
            placeholder="amara"
            autoCapitalize="none"
            autoCorrect={false}
            hint={`Will be ${local.trim() === "" ? "yourname" : local.trim().toLowerCase()}@${PSP}`}
          />

          {debounced.length >= 3 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              {availability.isFetching || !settled ? (
                <Txt size={13} weight={600} color={color.inkMuted}>
                  Checking…
                </Txt>
              ) : available ? (
                <>
                  <Icon name="check" size={16} color={color.success} strokeWidth={2.4} />
                  <Txt size={13} weight={700} color={color.success}>
                    {debounced} is available
                  </Txt>
                </>
              ) : (
                <>
                  <Icon name="close" size={16} color={color.errorText} strokeWidth={2.4} />
                  <Txt size={13} weight={600} color={color.errorText} style={{ flex: 1 }}>
                    {REASON_COPY[availability.data?.reason ?? "malformed"] ?? "Not available."}
                  </Txt>
                </>
              )}
            </View>
          )}

          {claim.isError && (
            <Notice
              tone="error"
              title="Couldn't claim that address"
              body={
                claim.error instanceof ApiRequestError
                  ? claim.error.message
                  : "Check your connection and try again."
              }
            />
          )}

          <Notice
            tone="primary"
            icon="info"
            title="Your old address keeps working"
            body="Claiming a new address makes it your primary one. Anything you have already shared still reaches you."
          />

          <Button
            label="Claim this address"
            onPress={submit}
            loading={claim.isPending}
            disabled={!canSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      <HomeIndicator />
    </Screen>
  );
}

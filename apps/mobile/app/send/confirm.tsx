import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { COUNTRY_NAMES, CURRENCY_SYMBOLS } from "@caribpay/shared";
import { color, space } from "@/theme";
import { Avatar } from "@/components/ui/Avatar";
import {
  Button,
  ErrorState,
  HomeIndicator,
  Loading,
  Row,
  RowGroup,
  Screen,
  ScreenHeader,
  Txt,
} from "@/components/ui";
import { useResolveKey } from "@/api/hooks";
import { useDraftStore } from "@/stores/draft";
import { ApiRequestError } from "@/api/client";

/**
 * Step two: is this the right person?
 *
 * This screen is the primary misdirection control, and every comparable system
 * relies on one. It sits before the amount deliberately — a name is easier to
 * check when you are not already thinking about a number.
 *
 * The name shown is the masked one the directory returns, and it is what gets
 * snapshotted onto the transaction, so a receipt still reads correctly after
 * someone changes their handle.
 */
export default function SendConfirmScreen() {
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const setRecipient = useDraftStore((s) => s.setRecipient);

  const resolved = useResolveKey(key ?? "", key !== undefined);

  if (resolved.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Confirm recipient" />
        <Loading label="Looking that address up…" />
      </Screen>
    );
  }

  if (resolved.isError || resolved.data === undefined) {
    const error = resolved.error;
    const code = error instanceof ApiRequestError ? error.code : "";
    return (
      <Screen>
        <ScreenHeader title="Confirm recipient" />
        <ErrorState
          title={
            code === "KEY_NOT_FOUND"
              ? "Nobody is using that address"
              : code === "KEY_NOT_PAYABLE"
                ? "They can't receive money yet"
                : code === "OWN_KEY"
                  ? "That's your own address"
                  : "We couldn't look that up"
          }
          body={
            code === "KEY_NOT_PAYABLE"
              ? "They've claimed this address but haven't connected a bank account to it yet. Ask them to connect one."
              : error instanceof ApiRequestError
                ? error.message
                : "Check your connection and try again."
          }
          onRetry={() => router.back()}
        />
      </Screen>
    );
  }

  const payee = resolved.data;

  function proceed() {
    setRecipient(payee);
    router.push("/send/amount");
  }

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Confirm recipient" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space.gutter }}
      >
        <View style={{ alignItems: "center", gap: 10, marginTop: space.xl }}>
          <Avatar
            name={payee.maskedName}
            size={72}
            country={payee.countryCode}
            currency={payee.currency}
            badgeBackground={color.bg}
          />
          <Txt size={12} weight={600} color={color.inkMuted}>
            You are paying
          </Txt>
          <Txt size={24} weight={800} align="center" numberOfLines={2}>
            {payee.maskedName}
          </Txt>
          <Txt size={13} weight={500} color={color.inkMuted} tabular>
            {payee.primaryVpa}
          </Txt>
        </View>

        <RowGroup style={{ marginTop: space.xl }}>
          <Row>
            <Txt size={13} weight={600} color={color.inkMuted}>
              Their bank
            </Txt>
            <Txt size={13} weight={700} numberOfLines={1} style={{ flex: 1 }} align="right">
              {payee.institutionDisplayName}
            </Txt>
          </Row>
          <Row>
            <Txt size={13} weight={600} color={color.inkMuted}>
              Country
            </Txt>
            <Txt size={13} weight={700}>
              {COUNTRY_NAMES[payee.countryCode] ?? payee.countryCode}
            </Txt>
          </Row>
          <Row last>
            <Txt size={13} weight={600} color={color.inkMuted}>
              They receive
            </Txt>
            <Txt size={13} weight={700}>
              {CURRENCY_SYMBOLS[payee.currency]} · {payee.currency}
            </Txt>
          </Row>
        </RowGroup>
      </ScrollView>

      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md, gap: 10 }}>
        <Button label="Yes, that's them" icon="checkWide" onPress={proceed} />
        <Button label="Someone else" variant="secondary" height={48} onPress={() => router.back()} />
      </View>
      <HomeIndicator />
    </Screen>
  );
}

import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  COUNTRY_NAMES,
  CURRENCY_NAMES,
  CURRENCY_SYMBOLS,
  vpaSkeleton,
  type Contact,
  type ResolveResponse,
} from "@caribpay/shared";
import { AVATAR_SIZE, color, space } from "@/theme";
import { Avatar } from "@/components/ui/Avatar";
import {
  Button,
  Card,
  ErrorState,
  HomeIndicator,
  ListRow,
  Loading,
  Notice,
  Row,
  RowGroup,
  Screen,
  ScreenHeader,
  Txt,
} from "@/components/ui";
import { useContacts, useResolveKey } from "@/api/hooks";
import { useGoBack } from "@/lib/nav";
import { asPayable, useDraftStore } from "@/stores/draft";
import { ApiRequestError } from "@/api/client";
import { shortDate } from "@/lib/datetime";

/**
 * Step two: is this the right person?
 *
 * The primary misdirection control, and every comparable system relies on one.
 * It sits before the amount deliberately — a name is easier to check when you
 * are not already thinking about a number, which is also why no amount appears
 * anywhere on this screen.
 *
 * The name shown is the masked one the directory returns, and it is what gets
 * snapshotted onto the transaction, so a receipt still reads correctly after
 * someone changes their handle.
 */
export default function SendConfirmScreen() {
  const router = useRouter();
  const goBack = useGoBack("/send");
  const { key } = useLocalSearchParams<{ key: string }>();
  const setRecipient = useDraftStore((s) => s.setRecipient);
  const contacts = useContacts();

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
    if (code === "KEY_NOT_FOUND") {
      return <NotFound typed={key ?? ""} contacts={contacts.data ?? []} />;
    }
    return (
      <Screen>
        <ScreenHeader title="Confirm recipient" />
        <ErrorState
          title={code === "OWN_KEY" ? "That's your own address" : "We couldn't look that up"}
          body={
            error instanceof ApiRequestError
              ? error.message
              : "Check your connection and try again."
          }
          onRetry={goBack}
        />
      </Screen>
    );
  }

  const payee = resolved.data;
  const payable = asPayable(payee);
  if (payable === null) return <NotPayable payee={payee} />;

  function proceed() {
    setRecipient(payable);
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
            currency={payable.currency}
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
              {CURRENCY_SYMBOLS[payable.currency]} · {CURRENCY_NAMES[payable.currency]}
            </Txt>
          </Row>
        </RowGroup>

        <Txt
          size={12}
          weight={500}
          color={color.inkMuted}
          leading={1.45}
          style={{ marginTop: space.md }}
        >
          We show the name their bank holds, shortened. If this is not who you mean, stop here.
        </Txt>
      </ScrollView>

      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md, gap: 10 }}>
        <Button label="Yes, that's them" icon="checkWide" onPress={proceed} />
        <Button label="Someone else" variant="secondary" height={48} onPress={goBack} />
      </View>
      <HomeIndicator />
    </Screen>
  );
}

/**
 * The address is real and it is theirs — there is just nowhere for the money to
 * land yet.
 *
 * Amber, not red: nothing failed. Both offered actions can actually be
 * performed, so there is no "nudge them" button — the product has no channel to
 * nudge with.
 */
function NotPayable({ payee }: { payee: ResolveResponse }) {
  const router = useRouter();
  const goBack = useGoBack("/send");
  const first = payee.maskedName.split(" ")[0] ?? "They";

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
            badgeBackground={color.bg}
          />
          <Txt size={12} weight={700} color={color.pending}>
            Cannot be paid yet
          </Txt>
          <Txt size={24} weight={800} align="center" numberOfLines={2}>
            {payee.maskedName}
          </Txt>
          <Txt size={13} weight={500} color={color.inkMuted} tabular>
            {payee.primaryVpa}
          </Txt>
        </View>

        <View style={{ marginTop: space.xl }}>
          <Notice
            tone="pending"
            icon="info"
            title={`${first} holds the address, not a bank`}
            body={`The address is real and it is theirs. Until ${first} links an account there is nowhere for the money to land — so nothing can be sent, and nothing will be held.`}
          />
        </View>

        <RowGroup style={{ marginTop: space.md }}>
          <Row>
            <Txt size={13} weight={600} color={color.inkMuted}>
              Address claimed
            </Txt>
            <Txt size={13} weight={700} tabular>
              {shortDate(payee.claimedAt)}
            </Txt>
          </Row>
          <Row last>
            <Txt size={13} weight={600} color={color.inkMuted}>
              Country
            </Txt>
            <Txt size={13} weight={700}>
              {COUNTRY_NAMES[payee.countryCode] ?? payee.countryCode}
            </Txt>
          </Row>
        </RowGroup>
      </ScrollView>

      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md, gap: 10 }}>
        <Button label="Choose someone else" onPress={goBack} />
        <Button
          label="Save them for later"
          variant="secondary"
          height={48}
          onPress={() =>
            router.replace({ pathname: "/contact/add", params: { key: payee.primaryVpa } })
          }
        />
      </View>
      <HomeIndicator />
    </Screen>
  );
}

/**
 * Nobody holds that address.
 *
 * A mistyped address is far likelier than a stranger's, so a near match is
 * offered — but **only from the payer's own contacts**. Suggesting names out of
 * the global directory would turn a typo into a way to discover strangers.
 */
function NotFound({ typed, contacts }: { typed: string; contacts: Contact[] }) {
  const router = useRouter();
  const goBack = useGoBack("/send");
  const target = vpaSkeleton(typed.split("@")[0] ?? typed);

  const suggestion = contacts.find((c) => {
    const candidate = c.primaryVpa ?? c.savedKey;
    const local = vpaSkeleton(candidate.split("@")[0] ?? candidate);
    if (local === target) return true;
    // One wrong or missing character is the common typo.
    if (Math.abs(local.length - target.length) > 1) return false;
    let diff = 0;
    for (let i = 0; i < Math.max(local.length, target.length); i++) {
      if (local[i] !== target[i]) diff += 1;
      if (diff > 1) return false;
    }
    return true;
  });

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Confirm recipient" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: space.gutter,
          paddingTop: space.xl,
        }}
      >
        <Txt size={24} weight={800} tracking={-0.02}>
          No one holds that address
        </Txt>
        <Txt size={15} weight={500} color={color.inkMuted} leading={1.5} style={{ marginTop: 8 }}>
          We checked the directory across all 12 countries. Nothing is registered to{" "}
          <Txt size={15} weight={700} tabular>
            {typed}
          </Txt>
          .
        </Txt>

        {suggestion !== undefined && (
          <>
            <Txt size={12} weight={700} color={color.inkMuted} style={{ marginTop: space.xl }}>
              DID YOU MEAN
            </Txt>
            <Card padded={false} style={{ paddingHorizontal: 14, marginTop: space.sm }}>
              <ListRow
                onPress={() =>
                  router.replace({
                    pathname: "/send/confirm",
                    params: { key: suggestion.primaryVpa ?? suggestion.savedKey },
                  })
                }
                leading={
                  <Avatar
                    name={suggestion.displayName}
                    size={AVATAR_SIZE}
                    country={suggestion.countryCode}
                    currency={suggestion.currency ?? undefined}
                  />
                }
                title={suggestion.displayName}
                subtitle={suggestion.primaryVpa ?? suggestion.savedKey}
                trailing={
                  <Txt size={13} weight={700} color={color.link}>
                    Use
                  </Txt>
                }
              />
            </Card>
            <Txt size={11} weight={500} color={color.inkFaint} style={{ marginTop: 6 }}>
              Suggested from your own contacts only.
            </Txt>
          </>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md, gap: 10 }}>
        <Button label="Edit the address" onPress={goBack} />
        <Button
          label="Scan their QR instead"
          variant="secondary"
          icon="scan"
          height={48}
          onPress={() => router.replace("/scan")}
        />
      </View>
      <HomeIndicator />
    </Screen>
  );
}

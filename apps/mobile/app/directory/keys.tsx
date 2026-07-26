import { Alert, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import type { DirectoryKey } from "@caribpay/shared";
import { color, space } from "@/theme";
import { Icon, type IconName } from "@/components/Icon";
import {
  Button,
  Card,
  ErrorState,
  HomeIndicator,
  ListRow,
  Loading,
  Notice,
  Pill,
  Screen,
  ScreenHeader,
} from "@/components/ui";
import { useDirectoryKeys, useReleaseKey } from "@/api/hooks";
import { ApiRequestError } from "@/api/client";

const KEY_ICON: Record<DirectoryKey["type"], IconName> = {
  vpa: "user",
  phone: "send",
  email: "mail",
};

const KEY_LABEL: Record<DirectoryKey["type"], string> = {
  vpa: "CaribPay address",
  phone: "Phone number",
  email: "Email address",
};

/**
 * Your addresses.
 *
 * Releasing one is permanent and the confirmation says so before it happens: a
 * released address is never re-registered, by anyone, because in an instant
 * irreversible system a recycled handle means money reaching a stranger.
 */
export default function DirectoryKeysScreen() {
  const router = useRouter();
  const keys = useDirectoryKeys();
  const release = useReleaseKey();

  function confirmRelease(key: DirectoryKey) {
    Alert.alert(
      "Release this address?",
      `${key.value} will stop working immediately, and nobody — including you — will ever be able to register it again.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Release",
          style: "destructive",
          onPress: () =>
            release.mutate(key.id, {
              onError: (error) =>
                Alert.alert(
                  "Couldn't release that address",
                  error instanceof ApiRequestError
                    ? error.message
                    : "Check your connection and try again.",
                ),
            }),
        },
      ],
    );
  }

  const list = keys.data ?? [];

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Your addresses" />

      {keys.isError ? (
        <ErrorState
          title="We can't load your addresses"
          body="They're still working — this is just the list. Check your connection and try again."
          onRetry={() => void keys.refetch()}
        />
      ) : keys.isPending ? (
        <Loading label="Loading your addresses…" />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.md }}
        >
          <Card padded={false} style={{ paddingHorizontal: 14 }}>
            {list.map((key, index) => (
              <ListRow
                key={key.id}
                divider={index < list.length - 1}
                leading={
                  <Icon name={KEY_ICON[key.type]} size={20} color={color.link} strokeWidth={1.9} />
                }
                title={key.value}
                subtitle={KEY_LABEL[key.type]}
                // Status rides with the address, not beside the action, so the
                // row is never three competing things in one line.
                subtitleAccessory={
                  key.isPrimary || key.verifiedAt === null ? (
                    <>
                      {key.isPrimary && <Pill tone="primary" label="Primary" />}
                      {key.verifiedAt === null && (
                        <Pill tone="pending" icon="clock" label="Unverified" />
                      )}
                    </>
                  ) : undefined
                }
                trailing={
                  key.isPrimary ? undefined : (
                    <Button
                      label="Release"
                      variant="danger"
                      height={44}
                      style={{ paddingHorizontal: space.lg }}
                      onPress={() => confirmRelease(key)}
                    />
                  )
                }
              />
            ))}
          </Card>

          <View style={{ marginTop: space.md }}>
            <Notice
              tone="primary"
              icon="info"
              title="An address is yours for good"
              body="Releasing one retires it permanently. It is never reissued to anyone else, so money can never reach a stranger by reusing an old address."
            />
          </View>
        </ScrollView>
      )}

      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md }}>
        <Button
          label="Claim a new address"
          icon="plus"
          onPress={() => router.push("/directory/claim")}
        />
      </View>
      <HomeIndicator />
    </Screen>
  );
}

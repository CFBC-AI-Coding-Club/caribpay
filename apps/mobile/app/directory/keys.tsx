import { Alert, View } from "react-native";
import { useRouter } from "expo-router";
import type { DirectoryKey } from "@caribpay/shared";
import { color, space } from "@/theme";
import { Icon, type IconName } from "@/components/Icon";
import {
  Button,
  Card,
  HomeIndicator,
  ListRow,
  Loading,
  Notice,
  Pill,
  Screen,
  ScreenHeader,
  Txt,
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
 * Releasing one is permanent and the screen says so before it happens: a
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

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Your addresses" />

      {keys.isPending ? (
        <Loading label="Loading your addresses…" />
      ) : (
        <View style={{ flex: 1, paddingHorizontal: space.gutter, gap: space.md }}>
          <Card padded={false} style={{ paddingHorizontal: 14 }}>
            {(keys.data ?? []).map((key, index, all) => (
              <ListRow
                key={key.id}
                divider={index < all.length - 1}
                leading={
                  <Icon name={KEY_ICON[key.type]} size={20} color={color.link} strokeWidth={1.9} />
                }
                title={key.value}
                subtitle={KEY_LABEL[key.type]}
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    {key.isPrimary && <Pill tone="primary" label="Primary" />}
                    {key.verifiedAt === null && <Pill tone="pending" icon="clock" label="Unverified" />}
                    {!key.isPrimary && (
                      <Button
                        label="Release"
                        variant="danger"
                        height={36}
                        onPress={() => confirmRelease(key)}
                      />
                    )}
                  </View>
                }
              />
            ))}
          </Card>

          <Notice
            tone="primary"
            icon="info"
            title="An address is yours for good"
            body="Releasing one retires it permanently. It is never reissued to anyone else, so money can never reach a stranger by reusing an old address."
          />
        </View>
      )}

      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md }}>
        <Button label="Claim a new address" icon="plus" onPress={() => router.push("/directory/claim")} />
      </View>
      <HomeIndicator />
    </Screen>
  );
}

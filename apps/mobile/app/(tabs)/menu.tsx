import { Alert, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { COUNTRY_NAMES, MAX_ACTIVE_DIRECTORY_KEYS, homeCurrencyFor } from "@caribpay/shared";
import { color, radius, space } from "@/theme";
import { Icon, type IconName } from "@/components/Icon";
import {
  Avatar,
  GradientCard,
  Pill,
  Row,
  RowGroup,
  Screen,
  Skeleton,
  Txt,
} from "@/components/ui";
import { useAccounts, useContacts, useDirectoryKeys, useLogout, useMe } from "@/api/hooks";
import { useAuthStore } from "@/stores/auth";

function MenuItem({
  icon,
  label,
  detail,
  onPress,
  tone = "primary",
  last = false,
  chevron = true,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  onPress?: () => void;
  tone?: "primary" | "neutral" | "danger";
  last?: boolean;
  chevron?: boolean;
}) {
  const skin = {
    primary: { bg: color.primarySoft, fg: color.link, label: color.ink },
    neutral: { bg: color.neutralSoft, fg: color.inkMuted, label: color.ink },
    danger: { bg: color.errorSoft, fg: color.error, label: color.error },
  }[tone];

  return (
    <Row last={last} onPress={onPress}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, flex: 1 }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: radius.chip,
            backgroundColor: skin.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={19} color={skin.fg} strokeWidth={1.9} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt size={15} weight={700} color={skin.label}>
            {label}
          </Txt>
          {detail !== undefined && (
            <Txt size={12} weight={500} color={color.inkMuted} style={{ marginTop: 2 }}>
              {detail}
            </Txt>
          )}
        </View>
      </View>
      {chevron && <Icon name="chevronRight" size={18} color={color.inkSubtle} strokeWidth={2.2} />}
    </Row>
  );
}

export default function MenuScreen() {
  const router = useRouter();
  const me = useMe();
  const accounts = useAccounts();
  const keys = useDirectoryKeys();
  const contacts = useContacts();
  const logout = useLogout();
  const sessionUser = useAuthStore((s) => s.user);

  const user = me.data?.user ?? sessionUser;
  const accountCount = accounts.data?.accounts.length ?? 0;
  const keyCount = keys.data?.length ?? 0;
  const contactCount = contacts.data?.length ?? 0;

  function confirmLogout() {
    Alert.alert("Log out?", "You'll need your email and password to get back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => logout.mutate(undefined, { onSuccess: () => router.replace("/welcome") }),
      },
    ]);
  }

  return (
    <Screen edges={{ bottom: false }}>
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.sm, paddingBottom: 14 }}>
        <Txt size={20} weight={800} tracking={-0.01}>
          Menu
        </Txt>
      </View>

      {user === null || user === undefined ? (
        <View style={{ paddingHorizontal: space.gutter, gap: space.md }}>
          <Skeleton height={92} radius={radius.cardLg} />
          <Skeleton height={220} radius={radius.card} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
          <GradientCard
            watermark={false}
            style={{ marginHorizontal: space.gutter, padding: space.lg }}
            onPress={() => router.push("/profile")}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Avatar
                name={user.fullName}
                size={54}
                country={user.countryCode}
                currency={homeCurrencyFor(user.countryCode)}
                badgeBackground={color.interactive}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={17} weight={800} color={color.onDark} numberOfLines={1}>
                  {user.fullName}
                </Txt>
                <Txt size={12} weight={500} color={color.onDarkFaint} style={{ marginTop: 2 }}>
                  {COUNTRY_NAMES[user.countryCode] ?? user.countryCode}
                </Txt>
                {user.kycStatus === "verified" && (
                  <Pill tone="onDark" label="KYC verified" icon="check" style={{ marginTop: 6 }} />
                )}
              </View>
              <Icon name="chevronRight" size={20} color={color.onDarkFaint} strokeWidth={2.2} />
            </View>
          </GradientCard>

          <View style={{ paddingHorizontal: space.gutter, paddingTop: space.lg, gap: 10 }}>
            <RowGroup paddingHorizontal={space.lg} style={{ borderRadius: radius.card }}>
              <MenuItem icon="user" label="Profile" onPress={() => router.push("/profile")} />
              <MenuItem
                icon="card"
                label="Bank accounts"
                detail={String(accountCount)}
                onPress={() => router.push("/accounts")}
              />
              <MenuItem
                icon="mail"
                label="Your addresses"
                detail={`${keyCount} of ${MAX_ACTIVE_DIRECTORY_KEYS}`}
                onPress={() => router.push("/directory/keys")}
              />
              <MenuItem
                icon="people"
                label="Contacts"
                detail={`${contactCount} saved`}
                onPress={() => router.push("/(tabs)/contacts")}
              />
              <MenuItem
                icon="activity"
                label="Transfers"
                last
                onPress={() => router.push("/(tabs)/activity")}
              />
            </RowGroup>

            <RowGroup paddingHorizontal={space.lg} style={{ borderRadius: radius.card }}>
              <MenuItem
                icon="shieldCheck"
                label="Settlement positions"
                detail="What the member banks owe each other"
                onPress={() => router.push("/settlement")}
              />
              <MenuItem
                icon="help"
                label="Help & support"
                tone="neutral"
                onPress={() =>
                  Alert.alert(
                    "Help & support",
                    "This is a CANTO Innovation Challenge prototype — there's no support desk behind it yet.",
                  )
                }
              />
              <MenuItem
                icon="logout"
                label="Log out"
                tone="danger"
                chevron={false}
                last
                onPress={confirmLogout}
              />
            </RowGroup>

            <Txt size={12} weight={500} color={color.inkFaint} align="center" style={{ paddingTop: 4 }}>
              CaribPay v1.0.0 · {COUNTRY_NAMES[user.countryCode] ?? user.countryCode}
            </Txt>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

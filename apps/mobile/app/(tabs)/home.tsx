import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { CURRENCY_SYMBOLS, formatAmount, splitAmount, type LinkedAccount } from "@caribpay/shared";
import { color, radius, shadow, space } from "@/theme";
import { Icon, type IconName } from "@/components/Icon";
import { Flag } from "@/components/Flag";
import {
  Card,
  EmptyState,
  ErrorState,
  GradientCard,
  HomeIndicator,
  IconButton,
  ListRow,
  Screen,
  SectionHeader,
  SimulatedNotice,
  Skeleton,
  Txt,
} from "@/components/ui";
import { TransactionRow } from "@/components/TransactionRow";
import {
  useAccountBalance,
  useAccounts,
  useArrivalWatcher,
  useMe,
  useTransactions,
  useUnreadCount,
} from "@/api/hooks";

const QUICK_ACTIONS: Array<{ label: string; icon: IconName; href: string }> = [
  { label: "Send", icon: "send", href: "/send" },
  { label: "Receive", icon: "receive", href: "/receive" },
  { label: "Scan", icon: "scan", href: "/scan" },
  { label: "Accounts", icon: "card", href: "/accounts" },
];

function QuickActions() {
  const router = useRouter();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.gutter, paddingTop: space.xl, paddingBottom: space.sm }}>
      {QUICK_ACTIONS.map((action) => (
        <View key={action.label} style={{ alignItems: "center", gap: space.sm }}>
          <IconButton
            icon={action.icon}
            accessibilityLabel={action.label}
            size={56}
            elevated
            onPress={() => router.push(action.href as never)}
          />
          <Txt size={12} weight={600} color={color.inkOnTint}>
            {action.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/**
 * The nocturne card, now carrying a balance held at a member bank rather than a
 * balance we hold. The figure is read live and stated as such: the switch has no
 * opinion about what someone has, it asks their bank.
 */
function BalanceCard({ account }: { account: LinkedAccount }) {
  const balance = useAccountBalance(account.id);
  const parts =
    balance.data === undefined ? null : splitAmount(balance.data.balanceMinor, balance.data.currency);

  return (
    <GradientCard style={{ marginHorizontal: space.gutter }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Txt size={13} weight={600} color={color.onDarkMuted}>
          At your bank
        </Txt>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: "rgba(0,0,0,0.20)",
            paddingHorizontal: 8,
            paddingVertical: 5,
            borderRadius: radius.pill,
          }}
        >
          <Flag currency={account.currency} country={account.countryCode} size={18} />
          <Txt size={12} weight={700} color={color.onDark}>
            {CURRENCY_SYMBOLS[account.currency]}
          </Txt>
        </View>
      </View>

      {balance.isPending ? (
        <View style={{ marginTop: space.md }}>
          <Skeleton height={40} width="62%" radius={radius.sm} />
        </View>
      ) : balance.isError || parts === null ? (
        <Txt size={17} weight={700} color={color.onDark} style={{ marginTop: space.md }}>
          Your bank didn't answer just now
        </Txt>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 6 }}>
          <Txt size={24} weight={800} color={color.onDark} style={{ marginBottom: 5 }}>
            {parts.symbol}
          </Txt>
          <Txt size={40} weight={800} color={color.onDark} tracking={-0.02} tabular>
            {parts.whole}
          </Txt>
          <Txt size={24} weight={800} color={color.onDark} tabular style={{ marginBottom: 5 }}>
            {parts.fraction}
          </Txt>
        </View>
      )}

      <View style={{ marginTop: space.md, gap: 4 }}>
        <Txt size={13} weight={500} color={color.onDarkMuted} numberOfLines={1}>
          {account.institutionDisplayName} · {account.accountNumberMasked}
        </Txt>
        {balance.data !== undefined && (
          <Txt size={11} weight={500} color={color.onDarkFaint}>
            As reported by your bank just now
          </Txt>
        )}
      </View>
    </GradientCard>
  );
}

function OtherAccountRow({ account }: { account: LinkedAccount }) {
  const balance = useAccountBalance(account.id);
  return (
    <ListRow
      leading={<Flag currency={account.currency} country={account.countryCode} size={38} />}
      title={account.institutionDisplayName}
      subtitle={`${account.accountNumberMasked} · ${CURRENCY_SYMBOLS[account.currency]}`}
      trailing={
        balance.isPending ? (
          <Skeleton height={15} width={72} radius={radius.sm} />
        ) : balance.isError || balance.data === undefined ? (
          <Txt size={12} weight={500} color={color.inkFaint}>
            unavailable
          </Txt>
        ) : (
          <Txt size={15} weight={700} tabular>
            {formatAmount(balance.data.balanceMinor, balance.data.currency)}
          </Txt>
        )
      }
    />
  );
}

function HomeSkeleton() {
  return (
    <View style={{ paddingHorizontal: space.gutter, gap: space.lg, paddingTop: space.sm }}>
      <Skeleton height={168} radius={radius.cardLg} />
      <Skeleton height={72} radius={radius.card} />
      <Skeleton height={180} radius={radius.card} />
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const me = useMe();
  const accounts = useAccounts();
  const feed = useTransactions();
  const unread = useUnreadCount();
  useArrivalWatcher(unread.data);

  const user = me.data?.user;
  const list = accounts.data?.accounts ?? [];
  const primary = list.find((a) => a.isDefault) ?? list[0];
  const others = list.filter((a) => a.id !== primary?.id);
  const recent = feed.items.slice(0, 6);

  return (
    <Screen edges={{ bottom: false }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: space.gutter,
          paddingTop: 14,
          paddingBottom: space.md,
        }}
      >
        <View style={{ flex: 1 }}>
          <Txt size={13} weight={500} color={color.inkMuted}>
            Welcome back
          </Txt>
          <Txt size={20} weight={800} tracking={-0.01} numberOfLines={1} style={{ marginTop: 2 }}>
            {user?.fullName ?? "…"}
          </Txt>
        </View>
        <IconButton
          icon="bell"
          accessibilityLabel={
            unread.data !== undefined && unread.data > 0
              ? `Notifications, ${unread.data} unread`
              : "Notifications"
          }
          strokeWidth={1.8}
          badge={unread.data !== undefined && unread.data > 0}
          onPress={() => router.push("/(tabs)/activity")}
        />
      </View>

      {accounts.isError ? (
        <ErrorState
          title="We can't reach your accounts"
          body="Check your connection and try again — nothing has changed at your bank."
          onRetry={() => void accounts.refetch()}
        />
      ) : accounts.isPending ? (
        <HomeSkeleton />
      ) : primary === undefined ? (
        // Inherent to the model: an address is only payable once its owner has
        // connected a bank. This is the first thing a new user must do.
        <EmptyState
          icon="card"
          title="Connect your bank account"
          body="CaribPay moves money between banks — it never holds it. Connect an account and your CaribPay address starts working."
          actionLabel="Connect an account"
          actionIcon="plus"
          onAction={() => router.push("/accounts/link")}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: space.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={accounts.isRefetching}
              onRefresh={() => void accounts.refetch()}
              tintColor={color.interactive}
            />
          }
        >
          <BalanceCard account={primary} />
          <QuickActions />

          <View style={{ paddingHorizontal: space.gutter, paddingTop: 6 }}>
            <SimulatedNotice compact />
          </View>

          {others.length > 0 && (
            <>
              <SectionHeader title="Other accounts" />
              <Card padded={false} style={{ marginHorizontal: space.gutter, paddingHorizontal: 14 }}>
                {others.map((account) => (
                  <OtherAccountRow key={account.id} account={account} />
                ))}
              </Card>
            </>
          )}

          <SectionHeader
            title="Regional transfers"
            action={recent.length > 0 ? "See all" : undefined}
            onAction={() => router.push("/(tabs)/activity")}
          />
          {recent.length === 0 ? (
            <View
              style={[
                {
                  marginHorizontal: space.gutter,
                  backgroundColor: color.surface,
                  borderRadius: radius.card,
                  padding: 18,
                  alignItems: "center",
                  gap: 6,
                },
                shadow.card,
              ]}
            >
              <Icon name="activity" size={24} color={color.inkSubtle} strokeWidth={1.8} />
              <Txt size={13} weight={600} color={color.inkMuted} align="center">
                No transfers yet
              </Txt>
              <Txt size={12} weight={500} color={color.inkFaint} align="center">
                Send to a CaribPay address and it appears here.
              </Txt>
            </View>
          ) : (
            <Card padded={false} style={{ marginHorizontal: space.gutter, paddingHorizontal: 14 }}>
              {recent.map((tx) => (
                <TransactionRow key={tx.id} transaction={tx} />
              ))}
            </Card>
          )}
        </ScrollView>
      )}
      <HomeIndicator />
    </Screen>
  );
}

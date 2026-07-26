import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import {
  CURRENCY_SYMBOLS,
  formatAmount,
  splitAmount,
  type LinkedAccount,
  type Transaction,
} from "@caribpay/shared";
import { color, radius, shadow, space } from "@/theme";
import { Icon, type IconName } from "@/components/Icon";
import { Flag } from "@/components/Flag";
import {
  Card,
  ErrorState,
  Button,
  GradientCard,
  HomeIndicator,
  IconButton,
  ListRow,
  Pill,
  Screen,
  SectionHeader,
  Skeleton,
  Txt,
} from "@/components/ui";
import { TransactionRow } from "@/components/TransactionRow";
import {
  useAccountBalance,
  useAccounts,
  useDirectoryKeys,
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

/**
 * The board's quick-action tiles: a 56pt rounded square carrying `shadow.tile`,
 * which is a half-step above a card and distinct from the round `shadow.control`
 * an icon button uses. They are the only tiles in the system, so the treatment
 * is theirs alone.
 */
function QuickActions() {
  const router = useRouter();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingHorizontal: space.gutter,
        paddingTop: space.xl,
        paddingBottom: space.sm,
      }}
    >
      {QUICK_ACTIONS.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={() => router.push(action.href as never)}
          style={{ alignItems: "center", gap: space.sm }}
        >
          {({ pressed }) => (
            <>
              <View
                style={[
                  {
                    width: 56,
                    height: 56,
                    borderRadius: radius.card,
                    backgroundColor: pressed ? color.primarySoft : color.surface,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  shadow.tile,
                ]}
              >
                <Icon name={action.icon} size={23} color={color.link} strokeWidth={2} />
              </View>
              <Txt size={12} weight={600} color={color.inkOnTint}>
                {action.label}
              </Txt>
            </>
          )}
        </Pressable>
      ))}
    </View>
  );
}

/**
 * The nocturne card, now carrying a balance held at a member bank rather than a
 * balance we hold. The figure is read live and stated as such: the switch has no
 * opinion about what someone has, it asks their bank.
 */
/**
 * Net movement through this account over the last seven days.
 *
 * Computed from the feed, so it is only shown once the whole feed is loaded —
 * a figure derived from the first page would silently understate itself, which
 * is worse than not showing it.
 */
function useWeeklyDelta(account: LinkedAccount, items: Transaction[], complete: boolean) {
  return useMemo(() => {
    if (!complete) return null;
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let net = 0;
    let seen = 0;
    for (const tx of items) {
      if (tx.status !== "completed" || Date.parse(tx.createdAt) < since) continue;
      if (tx.direction === "out" && tx.sourceCurrency === account.currency) {
        net -= tx.sourceAmountMinor;
        seen += 1;
      } else if (tx.direction === "in" && tx.destCurrency === account.currency) {
        net += tx.destAmountMinor;
        seen += 1;
      }
    }
    return seen === 0 ? null : net;
  }, [account.currency, items, complete]);
}

function BalanceCard({
  account,
  items,
  feedComplete,
}: {
  account: LinkedAccount;
  items: Transaction[];
  feedComplete: boolean;
}) {
  const balance = useAccountBalance(account.id);
  const parts =
    balance.data === undefined ? null : splitAmount(balance.data.balanceMinor, balance.data.currency);
  const weekly = useWeeklyDelta(account, items, feedComplete);

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
            backgroundColor: color.onDarkScrim,
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
          Asking your bank…
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

      {weekly !== null && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 6 }}>
          <Icon
            name={weekly >= 0 ? "receive" : "send"}
            size={13}
            // Mint is reserved for a positive week and appears nowhere else in
            // the system, so a negative one must not borrow it.
            color={weekly >= 0 ? color.gainOnDark : color.onDarkFaint}
            strokeWidth={2.2}
          />
          <Txt
            size={12}
            weight={700}
            color={weekly >= 0 ? color.gainOnDark : color.onDarkFaint}
            tabular
          >
            {formatAmount(Math.abs(weekly), account.currency)}{" "}
            {weekly >= 0 ? "in" : "out"} this week
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
          // Fails on its own row with its own retry: one unreachable bank must
          // never blank the screen or the other balances.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retry ${account.institutionDisplayName} balance`}
            onPress={() => void balance.refetch()}
            hitSlop={8}
            style={{ alignItems: "flex-end" }}
          >
            <Txt size={12} weight={500} color={color.inkFaint}>
              Bank unreachable
            </Txt>
            <Txt size={12} weight={700} color={color.link}>
              Try again
            </Txt>
          </Pressable>
        ) : (
          <Txt size={15} weight={700} tabular>
            {formatAmount(balance.data.balanceMinor, balance.data.currency)}
          </Txt>
        )
      }
    />
  );
}

/**
 * The first-run state.
 *
 * No nocturne card: there is no balance to hold, and the gradient is never an
 * empty state. It teaches the three steps rather than decorating a void, and
 * says plainly why the address exists but cannot yet be paid — which is the
 * same sentence that explains why the product is trustworthy.
 */
function FirstRun({ vpa, onConnect }: { vpa: string | undefined; onConnect: () => void }) {
  const router = useRouter();
  const steps: Array<[string, string]> = [
    ["Pick your bank", "21 institutions across 12 countries."],
    ["Enter your account number", "We verify it with the bank."],
    ["Send and receive", "Money stays at your bank until it moves."],
  ];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xxl }}
    >
      <Txt size={24} weight={800} tracking={-0.02} style={{ marginTop: space.sm }}>
        Connect a bank to begin
      </Txt>
      {vpa !== undefined && (
        <Txt size={15} weight={500} color={color.inkMuted} leading={1.5} style={{ marginTop: 8 }}>
          Your address{" "}
          <Txt size={15} weight={700} tabular>
            {vpa}
          </Txt>{" "}
          is already yours. It can’t receive or send until one of your accounts is linked to it.
        </Txt>
      )}

      <View style={{ marginTop: space.xl, gap: space.lg }}>
        {steps.map(([title, body], index) => (
          <View key={title} style={{ flexDirection: "row", gap: space.md }}>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: color.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Txt size={12} weight={800} color={color.link} tabular>
                {index + 1}
              </Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt size={15} weight={700}>
                {title}
              </Txt>
              <Txt size={13} weight={500} color={color.inkMuted} leading={1.45}>
                {body}
              </Txt>
            </View>
          </View>
        ))}
      </View>

      <Button
        label="Connect an account"
        icon="plus"
        style={{ marginTop: space.xl }}
        onPress={onConnect}
      />

      <SectionHeader title="Available now" />
      <Card padded={false} style={{ paddingHorizontal: 14 }}>
        <ListRow
          divider
          leading={<Icon name="user" size={20} color={color.link} strokeWidth={1.9} />}
          title={vpa ?? "Your address"}
          subtitle="Your address"
          trailing={<Pill tone="pending" icon="clock" label="Not yet payable" />}
        />
        <ListRow
          onPress={() => router.push("/contact/add")}
          leading={<Icon name="peopleAdd" size={20} color={color.link} strokeWidth={1.9} />}
          title="Save a contact"
          subtitle="Works before your bank is linked"
          trailing={<Icon name="chevronRight" size={18} color={color.inkSubtle} strokeWidth={2.2} />}
        />
      </Card>
    </ScrollView>
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
  const keys = useDirectoryKeys();

  const user = me.data?.user;
  const list = accounts.data?.accounts ?? [];
  const primary = list.find((a) => a.isDefault) ?? list[0];
  const others = list.filter((a) => a.id !== primary?.id);
  const recent = feed.items.slice(0, 6);
  const primaryVpa = (keys.data ?? []).find((k) => k.type === "vpa" && k.isPrimary)?.value;

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
        <FirstRun vpa={primaryVpa} onConnect={() => router.push("/accounts/link")} />
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
          <BalanceCard
            account={primary}
            items={feed.items}
            feedComplete={!feed.hasNextPage}
          />
          <QuickActions />
          {others.length > 0 && (
            <>
              <SectionHeader
                title="Other accounts"
                action="Manage"
                onAction={() => router.push("/accounts")}
                style={{ marginHorizontal: space.gutter }}
              />
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
            style={{ marginHorizontal: space.gutter }}
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

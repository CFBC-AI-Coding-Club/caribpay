import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import {
  COUNTRY_NAMES,
  CURRENCY_NAMES,
  CURRENCY_SYMBOLS,
  CURRENCY_TO_COUNTRY,
  formatAmount,
  homeCurrencyFor,
  splitAmount,
  type Currency,
  type Wallet,
} from "@caribpay/shared";
import { color, radius, shadow, space } from "@/theme";
import { Icon, type IconName } from "@/components/Icon";
import { Flag } from "@/components/Flag";
import {
  Card,
  ErrorState,
  EmptyState,
  GradientCard,
  IconButton,
  ListRow,
  Screen,
  SectionHeader,
  Skeleton,
  Txt,
} from "@/components/ui";
import { useMe, useWalletTransactions, useWallets } from "@/api/hooks";
import { useAuthStore } from "@/stores/auth";

const QUICK_ACTIONS: { icon: IconName; label: string; href: string }[] = [
  { icon: "send", label: "Send", href: "/send" },
  { icon: "receive", label: "Receive", href: "/receive" },
  { icon: "scan", label: "Scan", href: "/scan" },
  { icon: "plus", label: "Add", href: "/wallet/add" },
];

function QuickActions() {
  const router = useRouter();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.gutter, paddingTop: space.xl, paddingBottom: space.sm }}>
      {QUICK_ACTIONS.map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={() => router.push(action.href)}
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

function WalletRow({ wallet, isHome }: { wallet: Wallet; isHome: boolean }) {
  const router = useRouter();
  const country = CURRENCY_TO_COUNTRY[wallet.currency];
  const place = COUNTRY_NAMES[country]?.replace(" & Nevis", "") ?? country;
  return (
    <Card padded={false} style={{ paddingHorizontal: 14 }} onPress={() => router.push(`/wallet/${wallet.id}`)}>
      <ListRow
        leading={<Flag currency={wallet.currency} size={44} />}
        title={CURRENCY_NAMES[wallet.currency]}
        subtitle={wallet.currency === "USD" ? "USD" : `${wallet.currency} · ${place}`}
        subtitleAccessory={
          isHome ? (
            <View style={{ backgroundColor: color.primarySoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
              <Txt size={11} weight={800} color={color.link} style={{ letterSpacing: 0.35 }}>
                HOME
              </Txt>
            </View>
          ) : undefined
        }
        trailing={
          <Txt size={15} weight={700} tabular>
            {formatAmount(wallet.balanceMinor, wallet.currency)}
          </Txt>
        }
      />
    </Card>
  );
}

/**
 * Net movement in the home wallet over the last seven days. Uses the wallet's
 * own ledger deltas, so it is exact integer arithmetic with no FX guesswork —
 * cross-currency legs are already expressed in this wallet's currency.
 */
function useWeeklyChange(walletId: string | undefined, currency: Currency) {
  const scoped = useWalletTransactions(walletId);
  return useMemo(() => {
    if (walletId === undefined || scoped.data === undefined) return null;
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let net = 0;
    let count = 0;
    for (const tx of scoped.data) {
      if (tx.status !== "settled" || Date.parse(tx.createdAt) < since) continue;
      net += tx.walletDeltaMinor ?? 0;
      count += 1;
    }
    if (count === 0) return null;
    return formatAmount(net, currency, { sign: "always" });
  }, [walletId, scoped.data, currency]);
}

function HomeSkeleton() {
  return (
    <View style={{ paddingHorizontal: space.gutter, gap: space.md }}>
      <Skeleton height={150} radius={radius.cardLg} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: space.lg }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width={56} height={56} radius={radius.card} />
        ))}
      </View>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={68} radius={radius.card} />
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const wallets = useWallets();
  const me = useMe();
  const sessionUser = useAuthStore((s) => s.user);

  const user = me.data?.user ?? sessionUser;
  const homeCurrency = user === null || user === undefined ? "XCD" : homeCurrencyFor(user.countryCode);
  const homeWallet = wallets.data?.wallets.find((w) => w.currency === homeCurrency);
  const weeklyChange = useWeeklyChange(homeWallet?.id, homeCurrency);

  const total = wallets.data?.totalBalance;
  const amount = total === undefined ? null : splitAmount(total.amountMinor, total.currency);
  const walletCount = wallets.data?.wallets.length ?? 0;

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
          accessibilityLabel="Notifications"
          strokeWidth={1.8}
          onPress={() => router.push("/(tabs)/activity")}
        />
      </View>

      {wallets.isError ? (
        <ErrorState
          title="We can't reach your wallets"
          body="Check your connection and try again — nothing has changed on your account."
          onRetry={() => void wallets.refetch()}
        />
      ) : wallets.isPending ? (
        <HomeSkeleton />
      ) : walletCount === 0 ? (
        <EmptyState
          icon="card"
          title="Open your first wallet"
          body="Add a currency wallet to start sending and receiving across the Caribbean — no fees, no US dollar."
          actionLabel="Add a wallet"
          onAction={() => router.push("/wallet/add")}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: space.xxl }}
          refreshControl={
            <RefreshControl refreshing={wallets.isRefetching} onRefresh={() => void wallets.refetch()} tintColor={color.interactive} />
          }
        >
          <GradientCard style={{ marginHorizontal: space.gutter }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Txt size={13} weight={600} color={color.onDarkMuted}>
                Total balance
              </Txt>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.sm,
                  backgroundColor: "rgba(0,0,0,0.2)",
                  paddingLeft: 6,
                  paddingRight: space.md,
                  paddingVertical: 6,
                  borderRadius: radius.pill,
                }}
              >
                <Flag currency={homeCurrency} size={20} />
                <Txt size={12} weight={700} color={color.onDark}>
                  {CURRENCY_SYMBOLS[homeCurrency]} · {homeCurrency}
                </Txt>
              </View>
            </View>

            {amount !== null && (
              <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: space.md }}>
                <Txt size={24} weight={700} color="rgba(255,255,255,0.85)" leading={1.4}>
                  {amount.symbol}
                </Txt>
                <Txt size={40} weight={800} color={color.onDark} tracking={-0.02} leading={1} tabular>
                  {amount.whole}
                </Txt>
                <Txt size={24} weight={700} color="rgba(255,255,255,0.85)" leading={1.4} tabular>
                  {amount.fraction}
                </Txt>
              </View>
            )}

            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md }}>
              <Txt size={13} weight={500} color={color.onDarkMuted}>
                Across {walletCount} {walletCount === 1 ? "wallet" : "wallets"}
              </Txt>
              {weeklyChange !== null && (
                <>
                  <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.4)" }} />
                  <Txt size={12} weight={700} color={color.gainOnDark} tabular>
                    {weeklyChange} this week
                  </Txt>
                </>
              )}
            </View>
          </GradientCard>

          <QuickActions />

          <View style={{ paddingHorizontal: space.gutter, paddingTop: 14 }}>
            {/*
              The board labels this "See all", but Home already lists every wallet —
              so the action that's actually useful here is opening another one.
            */}
            <SectionHeader
              title="Your wallets"
              action="Add wallet"
              onAction={() => router.push("/wallet/add")}
            />
            <View style={{ gap: 10 }}>
              {wallets.data.wallets.map((wallet) => (
                <WalletRow key={wallet.id} wallet={wallet} isHome={wallet.currency === homeCurrency} />
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

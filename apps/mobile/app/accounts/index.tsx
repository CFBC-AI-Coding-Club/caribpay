import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import {
  COUNTRY_NAMES,
  CURRENCY_NAMES,
  formatAmount,
  type LinkedAccount,
} from "@caribpay/shared";
import { color, radius, space } from "@/theme";
import { Flag } from "@/components/Flag";
import { Icon } from "@/components/Icon";
import {
  Button,
  Card,
  ErrorState,
  HomeIndicator,
  Loading,
  Pill,
  Screen,
  ScreenHeader,
  Skeleton,
  Txt,
} from "@/components/ui";
import { useAccountBalance, useAccounts, useInstitutions } from "@/api/hooks";

/**
 * One card per account, because each bank answers separately: a card can be
 * live, loading, or unreachable on its own without touching its neighbours.
 * "Live" is an honest claim here, and the footnote below the list earns it.
 */
function AccountCard({ account }: { account: LinkedAccount }) {
  const balance = useAccountBalance(account.id);
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Flag currency={account.currency} country={account.countryCode} size={42} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Txt size={15} weight={700} numberOfLines={1} style={{ flexShrink: 1 }}>
              {account.institutionDisplayName}
            </Txt>
            {account.isDefault && <Pill tone="primary" label="Default" />}
          </View>
          <Txt size={12} weight={500} color={color.inkMuted} numberOfLines={1}>
            {account.accountNumberMasked} · {CURRENCY_NAMES[account.currency]}
          </Txt>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: space.sm,
          borderTopWidth: 1,
          borderTopColor: color.hairlineFaint,
          paddingTop: space.md,
        }}
      >
        <Txt size={12} weight={600} color={color.inkMuted}>
          At your bank
        </Txt>
        {balance.isPending ? (
          <Skeleton height={20} width={110} radius={radius.sm} />
        ) : balance.data === undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retry ${account.institutionDisplayName} balance`}
            onPress={() => void balance.refetch()}
            hitSlop={8}
            style={{ alignItems: "flex-end" }}
          >
            <Txt size={13} weight={600} color={color.inkFaint}>
              Balance unavailable
            </Txt>
            <Txt size={13} weight={700} color={color.link}>
              Retry
            </Txt>
          </Pressable>
        ) : (
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Txt size={20} weight={800} tabular>
              {formatAmount(balance.data.balanceMinor, balance.data.currency)}
            </Txt>
            <Pill tone="success" icon="check" label="Live" />
          </View>
        )}
      </View>
    </Card>
  );
}

/**
 * Nothing connected yet — so the screen argues for connecting something.
 *
 * The argument is coverage, and coverage is a claim that has to be shown rather
 * than asserted: a number and a country list can both be checked against the
 * picker on the next screen. "Works across the Caribbean" is a slogan; twelve
 * flags with bank counts beside them is evidence.
 */
function NoAccounts({ onConnect }: { onConnect: () => void }) {
  const institutions = useInstitutions();

  const byCountry = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of institutions.data ?? []) {
      if (!i.supportsAccountLinking) continue;
      counts.set(i.countryCode, (counts.get(i.countryCode) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [institutions.data]);

  const bankCount = byCountry.reduce((sum, [, n]) => sum + n, 0);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: space.gutter,
        paddingTop: space.xl,
        paddingBottom: space.md,
      }}
    >
      <View style={{ alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: color.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="card" size={30} color={color.link} strokeWidth={1.8} />
        </View>
        <Txt size={22} weight={800} align="center" tracking={-0.02}>
          Connect your bank
        </Txt>
        <Txt size={14} weight={500} color={color.inkMuted} align="center" leading={1.5}>
          CaribPay moves money between banks and never holds it. Your money stays where it is until
          you send it.
        </Txt>
      </View>

      {byCountry.length > 0 && (
        <Card style={{ marginTop: space.xl, gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Txt size={20} weight={800} tabular>
              {bankCount}
            </Txt>
            <Txt size={13} weight={600} color={color.inkMuted}>
              banks across {byCountry.length} countries
            </Txt>
          </View>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: space.sm,
              borderTopWidth: 1,
              borderTopColor: color.hairlineFaint,
              paddingTop: space.md,
            }}
          >
            {byCountry.map(([countryCode, count]) => (
              <View
                key={countryCode}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: color.bg,
                  borderRadius: radius.pill,
                  paddingLeft: 4,
                  paddingRight: 10,
                  paddingVertical: 4,
                }}
              >
                <Flag country={countryCode} size={22} />
                <Txt size={12} weight={700}>
                  {COUNTRY_NAMES[countryCode] ?? countryCode}
                </Txt>
                <Txt size={12} weight={600} color={color.inkMuted} tabular>
                  {count}
                </Txt>
              </View>
            ))}
          </View>
        </Card>
      )}

      <View style={{ flex: 1 }} />

      <Button
        label="Connect an account"
        icon="plus"
        onPress={onConnect}
        style={{ marginTop: space.xl }}
      />
    </ScrollView>
  );
}

export default function AccountsScreen() {
  const router = useRouter();
  const accounts = useAccounts();
  const list = accounts.data?.accounts ?? [];
  const loaded = !accounts.isPending && !accounts.isError;

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Bank accounts" />

      {accounts.isError ? (
        <ErrorState
          title="We can't reach your accounts"
          body="Nothing has changed at your bank — this is just the list. Check your connection and try again."
          onRetry={() => void accounts.refetch()}
        />
      ) : accounts.isPending ? (
        <Loading label="Loading your accounts…" />
      ) : list.length === 0 ? (
        <NoAccounts onConnect={() => router.push("/accounts/link")} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.md }}
        >
          <View style={{ gap: 10 }}>
            {list.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </View>
          <Txt
            size={12}
            weight={500}
            color={color.inkMuted}
            leading={1.45}
            style={{ marginTop: space.md }}
          >
            Balances are read from your bank each time you open this screen. CaribPay never stores
            them.
          </Txt>
        </ScrollView>
      )}

      {/* The empty state carries its own call to action; a second one below it
          would be the same button twice. */}
      {loaded && list.length > 0 && (
        <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md }}>
          <Button
            label="Connect another account"
            icon="plus"
            variant="secondary"
            onPress={() => router.push("/accounts/link")}
          />
        </View>
      )}
      <HomeIndicator />
    </Screen>
  );
}

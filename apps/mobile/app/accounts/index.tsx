import { View } from "react-native";
import { useRouter } from "expo-router";
import { CURRENCY_NAMES, formatAmount, type LinkedAccount } from "@caribpay/shared";
import { color, radius, space } from "@/theme";
import { Flag } from "@/components/Flag";
import {
  Button,
  Card,
  EmptyState,
  HomeIndicator,
  ListRow,
  Loading,
  Pill,
  Screen,
  ScreenHeader,
  SimulatedNotice,
  Skeleton,
  Txt,
} from "@/components/ui";
import { useAccountBalance, useAccounts } from "@/api/hooks";

function AccountRow({ account }: { account: LinkedAccount }) {
  const balance = useAccountBalance(account.id);
  return (
    <ListRow
      leading={<Flag currency={account.currency} country={account.countryCode} size={42} />}
      title={account.institutionDisplayName}
      subtitle={`${account.accountNumberMasked} · ${CURRENCY_NAMES[account.currency]}`}
      trailing={
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {balance.isPending ? (
            <Skeleton height={15} width={80} radius={radius.sm} />
          ) : balance.data === undefined ? (
            <Txt size={12} weight={500} color={color.inkFaint}>
              unavailable
            </Txt>
          ) : (
            <Txt size={15} weight={700} tabular>
              {formatAmount(balance.data.balanceMinor, balance.data.currency)}
            </Txt>
          )}
          {account.isDefault && <Pill tone="primary" label="Default" />}
        </View>
      }
    />
  );
}

export default function AccountsScreen() {
  const router = useRouter();
  const accounts = useAccounts();
  const list = accounts.data?.accounts ?? [];

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Bank accounts" />

      {accounts.isPending ? (
        <Loading label="Loading your accounts…" />
      ) : list.length === 0 ? (
        <EmptyState
          icon="card"
          title="No accounts connected"
          body="CaribPay moves money between banks and never holds it. Connect an account to send and receive."
          actionLabel="Connect an account"
          actionIcon="plus"
          onAction={() => router.push("/accounts/link")}
        />
      ) : (
        <View style={{ flex: 1, paddingHorizontal: space.gutter, gap: space.md }}>
          <SimulatedNotice />
          <Card padded={false} style={{ paddingHorizontal: 14 }}>
            {list.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))}
          </Card>
          <Txt size={12} weight={500} color={color.inkMuted}>
            Balances are read from your bank each time you open this screen. CaribPay never stores
            them.
          </Txt>
        </View>
      )}

      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.md }}>
        <Button
          label="Connect another account"
          icon="plus"
          variant={list.length === 0 ? "primary" : "secondary"}
          onPress={() => router.push("/accounts/link")}
        />
      </View>
      <HomeIndicator />
    </Screen>
  );
}

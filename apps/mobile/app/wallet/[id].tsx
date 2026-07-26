import { FlatList, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  COUNTRY_NAMES,
  CURRENCY_NAMES,
  CURRENCY_SYMBOLS,
  CURRENCY_TO_COUNTRY,
  formatAmount,
  homeCurrencyFor,
  splitAmount,
} from "@caribpay/shared";
import { color, space, TOUCH_TARGET } from "@/theme";
import { Flag } from "@/components/Flag";
import {
  Button,
  EmptyState,
  ErrorState,
  GradientCard,
  groupedRowStyle,
  HomeIndicator,
  Loading,
  Screen,
  ScreenHeader,
  SectionHeader,
  Txt,
} from "@/components/ui";
import { TransactionRow } from "@/components/TransactionRow";
import { useMe, useWalletTransactions, useWallets } from "@/api/hooks";

export default function WalletDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const wallets = useWallets();
  const me = useMe();
  const feed = useWalletTransactions(id);

  const wallet = wallets.data?.wallets.find((w) => w.id === id);
  const homeCurrency =
    me.data === undefined ? undefined : homeCurrencyFor(me.data.user.countryCode);

  if (wallets.isError) {
    return (
      <Screen>
        <ScreenHeader title="Wallet" />
        <ErrorState
          body="We couldn't load this wallet. Check your connection and try again."
          onRetry={() => void wallets.refetch()}
        />
      </Screen>
    );
  }

  if (wallet === undefined) {
    return (
      <Screen>
        <ScreenHeader title="Wallet" />
        {wallets.isPending ? (
          <Loading label="Loading wallet…" />
        ) : (
          <ErrorState title="Wallet not found" body="This wallet is no longer on your account." />
        )}
      </Screen>
    );
  }

  const country = CURRENCY_TO_COUNTRY[wallet.currency];
  const isHome = wallet.currency === homeCurrency;
  const amount = splitAmount(wallet.balanceMinor, wallet.currency);
  const transactions = feed.data ?? [];
  const empty = !feed.isPending && transactions.length === 0;

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader
        title={CURRENCY_NAMES[wallet.currency]}
        trailing={<Flag currency={wallet.currency} size={34} />}
      />

      <GradientCard watermark={false} style={{ marginHorizontal: space.gutter }}>
        <Txt size={13} weight={600} color={color.onDarkMuted}>
          Available balance
        </Txt>
        <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: space.sm }}>
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
        <Txt size={13} weight={500} color={color.onDarkMuted} style={{ marginTop: space.sm }}>
          {COUNTRY_NAMES[country] ?? country} ·{" "}
          {isHome ? "Home wallet" : `${wallet.currency} wallet`}
        </Txt>
      </GradientCard>

      {/* An empty wallet cannot fund a transfer, so Receive leads instead. */}
      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: space.gutter, paddingTop: space.lg, paddingBottom: 6 }}>
        {wallet.balanceMinor > 0 && (
          <Button
            label="Send"
            icon="send"
            height={48}
            style={{ flex: 1, paddingHorizontal: space.md }}
            onPress={() => router.push(`/send?from=${wallet.currency}`)}
          />
        )}
        <Button
          label="Receive"
          icon="receive"
          height={48}
          variant={wallet.balanceMinor > 0 ? "secondary" : "primary"}
          style={{ flex: 1, paddingHorizontal: space.md }}
          onPress={() => router.push(`/receive?currency=${wallet.currency}`)}
        />
        <Button
          label="Add"
          icon="plus"
          height={48}
          variant="secondary"
          style={{ flex: 1, paddingHorizontal: space.md }}
          onPress={() => router.push("/wallet/add")}
        />
      </View>

      <View style={{ flex: 1, paddingHorizontal: space.gutter, paddingTop: 14 }}>
        <SectionHeader
          title="Transactions"
          meta={transactions.length > 0 ? `${transactions.length} shown` : undefined}
        />
        {feed.isPending ? (
          <Loading />
        ) : empty ? (
          <EmptyState
            icon="archive"
            tone="muted"
            title="No transactions yet"
            body={`Share your ${CURRENCY_SYMBOLS[wallet.currency]} address and incoming money shows up here within minutes.`}
            actionLabel="Receive money"
            onAction={() => router.push(`/receive?currency=${wallet.currency}`)}
          />
        ) : (
          <FlatList
            data={transactions}
            keyExtractor={(tx) => tx.id}
            contentContainerStyle={{ paddingBottom: space.lg }}
            renderItem={({ item, index }) => (
              <View style={groupedRowStyle(index, transactions.length)}>
                <TransactionRow
                  transaction={item}
                  walletCurrency={wallet.currency}
                  divider={index < transactions.length - 1}
                />
              </View>
            )}
            ListFooterComponent={
              feed.hasNextPage ? (
                <View style={{ alignItems: "center", paddingTop: space.md }}>
                  <Button
                    label="Load more"
                    variant="ghost"
                    height={TOUCH_TARGET}
                    loading={feed.isFetchingNextPage}
                    onPress={() => void feed.fetchNextPage()}
                    style={{ backgroundColor: color.primarySoft }}
                  />
                </View>
              ) : null
            }
          />
        )}
      </View>
      <HomeIndicator />
    </Screen>
  );
}

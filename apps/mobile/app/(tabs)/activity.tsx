import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import type { Transaction } from "@caribpay/shared";
import { color, radius, space } from "@/theme";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  Screen,
  SectionLabel,
  Skeleton,
  Txt,
} from "@/components/ui";
import { TransactionRow } from "@/components/TransactionRow";
import { useTransactions } from "@/api/hooks";
import { dayGroupLabel } from "@/lib/datetime";

type Filter = "all" | "sent" | "received" | "pending";

const FILTERS = [
  { value: "all" as const, label: "All" },
  { value: "sent" as const, label: "Sent" },
  { value: "received" as const, label: "Received" },
  { value: "pending" as const, label: "Pending" },
];

function matches(tx: Transaction, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "sent":
      return tx.direction === "out";
    case "received":
      return tx.direction === "in";
    case "pending":
      return tx.status === "initiated" || tx.status === "pending_settlement";
  }
}

/** Group consecutive rows under Today / Yesterday / month headings. */
function groupByDay(items: Transaction[]): { label: string; items: Transaction[] }[] {
  const groups: { label: string; items: Transaction[] }[] = [];
  for (const tx of items) {
    const label = dayGroupLabel(tx.createdAt);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.label === label) last.items.push(tx);
    else groups.push({ label, items: [tx] });
  }
  return groups;
}

export default function ActivityScreen() {
  const router = useRouter();
  const feed = useTransactions();
  const [filter, setFilter] = useState<Filter>("all");

  const all = feed.data ?? [];
  const visible = useMemo(() => all.filter((tx) => matches(tx, filter)), [all, filter]);
  const groups = useMemo(() => groupByDay(visible), [visible]);

  return (
    <Screen edges={{ bottom: false }}>
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.sm, paddingBottom: 10 }}>
        <Txt size={20} weight={800} tracking={-0.01}>
          Transfers
        </Txt>
        <Txt size={13} weight={500} color={color.inkMuted} style={{ marginTop: 2 }}>
          {feed.isPending
            ? "All wallets"
            : `All wallets · ${all.length} movement${all.length === 1 ? "" : "s"}`}
        </Txt>
      </View>

      {!feed.isPending && all.length > 0 && (
        <View style={{ paddingHorizontal: space.gutter, paddingBottom: 6 }}>
          <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
        </View>
      )}

      {feed.isError ? (
        <ErrorState
          title="We can't load your transfers"
          body="Your money is safe — this is just the list. Check your connection and try again."
          onRetry={() => void feed.refetch()}
        />
      ) : feed.isPending ? (
        <View style={{ paddingHorizontal: space.gutter, gap: space.md, paddingTop: space.sm }}>
          <Skeleton height={16} width="30%" />
          <Skeleton height={140} radius={radius.card} />
          <Skeleton height={16} width="34%" />
          <Skeleton height={200} radius={radius.card} />
        </View>
      ) : all.length === 0 ? (
        <EmptyState
          icon="activity"
          title="No transfers yet"
          body="Every transfer you make, in any currency, lands here — with the exact rate you got."
          actionLabel="Send your first transfer"
          onAction={() => router.push("/send")}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="filter"
          tone="muted"
          title="Nothing here"
          body="No transfers match this filter yet. Try another one."
          actionLabel="Show all"
          onAction={() => setFilter("all")}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={feed.isRefetching && !feed.isFetchingNextPage}
              onRefresh={() => void feed.refetch()}
              tintColor={color.interactive}
            />
          }
        >
          {groups.map((group) => (
            <View key={group.label}>
              <SectionLabel style={{ paddingTop: space.md, paddingBottom: space.xs }}>
                {group.label}
              </SectionLabel>
              <Card padded={false} style={{ paddingHorizontal: 14 }}>
                {group.items.map((tx, i) => (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                    divider={i < group.items.length - 1}
                  />
                ))}
              </Card>
            </View>
          ))}

          {feed.hasNextPage && (
            <View style={{ alignItems: "center", paddingTop: 14 }}>
              <Button
                label="Load more"
                variant="ghost"
                height={44}
                loading={feed.isFetchingNextPage}
                onPress={() => void feed.fetchNextPage()}
                style={{ backgroundColor: color.primarySoft }}
              />
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

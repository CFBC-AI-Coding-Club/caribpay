import { useCallback, useMemo, useState } from "react";
import { RefreshControl, SectionList, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { Transaction } from "@caribpay/shared";
import { color, radius, space, TOUCH_TARGET } from "@/theme";
import {
  Button,
  EmptyState,
  Pill,
  ErrorState,
  FilterChips,
  groupedRowStyle,
  Screen,
  SectionLabel,
  Skeleton,
  Txt,
} from "@/components/ui";
import { TransactionRow } from "@/components/TransactionRow";
import { useMarkAllRead, useTransactions, useUnreadCount } from "@/api/hooks";
import { isTerminalStatus } from "@/components/ui/Badge";
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
      return !isTerminalStatus(tx.status);
  }
}

/**
 * No matches for the filter — distinct from having no transfers at all.
 *
 * It answers the question the filter was asking (nothing is stuck) and gives the
 * counts, rather than putting an icon in a tile. "Pending" is the filter people
 * reach for when they are worried, so it gets the most reassuring answer.
 */
function FilterEmpty({
  filter,
  all,
  onShowAll,
}: {
  filter: Filter;
  all: Transaction[];
  onShowAll: () => void;
}) {
  const delivered = all.filter((t) => t.status === "completed").length;
  const returned = all.filter((t) => t.status === "reversed" || t.status === "failed").length;

  const copy: Record<Exclude<Filter, "all">, { title: string; body: string }> = {
    pending: {
      title: "Nothing in flight",
      body: `Every one of your ${all.length} transfers has settled. Pending only fills while two banks are still talking — usually seconds.`,
    },
    sent: { title: "Nothing sent yet", body: "Transfers you send will be listed here." },
    received: {
      title: "Nothing received yet",
      body: "Share your CaribPay address and arrivals will be listed here.",
    },
  };
  const { title, body } = copy[filter as Exclude<Filter, "all">] ?? copy.pending;

  return (
    <View style={{ flex: 1, paddingHorizontal: space.gutter, paddingTop: space.xl, gap: space.lg }}>
      <View style={{ gap: 8 }}>
        <Txt size={20} weight={800} tracking={-0.01}>
          {title}
        </Txt>
        <Txt size={15} weight={500} color={color.inkMuted} leading={1.5}>
          {body}
        </Txt>
      </View>

      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Pill tone="success" icon="check" label={`${delivered} delivered`} size={13} />
        {returned > 0 && <Pill tone="error" icon="close" label={`${returned} returned`} size={13} />}
      </View>

      <Button label="Show all transfers" variant="secondary" onPress={onShowAll} />
    </View>
  );
}

/** Group consecutive rows under Today / Yesterday / month headings, in SectionList shape. */
function groupByDay(items: Transaction[]): { label: string; data: Transaction[] }[] {
  const groups: { label: string; data: Transaction[] }[] = [];
  for (const tx of items) {
    const label = dayGroupLabel(tx.createdAt);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.label === label) last.data.push(tx);
    else groups.push({ label, data: [tx] });
  }
  return groups;
}

export default function ActivityScreen() {
  const router = useRouter();
  const feed = useTransactions();
  const [filter, setFilter] = useState<Filter>("all");

  // Opening this tab is seeing the arrival: the transfer that triggered the
  // badge is in this list. Without this the badge would never clear.
  const unread = useUnreadCount();
  const markAllRead = useMarkAllRead();
  const hasUnread = (unread.data ?? 0) > 0;
  const clearBadge = markAllRead.mutate;
  useFocusEffect(
    useCallback(() => {
      if (hasUnread) clearBadge();
    }, [hasUnread, clearBadge]),
  );

  const all = feed.items;
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
            ? "Across your accounts"
            : `Across your accounts · ${all.length} movement${all.length === 1 ? "" : "s"}`}
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
        <FilterEmpty filter={filter} all={all} onShowAll={() => setFilter("all")} />
      ) : (
        <SectionList
          sections={groups}
          keyExtractor={(tx) => tx.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={feed.isRefetching && !feed.isFetchingNextPage}
              onRefresh={() => void feed.refetch()}
              tintColor={color.interactive}
            />
          }
          renderSectionHeader={({ section }) => (
            <SectionLabel style={{ paddingTop: space.md, paddingBottom: space.xs }}>
              {section.label}
            </SectionLabel>
          )}
          renderItem={({ item, index, section }) => (
            <View style={groupedRowStyle(index, section.data.length)}>
              <TransactionRow transaction={item} divider={index < section.data.length - 1} />
            </View>
          )}
          ListFooterComponent={
            feed.hasNextPage ? (
              <View style={{ alignItems: "center", paddingTop: 14 }}>
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
    </Screen>
  );
}

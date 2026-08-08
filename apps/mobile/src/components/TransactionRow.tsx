import { View } from "react-native";
import { useRouter } from "expo-router";
import {
  CURRENCY_SYMBOLS,
  formatAmount,
  type Currency,
  type Transaction,
} from "@caribpay/shared";
import { color, space } from "@/theme";
import { Icon } from "@/components/Icon";
import { Avatar, ListRow, StatusBadge, Txt } from "@/components/ui";
import { recencyLabel } from "@/lib/datetime";

/** Movements with no counterparty user — funding an account, or converting your own money. */
function selfLabel(tx: Transaction): string {
  if (tx.type === "deposit") return "Wallet top-up";
  if (tx.type === "withdrawal") return "Withdrawal";
  if (tx.type === "fx_conversion") return "Currency conversion";
  return "Transfer";
}

export function TransactionRow({
  transaction: tx,
  /**
   * Set when the row appears inside one account's history: the amount then shows
   * that account's exact ledger delta rather than either side of the transfer.
   */
  accountCurrency,
  divider = false,
  surface = color.surface,
}: {
  transaction: Transaction;
  accountCurrency?: Currency;
  divider?: boolean;
  surface?: string;
}) {
  const router = useRouter();
  const incoming = tx.direction === "in";
  const name = tx.counterparty?.displayName ?? selfLabel(tx);

  // Account-scoped rows use the signed delta; feed rows show the leg that belongs
  // to the viewer — what they sent, or what they received.
  const scoped = accountCurrency !== undefined && tx.walletDeltaMinor !== undefined;
  const amountMinor = scoped
    ? tx.walletDeltaMinor!
    : incoming
      ? tx.destAmountMinor
      : -tx.sourceAmountMinor;
  const currency = scoped ? accountCurrency! : incoming ? tx.destCurrency : tx.sourceCurrency;

  const failed = tx.status === "failed";
  const credit = amountMinor > 0;
  const amountColor = failed ? color.inkMuted : credit ? color.success : color.ink;

  const crossCurrency = tx.sourceCurrency !== tx.destCurrency;
  const route = scoped
    ? incoming
      ? "Received"
      : crossCurrency
        ? `Sent · to ${CURRENCY_SYMBOLS[tx.destCurrency]}`
        : "Sent"
    : crossCurrency
      ? `${CURRENCY_SYMBOLS[tx.sourceCurrency]} → ${CURRENCY_SYMBOLS[tx.destCurrency]}`
      : `${incoming ? "Received" : "Sent"} · ${CURRENCY_SYMBOLS[tx.sourceCurrency]}`;

  return (
    <ListRow
      divider={divider}
      onPress={() => router.push(`/transaction/${tx.id}`)}
      leading={
        tx.counterparty === null ? (
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: incoming ? color.successSoft : color.neutralSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              name="deposit"
              size={22}
              color={incoming ? color.success : color.inkMuted}
              strokeWidth={2}
            />
          </View>
        ) : (
          <Avatar
            name={name}
            size={44}
            country={tx.counterparty.countryCode}
            currency={incoming ? tx.sourceCurrency : tx.destCurrency}
            badgeBackground={surface}
          />
        )
      }
      title={name}
      subtitle={`${route} · ${recencyLabel(tx.createdAt)}`}
      trailing={
        <View style={{ alignItems: "flex-end", gap: space.xs }}>
          <Txt size={15} weight={700} color={amountColor} tabular>
            {formatAmount(amountMinor, currency, { sign: "always" })}
          </Txt>
          {tx.status !== "completed" && <StatusBadge status={tx.status} />}
        </View>
      }
    />
  );
}

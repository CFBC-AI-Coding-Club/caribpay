import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import {
  COUNTRY_NAMES,
  CURRENCY_SYMBOLS,
  formatAmount,
  homeCurrencyFor,
} from "@caribpay/shared";
import { color, radius, shadow, space } from "@/theme";
import { Flag } from "@/components/Flag";
import {
  Avatar,
  HomeIndicator,
  Loading,
  Pill,
  Row,
  RowGroup,
  ScreenHeader,
  SheetScreen,
  Txt,
} from "@/components/ui";
import { useAccounts, useDirectoryKeys, useMe, useTransactions } from "@/api/hooks";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function InfoRow({
  label,
  value,
  leading,
  last = false,
}: {
  label: string;
  value: string;
  leading?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <Row last={last}>
      <Txt size={13} weight={600} color={color.inkMuted}>
        {label}
      </Txt>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 }}>
        {leading}
        <Txt size={value.length > 20 ? 13 : 15} weight={700} tabular numberOfLines={1}>
          {value}
        </Txt>
      </View>
    </Row>
  );
}

function StatCard({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <View
      style={[
        { flex: 1, backgroundColor: color.surface, borderRadius: radius.card, padding: 14 },
        shadow.card,
      ]}
    >
      <Txt size={24} weight={800} tracking={-0.01} color={tone}>
        {value}
      </Txt>
      <Txt size={12} weight={600} color={color.inkMuted} style={{ marginTop: 2 }}>
        {label}
      </Txt>
    </View>
  );
}

export default function ProfileScreen() {
  const me = useMe();
  const accounts = useAccounts();
  const keys = useDirectoryKeys();
  const feed = useTransactions();

  const user = me.data?.user;
  const homeCurrency = user === undefined ? "XCD" : homeCurrencyFor(user.countryCode);
  const primaryVpa = (keys.data ?? []).find((k) => k.type === "vpa" && k.isPrimary)?.value;
  const accountCount = accounts.data?.accounts.length ?? 0;

  const sentCount = useMemo(
    () => feed.items.filter((tx) => tx.direction === "out").length,
    [feed.items],
  );

  const memberSince = useMemo(() => {
    if (user === undefined) return "";
    const d = new Date(user.createdAt);
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }, [user]);

  return (
    <SheetScreen
      header={<ScreenHeader title="Profile" onDark />}
      contentStyle={{ paddingHorizontal: space.gutter }}
    >
      {user === undefined ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
          <View style={{ alignItems: "center", marginTop: -46 }}>
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                borderWidth: 4,
                borderColor: color.bg,
                backgroundColor: color.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Avatar
                name={user.fullName}
                size={88}
                country={user.countryCode}
                currency={homeCurrency}
                badgeBackground={color.bg}
              />
            </View>
            <Txt size={24} weight={800} tracking={-0.01} style={{ marginTop: 10 }}>
              {user.fullName}
            </Txt>
            <Txt size={13} weight={500} color={color.inkMuted} style={{ marginTop: 2 }}>
              Member since {memberSince}
            </Txt>
            {user.kycStatus === "verified" && (
              <Pill
                tone="success"
                icon="shieldCheck"
                label="KYC verified"
                size={13}
                style={{ marginTop: space.md }}
              />
            )}
          </View>

          <RowGroup style={{ marginTop: 18 }}>
            <InfoRow label="Full name" value={user.fullName} />
            <InfoRow label="Email" value={user.email} />
            <InfoRow
              label="Country"
              value={COUNTRY_NAMES[user.countryCode] ?? user.countryCode}
              leading={<Flag country={user.countryCode} currency={homeCurrency} size={20} />}
            />
            <InfoRow
              label="Home currency"
              value={`${CURRENCY_SYMBOLS[homeCurrency]} · ${homeCurrency}`}
            />
            <InfoRow label="CaribPay address" value={primaryVpa ?? "—"} />
            <InfoRow label="Bank accounts" value={`${accountCount} connected`} last />
          </RowGroup>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <StatCard value={String(sentCount)} label="Transfers sent" />
            {/* Fees are out of scope by design — this is a real zero, not a placeholder. */}
            <StatCard
              value={formatAmount(0, homeCurrency)}
              label="Fees paid, ever"
              tone={color.success}
            />
          </View>
        </ScrollView>
      )}
      <HomeIndicator />
    </SheetScreen>
  );
}

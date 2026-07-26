import { ScrollView, View } from "react-native";
import { formatAmount, type Currency } from "@caribpay/shared";
import { color, radius, space } from "@/theme";
import {
  Card,
  ErrorState,
  HomeIndicator,
  ListRow,
  Loading,
  Notice,
  Screen,
  ScreenHeader,
  SectionHeader,
  Txt,
} from "@/components/ui";
import { usePositions } from "@/api/hooks";

/**
 * What each member bank currently owes the network, and what the switch's own FX
 * book is carrying.
 *
 * This is the screen behind the pitch: the credit to a payee was instant, but
 * settlement between the banks is deferred and netted, so these numbers are the
 * intraday exposure that netting later clears.
 */
export default function SettlementScreen() {
  const positions = usePositions();

  const open = (positions.data?.positions ?? []).filter((p) => p.positionMinor !== 0);
  const flat = (positions.data?.positions ?? []).length - open.length;

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Settlement" />
      {positions.isPending ? (
        <Loading label="Reading positions…" />
      ) : positions.isError ? (
        <ErrorState
          body="We couldn't read the clearing positions just now."
          onRetry={() => void positions.refetch()}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
          <View style={{ paddingHorizontal: space.gutter, gap: space.md }}>
            <Notice
              tone="primary"
              icon="info"
              title="Instant to the payee, netted between banks"
              body="Money reaches the recipient immediately. What the banks owe each other is settled in cycles, so one instruction replaces every transfer in the window."
            />
          </View>

          <SectionHeader title="Bank positions" style={{ marginHorizontal: space.gutter }} />
          {open.length === 0 ? (
            <View
              style={{
                marginHorizontal: space.gutter,
                backgroundColor: color.surface,
                borderRadius: radius.card,
                padding: 18,
                alignItems: "center",
              }}
            >
              <Txt size={13} weight={600} color={color.inkMuted} align="center">
                Every position is flat
              </Txt>
              <Txt size={12} weight={500} color={color.inkFaint} align="center" style={{ marginTop: 4 }}>
                Nothing is outstanding between member banks right now.
              </Txt>
            </View>
          ) : (
            <Card padded={false} style={{ marginHorizontal: space.gutter, paddingHorizontal: 14 }}>
              {open.map((p, index) => (
                <ListRow
                  key={`${p.institutionId}-${p.currency}`}
                  divider={index < open.length - 1}
                  title={p.institutionDisplayName}
                  subtitle={p.positionMinor < 0 ? "owes the network" : "is owed by the network"}
                  trailing={
                    <Txt
                      size={15}
                      weight={700}
                      tabular
                      color={p.positionMinor < 0 ? color.pending : color.success}
                    >
                      {formatAmount(Math.abs(p.positionMinor), p.currency as Currency)}
                    </Txt>
                  }
                />
              ))}
            </Card>
          )}

          {flat > 0 && (
            <Txt
              size={12}
              weight={500}
              color={color.inkFaint}
              style={{ paddingHorizontal: space.gutter, paddingTop: space.sm }}
            >
              {flat} other position{flat === 1 ? "" : "s"} flat.
            </Txt>
          )}

          <SectionHeader title="Switch FX book" style={{ marginHorizontal: space.gutter }} />
          <Card padded={false} style={{ marginHorizontal: space.gutter, paddingHorizontal: 14 }}>
            {(positions.data?.fxBook ?? []).map((fx, index, all) => (
              <ListRow
                key={fx.currency}
                divider={index < all.length - 1}
                title={fx.currency}
                trailing={
                  <Txt size={15} weight={700} tabular>
                    {formatAmount(fx.positionMinor, fx.currency as Currency)}
                  </Txt>
                }
              />
            ))}
          </Card>
          <Txt
            size={12}
            weight={500}
            color={color.inkMuted}
            style={{ paddingHorizontal: space.gutter, paddingTop: space.sm }}
            leading={1.45}
          >
            Cross-currency transfers draw on this book, so it runs long in one currency and short in
            another. That exposure is CaribPay's, and it is reported rather than hidden.
          </Txt>
        </ScrollView>
      )}
      <HomeIndicator />
    </Screen>
  );
}

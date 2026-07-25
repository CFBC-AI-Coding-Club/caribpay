import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import {
  CURRENCY_NAMES,
  CURRENCY_SYMBOLS,
  SUPPORTED_CURRENCIES,
  type Currency,
} from "@caribpay/shared";
import { color, radius, shadow, space } from "@/theme";
import { Flag } from "@/components/Flag";
import {
  Button,
  HomeIndicator,
  ListRow,
  Loading,
  Notice,
  Pill,
  RadioDot,
  Screen,
  ScreenHeader,
  SectionLabel,
  Txt,
} from "@/components/ui";
import { useCreateWallet, useWallets } from "@/api/hooks";
import { ApiRequestError } from "@/api/client";

export default function AddWalletScreen() {
  const router = useRouter();
  const wallets = useWallets();
  const createWallet = useCreateWallet();
  const [selected, setSelected] = useState<Currency | null>(null);

  const owned = new Set(wallets.data?.wallets.map((w) => w.currency) ?? []);
  const available = SUPPORTED_CURRENCIES.filter((c) => !owned.has(c));
  const open = SUPPORTED_CURRENCIES.filter((c) => owned.has(c));

  function submit() {
    if (selected === null) return;
    createWallet.mutate(selected, {
      onSuccess: (wallet) => router.replace(`/wallet/${wallet.id}`),
    });
  }

  return (
    <Screen edges={{ bottom: false }}>
      <ScreenHeader title="Add a wallet" />

      <View style={{ paddingHorizontal: space.gutter, paddingTop: 6 }}>
        <Txt size={15} weight={500} color={color.inkMuted} leading={1.5}>
          Open a wallet in a new currency. It's free — no minimum balance.
        </Txt>
      </View>

      {wallets.isPending ? (
        <Loading label="Loading your wallets…" />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: space.gutter,
            paddingTop: 18,
            paddingBottom: space.lg,
            gap: 10,
          }}
        >
          {createWallet.isError && (
            <Notice
              tone="error"
              title="Could not open that wallet"
              body={
                createWallet.error instanceof ApiRequestError
                  ? createWallet.error.message
                  : "Something went wrong. Try again."
              }
            />
          )}

          {available.length > 0 ? (
            <>
              <Txt size={13} weight={700} color={color.inkMuted}>
                Available to open
              </Txt>
              {available.map((currency) => {
                const active = selected === currency;
                return (
                  <Pressable
                    key={currency}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelected(currency)}
                    style={[
                      {
                        backgroundColor: color.surface,
                        borderRadius: radius.card,
                        paddingHorizontal: 14,
                        borderWidth: active ? 2 : 1,
                        borderColor: active ? color.primary : color.borderSoft,
                      },
                      active && shadow.primary,
                    ]}
                  >
                    <ListRow
                      paddingVertical={14}
                      leading={<Flag currency={currency} size={44} />}
                      title={CURRENCY_NAMES[currency]}
                      subtitle={`${currency} · ${CURRENCY_SYMBOLS[currency]}`}
                      trailing={<RadioDot selected={active} />}
                    />
                  </Pressable>
                );
              })}
            </>
          ) : (
            <Notice
              tone="primary"
              icon="check"
              title="Every currency is open"
              body="You already hold a wallet in all five supported currencies."
            />
          )}

          {open.length > 0 && (
            <>
              <SectionLabel style={{ marginTop: space.sm }}>Already open</SectionLabel>
              {open.map((currency) => (
                <View
                  key={currency}
                  style={{
                    backgroundColor: color.tintRow,
                    borderRadius: radius.card,
                    paddingHorizontal: 14,
                  }}
                >
                  <ListRow
                    leading={<Flag currency={currency} size={42} />}
                    title={CURRENCY_NAMES[currency]}
                    subtitle={`${currency} · ${CURRENCY_SYMBOLS[currency]}`}
                    trailing={<Pill label="Added" icon="check" size={12} />}
                  />
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}

      {available.length > 0 && (
        <View style={{ paddingHorizontal: space.gutter, paddingTop: 14, paddingBottom: space.sm }}>
          <Button
            label={
              selected === null
                ? "Choose a currency"
                : `Open ${CURRENCY_SYMBOLS[selected]} wallet`
            }
            disabled={selected === null}
            loading={createWallet.isPending}
            onPress={submit}
          />
        </View>
      )}
      <HomeIndicator />
    </Screen>
  );
}

import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { CURRENCY_SYMBOLS, type Contact } from "@caribpay/shared";
import { color, radius, shadow, space } from "@/theme";
import { Icon } from "@/components/Icon";
import {
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  Screen,
  SearchField,
  Skeleton,
  Txt,
} from "@/components/ui";
import { useContacts } from "@/api/hooks";
import { useDraftStore } from "@/stores/draft";

/** Pinned contacts as tappable avatars — two taps to pay someone. */
function QuickSend({ contacts }: { contacts: Contact[] }) {
  const router = useRouter();
  const setRecipient = useDraftStore((s) => s.setRecipient);
  const reset = useDraftStore((s) => s.reset);

  function send(contact: Contact) {
    reset();
    setRecipient({
      address: contact.walletAddress,
      displayName: contact.displayName,
      countryCode: contact.countryCode,
      currency: contact.currency,
    });
    router.push("/send");
  }

  return (
    <>
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: 4 }}>
        <Txt size={13} weight={700} color={color.inkMuted}>
          Quick send
        </Txt>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: 14, gap: 14 }}
      >
        {contacts.map((contact) => (
          <Pressable
            key={contact.id}
            accessibilityRole="button"
            accessibilityLabel={`Send to ${contact.displayName}`}
            onPress={() => send(contact)}
            style={({ pressed }) => ({ alignItems: "center", gap: space.sm, width: 62, opacity: pressed ? 0.7 : 1 })}
          >
            <Avatar
              name={contact.displayName}
              size={56}
              country={contact.countryCode}
              currency={contact.currency}
              badgeBackground={color.bg}
            />
            <Txt size={12} weight={600} color={color.inkOnTint} numberOfLines={1} align="center">
              {contact.displayName.split(" ")[0]}
            </Txt>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a contact"
          onPress={() => router.push("/contact/add")}
          style={{ alignItems: "center", gap: space.sm, width: 62 }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: color.primarySoft,
              borderWidth: 1.5,
              borderStyle: "dashed",
              borderColor: color.dashedBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="plus" size={22} color={color.link} strokeWidth={2.2} />
          </View>
          <Txt size={12} weight={600} color={color.link} align="center">
            New
          </Txt>
        </Pressable>
      </ScrollView>
    </>
  );
}

export default function ContactsScreen() {
  const router = useRouter();
  const contacts = useContacts();
  const setRecipient = useDraftStore((s) => s.setRecipient);
  const reset = useDraftStore((s) => s.reset);
  const [search, setSearch] = useState("");

  const all = contacts.data ?? [];
  const pinned = all.filter((c) => c.pinned);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === "") return all;
    return all.filter(
      (c) =>
        c.displayName.toLowerCase().includes(needle) ||
        c.walletAddress.toLowerCase().includes(needle),
    );
  }, [all, search]);

  const countries = new Set(all.map((c) => c.countryCode)).size;

  function send(contact: Contact) {
    reset();
    setRecipient({
      address: contact.walletAddress,
      displayName: contact.displayName,
      countryCode: contact.countryCode,
      currency: contact.currency,
    });
    router.push("/send");
  }

  return (
    <Screen edges={{ bottom: false }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: space.gutter,
          paddingTop: space.sm,
          paddingBottom: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Txt size={20} weight={800} tracking={-0.01}>
            Contacts
          </Txt>
          <Txt size={13} weight={500} color={color.inkMuted} style={{ marginTop: 2 }}>
            {contacts.isPending
              ? "Loading…"
              : all.length === 0
                ? "No saved contacts"
                : `${all.length} saved across ${countries} ${countries === 1 ? "country" : "countries"}`}
          </Txt>
        </View>
        <IconButton
          icon="plus"
          accessibilityLabel="Add a contact"
          color={color.onDark}
          background={color.interactive}
          strokeWidth={2.4}
          onPress={() => router.push("/contact/add")}
        />
      </View>

      {contacts.isError ? (
        <ErrorState
          title="We can't load your contacts"
          body="Check your connection and try again."
          onRetry={() => void contacts.refetch()}
        />
      ) : contacts.isPending ? (
        <View style={{ paddingHorizontal: space.gutter, gap: space.md }}>
          <Skeleton height={46} radius={radius.field} />
          <Skeleton height={90} radius={radius.card} />
          <Skeleton height={240} radius={radius.card} />
        </View>
      ) : all.length === 0 ? (
        <EmptyState
          icon="peopleAdd"
          title="Add your first contact"
          body="Save the people you send to most and pay them in two taps."
          actionLabel="Add contact"
          actionIcon="plus"
          onAction={() => router.push("/contact/add")}
        />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: space.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={contacts.isRefetching}
              onRefresh={() => void contacts.refetch()}
              tintColor={color.interactive}
            />
          }
        >
          <View style={{ paddingHorizontal: space.gutter, paddingBottom: space.md }}>
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search name or address"
            />
          </View>

          {pinned.length > 0 && <QuickSend contacts={pinned} />}

          <View style={{ paddingHorizontal: space.gutter }}>
            <Txt size={13} weight={700} color={color.inkMuted} style={{ paddingTop: 4, paddingBottom: space.sm }}>
              All contacts
            </Txt>
            {filtered.length === 0 ? (
              <Card style={{ padding: space.xl }}>
                <Txt size={13} weight={500} color={color.inkMuted} align="center">
                  No contact matches “{search.trim()}”.
                </Txt>
              </Card>
            ) : (
              <Card padded={false} style={{ paddingHorizontal: 14 }}>
                {filtered.map((contact, i) => (
                  <ListRow
                    key={contact.id}
                    divider={i < filtered.length - 1}
                    leading={
                      <Avatar
                        name={contact.displayName}
                        size={44}
                        country={contact.countryCode}
                        currency={contact.currency}
                      />
                    }
                    title={contact.displayName}
                    subtitle={`${contact.walletAddress} · ${CURRENCY_SYMBOLS[contact.currency]}`}
                    trailing={
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Send to ${contact.displayName}`}
                        onPress={() => send(contact)}
                        style={[
                          {
                            width: 44,
                            height: 44,
                            borderRadius: radius.chip,
                            backgroundColor: color.primarySoft,
                            alignItems: "center",
                            justifyContent: "center",
                          },
                          shadow.card,
                        ]}
                      >
                        <Icon name="send" size={17} color={color.link} strokeWidth={2.2} />
                      </Pressable>
                    }
                  />
                ))}
              </Card>
            )}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

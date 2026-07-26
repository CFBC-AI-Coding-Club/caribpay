import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { CURRENCY_SYMBOLS, type Contact } from "@caribpay/shared";
import { AVATAR_SIZE, color, radius, shadow, space, TOUCH_TARGET } from "@/theme";
import { Icon } from "@/components/Icon";
import {
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  groupedRowStyle,
  ListRow,
  Pill,
  Screen,
  SearchField,
  Skeleton,
  Txt,
} from "@/components/ui";
import { useContacts } from "@/api/hooks";
import { useDraftStore } from "@/stores/draft";

/**
 * The most a "Quick send" row can hold and still be quick. Past this the row is
 * just a second contacts list you have to scroll — and it would be the one
 * unbounded non-virtualized render left in the app.
 */
const QUICK_SEND_LIMIT = 8;

/** Pinned contacts as tappable avatars — two taps to pay someone. */
function QuickSend({ contacts }: { contacts: Contact[] }) {
  const router = useRouter();
  const setRecipient = useDraftStore((s) => s.setRecipient);
  const reset = useDraftStore((s) => s.reset);

  function send(contact: Contact) {
    reset();
    // Straight to confirmation, so the directory — not a row saved months ago —
    // decides who this key currently reaches.
    router.push({
      pathname: "/send/confirm",
      params: { key: contact.primaryVpa ?? contact.savedKey },
    });
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
        {contacts.slice(0, QUICK_SEND_LIMIT).map((contact) => (
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
              currency={contact.currency ?? undefined}
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
        (c.primaryVpa ?? c.savedKey).toLowerCase().includes(needle),
    );
  }, [all, search]);

  const countries = new Set(all.map((c) => c.countryCode)).size;

  function send(contact: Contact) {
    reset();
    // Straight to confirmation, so the directory — not a row saved months ago —
    // decides who this key currently reaches.
    router.push({
      pathname: "/send/confirm",
      params: { key: contact.primaryVpa ?? contact.savedKey },
    });
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
        <FlatList
          data={filtered}
          keyExtractor={(contact) => contact.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: space.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={contacts.isRefetching}
              onRefresh={() => void contacts.refetch()}
              tintColor={color.interactive}
            />
          }
          ListHeaderComponent={
            <>
              <View style={{ paddingHorizontal: space.gutter, paddingBottom: space.md }}>
                <SearchField
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search name or address"
                />
              </View>
              {pinned.length > 0 && <QuickSend contacts={pinned} />}
              <Txt
                size={13}
                weight={700}
                color={color.inkMuted}
                style={{ paddingHorizontal: space.gutter, paddingTop: 4, paddingBottom: space.sm }}
              >
                All contacts
              </Txt>
            </>
          }
          ListEmptyComponent={
            <View style={{ paddingHorizontal: space.gutter }}>
              <Card style={{ padding: space.xl }}>
                <Txt size={13} weight={500} color={color.inkMuted} align="center">
                  No contact matches “{search.trim()}”.
                </Txt>
              </Card>
            </View>
          }
          renderItem={({ item: contact, index }) => (
            <View
              style={[
                groupedRowStyle(index, filtered.length),
                { marginHorizontal: space.gutter },
              ]}
            >
              <ListRow
                divider={index < filtered.length - 1}
                leading={
                  <Avatar
                    name={contact.displayName}
                    size={AVATAR_SIZE}
                    country={contact.countryCode}
                    currency={contact.currency ?? undefined}
                  />
                }
                title={contact.displayName}
                subtitle={contact.primaryVpa ?? contact.savedKey}
                /*
                  The currency is what they will actually be paid in, so it is a
                  pill rather than more text after a middot: it is a different
                  kind of fact from the address, and the row should not make you
                  read to the end of a sentence to find it.
                */
                subtitleAccessory={
                  contact.currency === null ? (
                    <Pill tone="neutral" label="No bank yet" />
                  ) : (
                    <Pill
                      tone="neutral"
                      label={`${CURRENCY_SYMBOLS[contact.currency]} ${contact.currency}`}
                    />
                  )
                }
                trailing={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Send to ${contact.displayName}`}
                    onPress={() => send(contact)}
                    style={[
                      {
                        width: TOUCH_TARGET,
                        height: TOUCH_TARGET,
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
            </View>
          )}
        />
      )}
    </Screen>
  );
}

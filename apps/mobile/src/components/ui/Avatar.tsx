import { View } from "react-native";
import type { Currency } from "@caribpay/shared";
import { color } from "@/theme";
import { Flag } from "@/components/Flag";
import { Txt } from "./Txt";

/**
 * The design board uses photo slots for people. CaribPay has no avatar upload
 * (and it is out of scope), so we render deterministic initials instead: same
 * person, same colour, every time — no network, no placeholder grey.
 */
const TINTS = [
  { bg: "#E4E7FE", fg: "#3A45C4" },
  { bg: "#FBE4F6", fg: "#A03A8F" },
  { bg: "#E0F1EA", fg: "#0E6A4C" },
  { bg: "#FDECD9", fg: "#8A5A0F" },
  { bg: "#E6E3F7", fg: "#544B9E" },
  { bg: "#DCEEF8", fg: "#1F5F87" },
] as const;

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]![0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

function tintFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length]!;
}

export function Avatar({
  name,
  size = 44,
  /** Country flag badged on the lower-right, as the board shows for counterparties. */
  country,
  currency,
  /** Colour behind the flag badge — match the surface the avatar sits on. */
  badgeBackground = color.surface,
}: {
  name: string;
  size?: number;
  country?: string | null;
  currency?: Currency;
  badgeBackground?: string;
}) {
  const tint = tintFor(name);
  const showFlag = country !== undefined || currency !== undefined;
  const badge = Math.round(size * 0.4);

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tint.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Txt size={Math.round(size * 0.36)} weight={700} color={tint.fg}>
          {initialsOf(name)}
        </Txt>
      </View>
      {showFlag && (
        <View
          style={{
            position: "absolute",
            bottom: -2,
            right: -3,
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            backgroundColor: badgeBackground,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Flag country={country} currency={currency} size={badge - 3} />
        </View>
      )}
    </View>
  );
}

import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { TransactionStatus } from "@caribpay/shared";
import { color, radius, space } from "@/theme";
import { Icon, type IconName } from "@/components/Icon";
import { Txt } from "./Txt";

export type Tone = "neutral" | "primary" | "success" | "pending" | "error" | "onDark";

const TONES: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: color.inkMuted, bg: color.neutralSoft },
  primary: { fg: color.link, bg: color.primarySoft },
  success: { fg: color.success, bg: color.successSoft },
  pending: { fg: color.pending, bg: color.pendingSoft },
  error: { fg: color.errorText, bg: color.errorSoft },
  onDark: { fg: color.onDark, bg: "rgba(255,255,255,0.2)" },
};

/** Small rounded label. Always pairs an icon or text with its colour — status is never colour-only. */
export function Pill({
  label,
  tone = "neutral",
  icon,
  size = 11,
  children,
  style,
}: {
  label?: string;
  tone?: Tone;
  icon?: IconName;
  size?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { fg, bg } = TONES[tone];
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
          alignSelf: "flex-start",
          backgroundColor: bg,
          paddingHorizontal: size >= 13 ? 14 : 8,
          paddingVertical: size >= 13 ? 8 : 4,
          borderRadius: radius.pill,
        },
        style,
      ]}
    >
      {icon !== undefined && <Icon name={icon} size={size} color={fg} strokeWidth={3} />}
      {label !== undefined && (
        // Tabular unconditionally: pills carry the quote countdown, which is the
        // fastest-changing number in the app, and proportional digits made it
        // twitch once a second. It is a no-op on the lettered pills.
        <Txt size={size} weight={700} color={fg} tabular>
          {label}
        </Txt>
      )}
      {children}
    </View>
  );
}

interface StatusSkin {
  label: string;
  tone: Tone;
  icon: IconName;
}

/**
 * Eight internal states, three the payer needs.
 *
 * The saga distinguishes where a conversation with two banks has reached; a
 * person only needs to know whether their money is on its way, has arrived, or
 * came back. The raw state stays visible on the transaction detail screen for
 * anyone who asks.
 */
export function statusSkin(status: TransactionStatus): StatusSkin {
  switch (status) {
    case "completed":
      return { label: "Delivered", tone: "success", icon: "check" };
    case "failed":
      return { label: "Not sent", tone: "error", icon: "close" };
    case "reversed":
      return { label: "Returned", tone: "error", icon: "close" };
    case "reversal_pending":
      return { label: "Returning", tone: "pending", icon: "clock" };
    case "initiated":
    case "debit_pending":
    case "debit_held":
    case "credit_pending":
      return { label: "Sending", tone: "pending", icon: "clock" };
  }
}

/** True once nothing further will happen — stops the detail screen polling. */
export function isTerminalStatus(status: TransactionStatus): boolean {
  return status === "completed" || status === "failed" || status === "reversed";
}

export function StatusBadge({ status, size = 11 }: { status: TransactionStatus; size?: number }) {
  const skin = statusSkin(status);
  return <Pill label={skin.label} tone={skin.tone} icon={skin.icon} size={size} />;
}

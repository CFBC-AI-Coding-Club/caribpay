import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, radius, space } from "@/theme";
import { Icon } from "@/components/Icon";
import { Txt } from "./Txt";

export interface PickerOption<T extends string> {
  value: T;
  label: string;
  detail?: string;
  leading?: ReactNode;
  disabled?: boolean;
  /** Shown instead of the checkmark when the option cannot be chosen. */
  disabledNote?: string;
}

/**
 * Bottom-sheet single-choice list — country on Register, currency on Send and
 * Receive. Deliberately a plain Modal: no gesture library in this project, and a
 * tap-to-dismiss scrim is enough for a picker this short.
 */
export function PickerSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly PickerOption<T>[];
  value?: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Dismiss"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(26,19,64,0.45)", justifyContent: "flex-end" }}
      >
        {/* Swallow taps inside the sheet so they don't dismiss it. */}
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: color.bg,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            paddingTop: space.xl,
            paddingBottom: insets.bottom + space.lg,
            maxHeight: "80%",
          }}
        >
          {/*
            Grabber. Both platforms use it to say "this sheet is dismissible";
            without it the only visible exit is the close button. (True
            swipe-to-dismiss needs a gesture library this project deliberately
            does not carry — tap-scrim and system Back both dismiss.)
          */}
          <View
            style={{
              alignSelf: "center",
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: color.borderStrong,
              marginBottom: space.md,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: space.gutter,
              paddingBottom: space.md,
            }}
          >
            <Txt size={17} weight={800}>
              {title}
            </Txt>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Icon name="close" size={20} color={color.inkMuted} strokeWidth={2.4} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.sm }}>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: option.disabled }}
                  disabled={option.disabled}
                  onPress={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.md,
                    padding: 14,
                    borderRadius: radius.card,
                    backgroundColor: option.disabled
                      ? color.tintRow
                      : pressed
                        ? color.primarySoft
                        : color.surface,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? color.primary : color.borderSoft,
                  })}
                >
                  {option.leading}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt
                      size={15}
                      weight={700}
                      color={option.disabled ? color.inkOnTint : color.ink}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Txt>
                    {option.detail !== undefined && (
                      <Txt size={12} weight={500} color={color.inkMuted} style={{ marginTop: 2 }}>
                        {option.detail}
                      </Txt>
                    )}
                  </View>
                  {option.disabled && option.disabledNote !== undefined ? (
                    <Txt size={12} weight={700} color={color.inkMuted}>
                      {option.disabledNote}
                    </Txt>
                  ) : selected ? (
                    <Icon name="check" size={20} color={color.interactive} strokeWidth={3} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

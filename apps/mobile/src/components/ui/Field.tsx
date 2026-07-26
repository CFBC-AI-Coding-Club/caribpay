import { useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { color, font, radius, space, TOUCH_TARGET } from "@/theme";
import { Icon, type IconName } from "@/components/Icon";
import { Txt } from "./Txt";

/**
 * Hoisted so every input shares one style object. Inline style literals are a
 * fresh reference each render, which makes React Native re-send the whole style
 * payload across the bridge on every keystroke.
 */
const styles = StyleSheet.create({
  fieldBox: {
    backgroundColor: color.surface,
    borderRadius: radius.field,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    // Vertical padding plus minHeight (not height) so the field grows with the
    // system text size instead of clipping its own value.
    paddingVertical: space.sm,
    // Constant, so focus never reflows the form.
    borderWidth: 1,
  },
  focusRing: {
    position: "absolute",
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: radius.field + 3,
    borderWidth: 2,
    borderColor: "rgba(95,108,246,0.40)",
  },
  input: {
    ...font(15, 500),
    flex: 1,
    color: color.ink,
    paddingVertical: 0,
    // Removes Android's built-in glyph padding so text centres in the pill.
    includeFontPadding: false,
  },
  searchBox: {
    minHeight: TOUCH_TARGET,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: radius.field,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
});

/** Label + control + optional hint/error, as used on Login, Register, Add contact. */
export function Field({
  label,
  hint,
  error,
  children,
  style,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: space.sm }, style]}>
      {label !== undefined && (
        <Txt size={12} weight={600} color={color.inkMuted}>
          {label}
        </Txt>
      )}
      {children}
      {error !== undefined ? (
        <Txt size={12} weight={600} color={color.errorText}>
          {error}
        </Txt>
      ) : hint !== undefined ? (
        <Txt size={12} weight={500} color={color.inkFaint}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: IconName;
  /** Renders a show/hide toggle and starts masked. */
  secure?: boolean;
  height?: number;
}

/**
 * The app's text input.
 *
 * Focus changes colour only — never geometry. An earlier version grew the
 * border 1px and added elevation on focus; on Android that reflowed the form
 * mid-touch, so a tap landed on the *next* field and nothing could be typed.
 * The border width is therefore constant and the focus ring is drawn as an
 * overlay sibling that is `pointerEvents="none"` and outside the layout flow.
 */
export function TextField({
  label,
  hint,
  error,
  icon,
  secure = false,
  height = 54,
  ...input
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [masked, setMasked] = useState(secure);
  const invalid = error !== undefined;

  return (
    <Field label={label} hint={hint} error={error}>
      <View
        style={[
          styles.fieldBox,
          { minHeight: height },
          { borderColor: invalid ? color.error : focused ? color.primary : color.border },
        ]}
      >
        {/* Focus ring: absolutely positioned, so showing it costs no layout. */}
        {focused && !invalid && (
          <View pointerEvents="none" style={styles.focusRing} />
        )}
        {icon !== undefined && (
          <Icon name={icon} size={19} color={color.inkFaint} strokeWidth={1.8} />
        )}
        <TextInput
          {...input}
          secureTextEntry={masked}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          placeholderTextColor={color.inkFaint}
          // Android puts extra font padding above the glyphs and top-aligns the
          // text in a fixed-height row; both are wrong inside these pills.
          textAlignVertical="center"
          underlineColorAndroid="transparent"
          style={styles.input}
        />
        {secure && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={masked ? "Show password" : "Hide password"}
            hitSlop={12}
            onPress={() => setMasked((m) => !m)}
          >
            <Icon name={masked ? "eye" : "eyeOff"} size={20} color={color.inkFaint} strokeWidth={1.8} />
          </Pressable>
        )}
      </View>
    </Field>
  );
}

/** Single-line search input with a leading magnifier and a clear button. */
export function SearchField({
  value,
  onChangeText,
  placeholder = "Search",
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.searchBox}>
      <Icon name="search" size={18} color={color.inkFaint} strokeWidth={2} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.inkFaint}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        textAlignVertical="center"
        underlineColorAndroid="transparent"
        style={styles.input}
      />
      {value !== "" && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
          onPress={() => onChangeText("")}
        >
          <Icon name="close" size={16} color={color.inkFaint} strokeWidth={2.4} />
        </Pressable>
      )}
    </View>
  );
}

/** A tappable field that opens a picker rather than accepting typing. */
export function SelectField({
  label,
  leading,
  value,
  onPress,
  height = 52,
}: {
  label?: string;
  leading?: ReactNode;
  value: string;
  onPress: () => void;
  height?: number;
}) {
  return (
    <Field label={label}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => ({
          height,
          backgroundColor: pressed ? color.neutralSoft : color.surface,
          borderRadius: radius.field,
          borderWidth: 1,
          borderColor: color.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: space.lg,
          paddingRight: 14,
        })}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, flex: 1 }}>
          {leading}
          <Txt size={15} weight={500} numberOfLines={1}>
            {value}
          </Txt>
        </View>
        <Icon name="chevronDown" size={18} color={color.inkMuted} strokeWidth={2.2} />
      </Pressable>
    </Field>
  );
}

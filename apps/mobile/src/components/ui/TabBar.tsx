import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { color, font, space } from "@/theme";
import { Icon, type IconName } from "@/components/Icon";
import { Txt } from "./Txt";

/**
 * The board's bottom navigation, drawn per platform.
 *
 * The two specs genuinely differ — iOS is an 88pt bar with 52pt items and the
 * gesture pill floating inside it; Android is an 80pt bar with taller 56pt
 * items and the pill in its own 24pt strip beneath. React Navigation's default
 * bar cannot express both, and shipping one platform's proportions to the other
 * is the "ported from another OS" tell that makes an app feel foreign.
 */
const IOS = {
  barHeight: 88,
  itemHeight: 52,
  gap: 4,
  paddingTop: 6,
  gestureWidth: 140,
  gestureHeight: 5,
  gestureRadius: 3,
  gestureColor: color.homeIndicator,
  gestureStrip: 0,
} as const;

const ANDROID = {
  barHeight: 80,
  itemHeight: 56,
  gap: 5,
  paddingTop: 0,
  gestureWidth: 108,
  gestureHeight: 4,
  gestureRadius: 2,
  gestureColor: color.homeIndicatorAndroid,
  gestureStrip: 24,
} as const;

const TAB_ICONS: Record<string, IconName> = {
  home: "home",
  activity: "activity",
  contacts: "people",
  menu: "grid",
};

/**
 * The unread count, riding the icon.
 *
 * Drawn here rather than through `tabBarBadge` so it can carry the board's 2px
 * white ring — without it the badge muddies into the icon it sits on — and so
 * it clamps at 9+ rather than growing the bar.
 */
function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View
      style={{
        position: "absolute",
        top: -5,
        left: 14,
        minWidth: 18,
        height: 18,
        paddingHorizontal: 5,
        borderRadius: 999,
        backgroundColor: color.error,
        alignItems: "center",
        justifyContent: "center",
        // The ring is what separates the badge from the glyph beneath it.
        borderWidth: 2,
        borderColor: color.surface,
      }}
    >
      <Txt size={11} weight={700} color={color.onDark} tabular>
        {count > 9 ? "9+" : String(count)}
      </Txt>
    </View>
  );
}

export function TabBar({ state, descriptors, navigation, badges }: BottomTabBarProps & {
  /** Unread counts keyed by route name. */
  badges?: Record<string, number>;
}) {
  const insets = useSafeAreaInsets();
  const spec = Platform.OS === "android" ? ANDROID : IOS;
  // The OS draws its own gesture bar on devices that reserve space for one;
  // ours is a stand-in for those that do not.
  const showGesture = insets.bottom === 0;

  return (
    <View style={{ backgroundColor: color.surface }}>
      <View
        style={{
          height: spec.barHeight,
          flexDirection: "row",
          alignItems: Platform.OS === "android" ? "center" : "flex-start",
          paddingTop: spec.paddingTop,
          paddingHorizontal: space.sm,
          borderTopWidth: 1,
          borderTopColor: color.hairline,
        }}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]!;
          const focused = state.index === index;
          const label =
            typeof options.title === "string" ? options.title : route.name;
          const count = badges?.[route.name] ?? 0;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={count > 0 ? `${label}, ${count} new` : label}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              style={{
                flex: 1,
                height: spec.itemHeight,
                alignItems: "center",
                justifyContent: "center",
                gap: spec.gap,
              }}
            >
              <View>
                <Icon
                  name={TAB_ICONS[route.name] ?? "home"}
                  size={24}
                  color={focused ? color.link : color.inkFaint}
                  // Selection thickens the stroke as well as changing hue, so it
                  // never depends on colour alone.
                  strokeWidth={focused ? 2.2 : 1.9}
                />
                <Badge count={count} />
              </View>
              <Txt
                size={11}
                weight={focused ? 700 : 600}
                color={focused ? color.link : color.inkFaint}
                style={font(11, focused ? 700 : 600)}
              >
                {label}
              </Txt>
            </Pressable>
          );
        })}

        {/* iOS floats the pill inside the bar. */}
        {showGesture && spec.gestureStrip === 0 && (
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 8,
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: spec.gestureWidth,
                height: spec.gestureHeight,
                borderRadius: spec.gestureRadius,
                backgroundColor: spec.gestureColor,
              }}
            />
          </View>
        )}
      </View>

      {/* Android gives it its own strip below the bar. */}
      {showGesture && spec.gestureStrip > 0 && (
        <View
          style={{
            height: spec.gestureStrip,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: spec.gestureWidth,
              height: spec.gestureHeight,
              borderRadius: spec.gestureRadius,
              backgroundColor: spec.gestureColor,
            }}
          />
        </View>
      )}

      {/* Real gesture bar present: reserve its space rather than drawing ours. */}
      {insets.bottom > 0 && <View style={{ height: insets.bottom }} />}
    </View>
  );
}

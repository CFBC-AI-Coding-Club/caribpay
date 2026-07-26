import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font } from "@/theme";
import { Icon, type IconName } from "@/components/Icon";

/** The board's bar height, measured above the home-indicator area. */
const TAB_BAR_HEIGHT = 88;

/**
 * Home · Activity · Contacts · Menu, per the design board's BottomNav.
 * The active tab thickens its stroke as well as changing colour, so the
 * selection does not rely on hue alone.
 */
function tabIcon(name: IconName) {
  return ({ focused, color: tint }: { focused: boolean; color: string }) => (
    <Icon name={name} size={24} color={tint} strokeWidth={focused ? 2.2 : 1.9} />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.link,
        tabBarInactiveTintColor: color.inkFaint,
        tabBarStyle: {
          backgroundColor: color.surface,
          borderTopWidth: 1,
          borderTopColor: color.hairline,
          // An explicit height overrides the one react-navigation would derive
          // from the safe area, so the inset has to be added back — otherwise the
          // gesture bar eats a third of the icon-and-label zone.
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: font(11, 600),
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: tabIcon("home") }} />
      <Tabs.Screen name="activity" options={{ title: "Activity", tabBarIcon: tabIcon("activity") }} />
      <Tabs.Screen name="contacts" options={{ title: "Contacts", tabBarIcon: tabIcon("people") }} />
      <Tabs.Screen name="menu" options={{ title: "Menu", tabBarIcon: tabIcon("grid") }} />
    </Tabs>
  );
}

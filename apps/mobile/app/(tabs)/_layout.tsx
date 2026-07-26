import { Tabs } from "expo-router";
import { color } from "@/theme";
import { TabBar } from "@/components/ui";
import { useArrivalWatcher, useUnreadCount } from "@/api/hooks";

/**
 * Home · Activity · Contacts · Menu, per the design board's BottomNav.
 *
 * The bar itself is a custom component: the board specifies genuinely different
 * geometry for iOS and Android (88/52 with the gesture pill inside, versus 80/56
 * with it in its own strip), which React Navigation's default bar cannot express.
 */
export default function TabsLayout() {
  // Polled here rather than on Home so an arrival is visible from any tab —
  // the whole point is that the recipient does not have to be looking.
  const unread = useUnreadCount();
  useArrivalWatcher(unread.data);

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} badges={{ activity: unread.data ?? 0 }} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="activity" options={{ title: "Activity" }} />
      <Tabs.Screen name="contacts" options={{ title: "Contacts" }} />
      <Tabs.Screen name="menu" options={{ title: "Menu" }} />
    </Tabs>
  );
}

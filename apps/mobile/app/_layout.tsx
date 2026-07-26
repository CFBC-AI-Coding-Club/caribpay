import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { useAuthStore } from "@/stores/auth";
import { color, fontAssets } from "@/theme";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/** Routes reachable without a session. Everything else requires one. */
const PUBLIC_ROOTS = new Set(["index", "welcome", "login", "register"]);

/** Redirect between the auth screens and the app based on session state. */
function useAuthGate(ready: boolean): void {
  const status = useAuthStore((s) => s.status);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready || status === "loading") return;
    const root = segments[0];
    // The splash screen (root === undefined) sends users onward once we know.
    const onPublic = root === undefined || PUBLIC_ROOTS.has(root);

    if (status === "unauthenticated" && !onPublic) {
      router.replace("/welcome");
    } else if (status === "authenticated" && (root === undefined || root === "login" || root === "register" || root === "welcome")) {
      router.replace("/(tabs)/home");
    } else if (status === "unauthenticated" && root === undefined) {
      router.replace("/welcome");
    }
  }, [ready, status, segments, router]);
}

function RootNavigator({ ready }: { ready: boolean }) {
  useAuthGate(ready);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="send/index" />
      <Stack.Screen name="send/review" />
      {/*
        The back gesture stays enabled here. Settlement continues server-side
        whatever the user does, and the feed shows the same state — so trapping
        them on this screen buys nothing and breaks the most reflexive gesture
        on both platforms (HIG: never disable edge-swipe back; Material: never
        hijack predictive Back).
      */}
      <Stack.Screen name="transfer/[id]" />
      <Stack.Screen name="transaction/[id]" />
      <Stack.Screen name="wallet/[id]" />
      <Stack.Screen name="wallet/add" />
      <Stack.Screen name="contact/add" />
      <Stack.Screen name="receive" />
      <Stack.Screen name="scan" options={{ animation: "fade" }} />
      <Stack.Screen name="profile" />
    </Stack>
  );
}

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Render nothing until the type is ready, otherwise the first paint flashes in
  // the system font. A font *error* should not brick the app, so we proceed.
  const ready = fontsLoaded || fontError !== null;
  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <RootNavigator ready={ready} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "@/stores/auth";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const AUTH_GROUPS = new Set(["(tabs)", "transfer"]);

/** Redirect between the auth screens and the app based on session state. */
function useAuthGate(): void {
  const status = useAuthStore((s) => s.status);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    const root = segments[0];
    const inAuthedArea = root !== undefined && AUTH_GROUPS.has(root);
    if (status === "unauthenticated" && inAuthedArea) {
      router.replace("/login");
    } else if (status === "authenticated" && (root === "login" || root === "register")) {
      router.replace("/(tabs)/home");
    } else if (status === "authenticated" && root === undefined) {
      router.replace("/(tabs)/home");
    } else if (status === "unauthenticated" && root === undefined) {
      router.replace("/login");
    }
  }, [status, segments, router]);
}

function RootNavigator() {
  useAuthGate();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="transfer/[id]" options={{ headerShown: true, title: "Transfer" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

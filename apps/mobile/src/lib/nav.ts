import { useCallback } from "react";
import { useRouter, type Href } from "expo-router";

/** Where back goes when there is no history to go back to. */
export const BACK_FALLBACK: Href = "/(tabs)/home";

/**
 * Back, or somewhere sensible when there is no back.
 *
 * A screen can be mounted with an empty history in more ways than is obvious —
 * a deep link into a transfer, a notification tap, or a Fast Refresh while
 * sitting on a detail route. In all of those `router.back()` dispatches a
 * GO_BACK that no navigator can handle, which surfaces as an error overlay in
 * development and as a dead button in production.
 *
 * Checking first costs nothing and turns the dead button into a way out.
 */
export function useGoBack(fallback: Href = BACK_FALLBACK): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallback);
  }, [router, fallback]);
}

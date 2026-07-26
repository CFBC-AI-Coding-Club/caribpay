import { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { color, radius, space } from "@/theme";
import { Icon } from "@/components/Icon";
import {
  Button,
  HomeIndicator,
  IconButton,
  Loading,
  Screen,
  ScreenHeader,
  Txt,
} from "@/components/ui";
import { useResolveQr } from "@/api/hooks";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useDraftStore } from "@/stores/draft";

/** Sweeping line inside the reticle while the camera is live. */
function ScanLine() {
  const y = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [y, reducedMotion]);

  // Reduce Motion: a full-screen repeating sweep is exactly the kind of motion
  // this setting exists to stop. The reticle brackets and the instruction copy
  // already communicate "point the camera here".
  if (reducedMotion) return null;

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        top: 16,
        height: 2,
        backgroundColor: color.lavender,
        shadowColor: color.lavender,
        shadowOpacity: 0.8,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 0 },
        transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 232] }) }],
      }}
    />
  );
}

/** The four bracket corners of the scan reticle. */
function Reticle({ tint }: { tint: string }) {
  const corners = [
    { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 24 },
    { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 24 },
    { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 24 },
    { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 24 },
  ];
  return (
    <>
      {corners.map((corner, i) => (
        <View key={i} style={{ position: "absolute", width: 52, height: 52, borderColor: tint, ...corner }} />
      ))}
    </>
  );
}

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const resolve = useResolveQr();
  const setRecipient = useDraftStore((s) => s.setRecipient);

  const [torch, setTorch] = useState(false);
  /** Set once a code is read, so the camera stops firing callbacks. */
  const [handled, setHandled] = useState(false);

  const failed = resolve.isError;

  function onScanned(data: string) {
    if (handled) return;
    setHandled(true);
    resolve.mutate(data, {
      onSuccess: (resolved) => {
        // The QR is signed, but the directory still gets the last word on who
        // this address currently reaches — so the same confirm step as typing.
        router.replace({ pathname: "/send/confirm", params: { key: resolved.vpa } });
      },
    });
  }

  function scanAgain() {
    resolve.reset();
    setHandled(false);
  }

  if (permission === null) {
    return (
      <Screen dark>
        <ScreenHeader title="Scan to pay" onDark backIcon="close" />
        <Loading />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen dark>
        <ScreenHeader title="Scan to pay" onDark backIcon="close" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: space.md }}>
          <Icon name="scan" size={58} color={color.onDark} strokeWidth={1.4} />
          <Txt size={20} weight={800} color={color.onDark} align="center">
            Camera access needed
          </Txt>
          <Txt size={13} weight={500} color={color.onDarkMuted} align="center" leading={1.5}>
            CaribPay uses the camera only to read payment QR codes. Nothing is recorded.
          </Txt>
          <Button
            label={permission.canAskAgain ? "Allow camera" : "Enter address instead"}
            variant="onDarkPrimary"
            style={{ marginTop: space.sm, alignSelf: "stretch" }}
            onPress={() => {
              if (permission.canAskAgain) void requestPermission();
              else router.replace("/send");
            }}
          />
        </View>
        <HomeIndicator onDark />
      </Screen>
    );
  }

  const tint = failed ? color.error : color.onDark;

  return (
    <Screen dark background={color.ink} edges={{ bottom: false }}>
      <ScreenHeader
        title="Scan to pay"
        onDark
        backIcon="close"
        onBack={() => router.back()}
        trailing={
          failed ? undefined : (
            <IconButton
              icon="torch"
              accessibilityLabel={torch ? "Turn off the torch" : "Turn on the torch"}
              color={color.onDark}
              background={torch ? "rgba(255,255,255,0.32)" : color.onDarkFill}
              elevated={false}
              strokeWidth={1.9}
              onPress={() => setTorch((t) => !t)}
            />
          )
        }
      />

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {!failed && (
          <CameraView
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => onScanned(data)}
          />
        )}

        {/* Scrim so the reticle and copy stay legible over any scene. */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: failed ? "rgba(37,21,48,0.92)" : "rgba(18,12,40,0.45)",
          }}
        />

        <View style={{ width: 266, height: 266 }}>
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: radius.sheet,
              backgroundColor: failed ? "rgba(198,58,58,0.12)" : "rgba(255,255,255,0.05)",
              borderWidth: 1,
              borderColor: failed ? "rgba(198,58,58,0.3)" : "rgba(255,255,255,0.1)",
            }}
          />
          {failed ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
              <View
                style={{
                  width: 66,
                  height: 66,
                  borderRadius: 33,
                  backgroundColor: color.error,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="warning" size={34} color={color.onDark} strokeWidth={2.4} />
              </View>
              <Txt size={17} weight={800} color={color.onDark}>
                Unrecognised code
              </Txt>
            </View>
          ) : resolve.isPending ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Loading label="Checking that code…" />
            </View>
          ) : (
            <ScanLine />
          )}
          <Reticle tint={tint} />
        </View>

        {failed ? (
          <View style={{ width: "100%", paddingHorizontal: space.gutter, marginTop: space.xl }}>
            <View
              style={{
                backgroundColor: "rgba(198,58,58,0.16)",
                borderWidth: 1,
                borderColor: "rgba(198,58,58,0.34)",
                borderRadius: radius.field,
                paddingHorizontal: 14,
                paddingVertical: space.md,
              }}
            >
              <Txt size={13} weight={800} color={color.errorOnDark}>
                Not a CaribPay code
              </Txt>
              <Txt size={13} weight={500} color={color.onDarkMuted} leading={1.45} style={{ marginTop: 2 }}>
                Ask the person to open Receive and show you the code there.
              </Txt>
              <Txt size={11} weight={600} color={color.errorOnDark} tabular style={{ marginTop: space.sm }}>
                Ref INVALID_QR_PAYLOAD
              </Txt>
            </View>
          </View>
        ) : (
          <View style={{ marginTop: 22, paddingHorizontal: 40 }}>
            <Txt size={15} weight={700} color={color.onDark} align="center">
              Point at a CaribPay QR code
            </Txt>
            <Txt size={13} weight={500} color={color.onDarkMuted} align="center" style={{ marginTop: 4 }}>
              We'll prefill the recipient for you.
            </Txt>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: space.gutter, paddingBottom: space.sm, gap: 10 }}>
        {failed && <Button label="Scan again" variant="onDarkPrimary" onPress={scanAgain} />}
        <Button
          label="Enter address manually"
          variant="onDarkGhost"
          height={48}
          onPress={() => router.replace("/send")}
        />
      </View>
      <HomeIndicator onDark />
    </Screen>
  );
}

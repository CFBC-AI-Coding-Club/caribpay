import { useEffect, useRef } from "react";
import { Animated, Easing, Image, View } from "react-native";
import { color, space } from "@/theme";
import { HomeIndicator, Screen, Txt } from "@/components/ui";

/** Three dots pulsing in sequence while the session is restored. */
function PulsingDots() {
  const dots = useRef([
    new Animated.Value(0.45),
    new Animated.Value(0.45),
    new Animated.Value(0.45),
  ]).current;

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, {
            toValue: 1,
            duration: 350,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.45,
            duration: 350,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 150),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [dots]);

  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color.onDark,
            opacity: dot,
            transform: [{ scale: dot }],
          }}
        />
      ))}
    </View>
  );
}

/**
 * Splash. The root layout's auth gate replaces this route as soon as it knows
 * whether there is a session, so this only ever shows for a moment.
 */
export default function SplashScreen() {
  return (
    <Screen gradient>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 22 }}>
        <Image
          accessibilityIgnoresInvertColors
          source={require("../assets/logo-mark.png")}
          style={{
            position: "absolute",
            top: 34,
            right: -56,
            width: 250,
            height: 250,
            opacity: 0.12,
          }}
          resizeMode="contain"
        />
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel="CaribPay"
          source={require("../assets/logo-mark.png")}
          style={{ width: 104, height: 104 }}
          resizeMode="contain"
        />
        <View style={{ alignItems: "center" }}>
          <Txt size={31} weight={800} color={color.onDark} tracking={-0.02}>
            CaribPay
          </Txt>
          <Txt size={15} weight={600} color={color.onDarkMuted} style={{ marginTop: space.sm }}>
            One region. One payment.
          </Txt>
        </View>
      </View>
      <View style={{ alignItems: "center", gap: space.lg, paddingBottom: 30 }}>
        <PulsingDots />
        <Txt size={13} weight={500} color="rgba(255,255,255,0.88)">
          Securing your session…
        </Txt>
      </View>
      <HomeIndicator onDark />
    </Screen>
  );
}

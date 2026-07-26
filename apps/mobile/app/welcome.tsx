import { Image, View } from "react-native";
import { useRouter } from "expo-router";
import { color, space } from "@/theme";
import { Button, HomeIndicator, Screen, Txt } from "@/components/ui";

const MARQUEE = ["Send", "Receive", "Save", "Convert"];

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <Screen gradient>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space.gutter, paddingTop: space.md }}>
        <Image
          accessibilityIgnoresInvertColors
          source={require("../assets/logo-mark.png")}
          style={{ width: 36, height: 36 }}
          resizeMode="contain"
        />
        <Txt size={15} weight={700} color={color.onDark}>
          CaribPay
        </Txt>
      </View>

      {/*
        Oversized ghosted verbs — decorative, so hidden from screen readers.

        Deliberate exception to the nine-size ramp: at 13% opacity these read as
        background texture, not type, and the ramp's Display (40) is already spent
        on the headline below — which the system allows only one of per screen.
        Sizing them 40 would put two Displays on one screen and flatten the
        depth this composition is built on.
      */}
      <View style={{ flex: 1, overflow: "hidden" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ position: "absolute", top: 28, left: space.gutter }}>
          {MARQUEE.map((word) => (
            <Txt key={word} size={58} weight={800} color="rgba(255,255,255,0.13)" leading={1} tracking={-0.01}>
              {word}
            </Txt>
          ))}
        </View>
      </View>

      <View style={{ paddingHorizontal: space.gutter, paddingBottom: 30, gap: space.xl }}>
        <View>
          <Txt size={40} weight={800} color={color.onDark} tracking={-0.02} leading={1.05}>
            {"One region.\nOne payment."}
          </Txt>
          <Txt size={15} weight={500} color={color.onDarkMuted} leading={1.5} style={{ marginTop: 14 }}>
            Move money across the islands in seconds — little to no fees, and no US dollar required.
          </Txt>
        </View>
        <View style={{ gap: space.md }}>
          <Button
            label="Create an account"
            variant="onDarkPrimary"
            onPress={() => router.push("/register")}
          />
          <Button
            label="I already have an account"
            variant="onDark"
            onPress={() => router.push("/login")}
          />
        </View>
      </View>
      <HomeIndicator onDark />
    </Screen>
  );
}

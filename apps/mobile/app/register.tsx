import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import {
  COUNTRY_NAMES,
  CURRENCY_SYMBOLS,
  SUPPORTED_COUNTRIES,
  homeCurrencyFor,
  type SupportedCountry,
} from "@caribpay/shared";
import { color, space } from "@/theme";
import { Flag } from "@/components/Flag";
import {
  Button,
  Notice,
  PickerSheet,
  SelectField,
  SheetScreen,
  TextField,
  Txt,
} from "@/components/ui";
import { useRegister } from "@/api/hooks";
import { ApiRequestError } from "@/api/client";

const COUNTRY_OPTIONS = SUPPORTED_COUNTRIES.map((code) => ({
  value: code,
  label: COUNTRY_NAMES[code] ?? code,
  detail: `${CURRENCY_SYMBOLS[homeCurrencyFor(code)]} · ${homeCurrencyFor(code)}`,
  leading: <Flag country={code} size={30} />,
}));

export default function RegisterScreen() {
  const router = useRouter();
  const register = useRegister();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState<SupportedCountry>("KN");
  const [pickerOpen, setPickerOpen] = useState(false);

  const homeCurrency = homeCurrencyFor(country);
  const passwordTooShort = password !== "" && password.length < 8;
  const canSubmit =
    fullName.trim() !== "" &&
    email.trim() !== "" &&
    password.length >= 8 &&
    !register.isPending;

  function submit() {
    if (!canSubmit) return;
    register.mutate({
      fullName: fullName.trim(),
      email: email.trim(),
      password,
      countryCode: country,
    });
  }

  return (
    <SheetScreen
      header={
        <View style={{ paddingHorizontal: space.gutter, paddingTop: 6 }}>
          <Image
            accessibilityIgnoresInvertColors
            source={require("../assets/logo-mark.png")}
            style={{ width: 36, height: 36 }}
            resizeMode="contain"
          />
          <Txt size={24} weight={800} color={color.onDark} tracking={-0.02} style={{ marginTop: 20 }}>
            Create your account
          </Txt>
          <Txt size={15} weight={500} color={color.onDarkMuted} style={{ marginTop: 6 }}>
            One address. Every island.
          </Txt>
        </View>
      }
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: space.gutter, paddingTop: 26, gap: space.md }}
          keyboardShouldPersistTaps="handled"
        >
          {register.isError && (
            <Notice
              tone="error"
              title="Could not create your account"
              body={
                register.error instanceof ApiRequestError && register.error.status === 409
                  ? "An account already exists with that email address."
                  : register.error.message
              }
            />
          )}

          <TextField
            label="Full name"
            height={52}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
          />
          <TextField
            label="Email"
            height={52}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <TextField
            label="Password"
            height={52}
            secure
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            error={passwordTooShort ? "Use at least 8 characters." : undefined}
          />
          <SelectField
            label="Country"
            value={COUNTRY_NAMES[country] ?? country}
            leading={<Flag country={country} size={24} />}
            onPress={() => setPickerOpen(true)}
          />

          {/*
            Says what actually happens, and what does not: signup mints an
            address, but nothing can reach it until a bank account is connected.
            Promising a wallet here would be promising something we deleted.
          */}
          <Notice
            tone="primary"
            icon="info"
            title="You'll get a CaribPay address"
            body="Connect your bank account afterwards and the address starts working — CaribPay moves the money, your bank keeps it."
          />

          <Button
            label="Create account"
            onPress={submit}
            loading={register.isPending}
            disabled={!canSubmit}
            style={{ marginTop: 2 }}
          />

          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Txt size={13} weight={500} color={color.inkMuted}>
              Already have an account?
            </Txt>
            <Pressable onPress={() => router.replace("/login")} hitSlop={12} accessibilityRole="link">
              <Txt size={13} weight={700} color={color.link}>
                Log in
              </Txt>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <PickerSheet
        visible={pickerOpen}
        title="Where do you live?"
        options={COUNTRY_OPTIONS}
        value={country}
        onSelect={setCountry}
        onClose={() => setPickerOpen(false)}
      />
    </SheetScreen>
  );
}

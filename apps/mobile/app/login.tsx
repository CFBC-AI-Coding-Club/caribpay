import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { color, space } from "@/theme";
import { Button, Notice, SheetScreen, TextField, Txt } from "@/components/ui";
import { useLogin } from "@/api/hooks";
import { ApiRequestError, ApiUnreachableError } from "@/api/client";

/**
 * Three failures that need different words.
 *
 * A wrong password is never split into "no such email" and "wrong password" —
 * that turns the login form into a way to find out who has an account. An
 * unreachable server is not the user's mistake and must not read like one, so
 * it says so plainly and leaves the form filled in.
 */
function loginError(error: unknown): { title: string; body: string } {
  if (error instanceof ApiUnreachableError) {
    return {
      title: "We couldn't reach CaribPay",
      body: error.timedOut
        ? "The connection timed out. Check your signal and try again — nothing was sent."
        : "Check your connection and try again. Your details are still here.",
    };
  }
  if (error instanceof ApiRequestError && error.status === 401) {
    return {
      title: "That didn't match",
      body: "The email and password don't go together. Check both, and mind the caps lock.",
    };
  }
  if (error instanceof ApiRequestError && error.status === 429) {
    return {
      title: "Too many attempts",
      body: "Wait a minute before trying again. This protects your account from someone guessing.",
    };
  }
  return {
    title: "Could not log you in",
    body: error instanceof Error ? error.message : "Something went wrong. Try again.",
  };
}

export default function LoginScreen() {
  const router = useRouter();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit = email.trim() !== "" && password !== "" && !login.isPending;

  function submit() {
    if (!canSubmit) return;
    login.mutate({ email: email.trim(), password });
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
          <Txt size={24} weight={800} color={color.onDark} tracking={-0.02} style={{ marginTop: 22 }}>
            Welcome back
          </Txt>
          <Txt size={15} weight={500} color={color.onDarkMuted} style={{ marginTop: 6 }}>
            Log in to move money across the region.
          </Txt>
        </View>
      }
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: space.gutter, paddingTop: 30, gap: space.lg }}
          keyboardShouldPersistTaps="handled"
        >
          {login.isError && <Notice tone="error" {...loginError(login.error)} />}

          <TextField
            label="Email"
            icon="mail"
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
            icon="lock"
            secure
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={submit}
            returnKeyType="go"
          />

          <Button label="Log in" onPress={submit} loading={login.isPending} disabled={!canSubmit} />

          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={{ flex: 1, height: 1, backgroundColor: color.border }} />
            <Txt size={12} weight={600} color={color.inkFaint}>
              or
            </Txt>
            <View style={{ flex: 1, height: 1, backgroundColor: color.border }} />
          </View>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Txt size={13} weight={500} color={color.inkMuted}>
              New to CaribPay?
            </Txt>
            <Pressable
              onPress={() => router.replace("/register")}
              hitSlop={12}
              accessibilityRole="link"
            >
              <Txt size={13} weight={700} color={color.link}>
                Create an account
              </Txt>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SheetScreen>
  );
}

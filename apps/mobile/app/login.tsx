import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { loginRequestSchema } from "@caribpay/shared";
import { useLogin } from "@/api/hooks";
import { ApiRequestError } from "@/api/client";
import { Field, PrimaryButton, ErrorText, colors } from "@/components/ui";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();

  const onSubmit = () => {
    setError(null);
    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError("Enter a valid email and password");
      return;
    }
    login.mutate(parsed.data, {
      onError: (e) => setError(e instanceof ApiRequestError ? e.message : "Login failed"),
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.brand}>CaribPay</Text>
        <Text style={styles.subtitle}>Sign in to your wallet</Text>

        <ErrorText message={error} />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
        />
        <PrimaryButton title="Sign in" onPress={onSubmit} loading={login.isPending} />

        <Link href="/register" style={styles.link}>
          <Text style={styles.linkText}>New here? Create an account</Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: "center", padding: 24 },
  brand: { fontSize: 34, fontWeight: "800", color: colors.primary, textAlign: "center" },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: "center", marginBottom: 28 },
  link: { marginTop: 20, alignSelf: "center" },
  linkText: { color: colors.primary, fontWeight: "600" },
});

import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link } from "expo-router";
import { registerRequestSchema } from "@caribpay/shared";
import { useRegister } from "@/api/hooks";
import { ApiRequestError } from "@/api/client";
import { Field, PrimaryButton, ErrorText, colors } from "@/components/ui";

// Country → home currency is mapped server-side; these cover the demo islands.
const COUNTRIES: Array<{ code: string; label: string }> = [
  { code: "KN", label: "St. Kitts (XCD)" },
  { code: "VC", label: "St. Vincent (XCD)" },
  { code: "JM", label: "Jamaica (JMD)" },
  { code: "BB", label: "Barbados (BBD)" },
  { code: "TT", label: "Trinidad (TTD)" },
  { code: "US", label: "USA (USD)" },
];

export default function RegisterScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [countryCode, setCountryCode] = useState("KN");
  const [error, setError] = useState<string | null>(null);
  const register = useRegister();

  const onSubmit = () => {
    setError(null);
    const parsed = registerRequestSchema.safeParse({ email, password, fullName, countryCode });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your details");
      return;
    }
    register.mutate(parsed.data, {
      onError: (e) =>
        setError(e instanceof ApiRequestError ? e.message : "Could not create account"),
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Create account</Text>

        <ErrorText message={error} />
        <Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="Jane Doe" autoCapitalize="words" />
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
          placeholder="At least 8 characters"
        />

        <Text style={styles.fieldLabel}>Country</Text>
        <View style={styles.countryGrid}>
          {COUNTRIES.map((country) => {
            const selected = country.code === countryCode;
            return (
              <Pressable
                key={country.code}
                onPress={() => setCountryCode(country.code)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {country.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <PrimaryButton title="Create account" onPress={onSubmit} loading={register.isPending} />

        <Link href="/login" style={styles.link}>
          <Text style={styles.linkText}>Already have an account? Sign in</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  brand: { fontSize: 28, fontWeight: "800", color: colors.text, marginBottom: 24 },
  fieldLabel: { color: colors.muted, marginBottom: 8, fontSize: 13, fontWeight: "600" },
  countryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 22 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextSelected: { color: colors.primaryText, fontWeight: "700" },
  link: { marginTop: 20, alignSelf: "center" },
  linkText: { color: colors.primary, fontWeight: "600" },
});

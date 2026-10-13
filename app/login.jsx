
import { useRouter } from "expo-router";
import { useState } from "react";

import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { API_URL } from "../constants/api";

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert(
        "Error",
        "Please enter your email and password."
      );
      return;
    }

    if (loading) return;

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/users/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        Alert.alert(
          "Login Failed",
          data.message || "Incorrect email or password."
        );
        return;
      }

      // No JWT or persistent login session in this version.
      Alert.alert("Success", data.message || "Login successful.", [
        {
          text: "Continue",
          onPress: () => router.replace("/(tabs)/home"),
        },
      ]);
    } catch (error) {
      console.error("Login request error:", error);

      Alert.alert(
        "Connection Error",
        "Cannot connect to the server. Check your API address, Wi-Fi, and backend server."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = () => {
    router.push("/signup");
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Sign In</Text>

          <Text style={styles.subtitle}>
            Enter your email and password to continue.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email Address</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#777777"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
          />

          <Text style={styles.label}>Password</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor="#777777"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            value={password}
            onChangeText={setPassword}
            editable={!loading}
            onSubmitEditing={handleLogin}
            returnKeyType="go"
          />

          <TouchableOpacity
            style={[
              styles.button,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.registerContainer}>
          <Text style={styles.registerPrompt}>
            Don't have an account?
          </Text>

          <TouchableOpacity
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.registerText}>Register</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  header: {
    marginBottom: 28,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#222222",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#666666",
  },
  form: {
    width: "100%",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333333",
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#CCCCCC",
    borderRadius: 5,
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#222222",
    backgroundColor: "#FFFFFF",
    marginBottom: 20,
  },
  button: {
    height: 48,
    backgroundColor: "#1565C0",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  registerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  registerPrompt: {
    color: "#666666",
    fontSize: 13,
    marginRight: 5,
  },
  registerText: {
    color: "#1565C0",
    fontSize: 13,
    fontWeight: "600",
  },
});

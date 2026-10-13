
import { useRouter } from "expo-router";
import { useState } from "react";

import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { API_URL } from "../constants/api";

export default function SignupScreen() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (
      !username.trim() ||
      !email.trim() ||
      !password ||
      !confirmPassword
    ) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    if (
      username.trim().length < 6 ||
      username.trim().length > 16
    ) {
      Alert.alert(
        "Error",
        "Username must be 6–16 characters long."
      );
      return;
    }

    if (password.length < 8) {
      Alert.alert(
        "Error",
        "Password must be at least 8 characters."
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    if (loading) return;

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/users/signup`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: username.trim(),
            email: email.trim(),
            password,
            confirmPassword,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        Alert.alert(
          "Registration Failed",
          data.message || "Unable to create your account."
        );
        return;
      }

      Alert.alert(
        "Success",
        "You successfully created your account.",
        [
          {
            text: "Sign In",
            onPress: () => router.replace("/login"),
          },
        ]
      );
    } catch (error) {
      console.error("Signup request error:", error);

      Alert.alert(
        "Connection Error",
        "Cannot connect to the server. Check your API address, Wi-Fi, and backend server."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    router.push("/login");
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>

          <Text style={styles.subtitle}>
            Enter your information below to create your account.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Username</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your username"
            placeholderTextColor="#777777"
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
            editable={!loading}
          />

          <Text style={styles.helper}>6–16 characters</Text>

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
            autoComplete="new-password"
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />

          <Text style={styles.helper}>
            At least 8 characters
          </Text>

          <Text style={styles.label}>Confirm Password</Text>

          <TextInput
            style={styles.input}
            placeholder="Re-enter your password"
            placeholderTextColor="#777777"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!loading}
          />

          <TouchableOpacity
            style={[
              styles.button,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleSignup}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {loading ? "Creating Account..." : "Create Account"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.loginContainer}>
          <Text style={styles.loginPrompt}>
            Already have an account?
          </Text>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.loginText}>Sign In</Text>
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
    marginBottom: 6,
  },
  helper: {
    fontSize: 12,
    color: "#777777",
    marginBottom: 18,
  },
  button: {
    minHeight: 48,
    backgroundColor: "#1565C0",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  loginPrompt: {
    color: "#666666",
    fontSize: 13,
    marginRight: 5,
  },
  loginText: {
    color: "#1565C0",
    fontSize: 13,
    fontWeight: "600",
  },
});

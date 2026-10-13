import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../constants/api";

export async function getMyProfile() {
  const token = await AsyncStorage.getItem("authToken");

  if (!token) {
    throw new Error("No session found. Please sign in again.");
  }

  const response = await fetch(`${API_URL}/api/users/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      await AsyncStorage.removeItem("authToken");
    }

    throw new Error(data.message || "Unable to load your profile.");
  }

  return data.user;
}

export async function logoutUser() {
  const token = await AsyncStorage.getItem("authToken");

  try {
    if (token) {
      await fetch(`${API_URL}/api/users/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
    }
  } finally {
    await AsyncStorage.removeItem("authToken");
  }
}
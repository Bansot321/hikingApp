import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function TabLayout() {
  return (
    <SafeAreaProvider>
      <Tabs
        screenOptions={{
          headerShown: true,
          headerTitleAlign: 'left',
          headerStyle: {
            backgroundColor: '#FFFFFF',
            height: 80,
          },
          headerTintColor: '#245C43',
          headerTitleStyle: {
            fontSize: 16,
            fontWeight: '800',
          },
          tabBarActiveTintColor: '#245C43',
          tabBarInactiveTintColor: '#89938C',
          tabBarStyle: {
            height: 64,
            paddingBottom: 8,
            paddingTop: 6,
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: '#E4E9E5',
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            headerTitle: 'VERDANT • Home',
            tabBarIcon: () => (
              <Text style={{ fontSize: 20 }}>🏠</Text>
            ),
          }}
        />

        <Tabs.Screen
          name="livetopo"
          options={{
            title: 'LiveTopo',
            headerTitle: 'VERDANT • LiveTopo',
            tabBarIcon: () => (
              <Text style={{ fontSize: 20 }}>🏔️</Text>
            ),
          }}
        />

        <Tabs.Screen
          name="maps"
          options={{
            title: 'Maps',
            headerTitle: 'VERDANT • Maps',
            tabBarIcon: () => (
              <Text style={{ fontSize: 20 }}>🗺️</Text>
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            headerTitle: 'VERDANT • Profile',
            tabBarIcon: () => (
              <Text style={{ fontSize: 20 }}>👤</Text>
            ),
          }}
        />
      </Tabs>
    </SafeAreaProvider>
  );
}
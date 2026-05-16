// Tab layout — Frosted glass tab bar with localized labels

import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/context';
import { useT } from '../../lib/translations';
import { Platform, View, StyleSheet } from 'react-native';
import { PremiumTokens } from '../../constants/colors';

function TabIcon({
  focused,
  color,
  activeName,
  inactiveName,
}: {
  focused: boolean;
  color: string;
  activeName: keyof typeof Ionicons.glyphMap;
  inactiveName: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={tabStyles.iconWrap}>
      <Ionicons name={focused ? activeName : inactiveName} size={22} color={color} />
      {focused && <View style={[tabStyles.dot, { backgroundColor: color }]} />}
    </View>
  );
}

export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const tr = useT();
  const premium = isDark ? PremiumTokens.dark : PremiumTokens.light;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: premium.glassBg,
          borderTopColor: premium.glassBorder,
          borderTopWidth: 1,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
          height: Platform.OS === 'ios' ? 88 : 64,
          shadowColor: premium.cardShadowColor,
          shadowOffset: premium.cardShadowOffset,
          shadowOpacity: premium.cardShadowOpacity,
          shadowRadius: premium.cardShadowRadius,
          elevation: 16,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.4,
          marginTop: 0,
        },
        tabBarItemStyle: { paddingTop: 4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: tr('tab_home'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="home" inactiveName="home-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: tr('tab_learn'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="library" inactiveName="library-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="quiz"
        options={{
          title: tr('tab_quiz'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="help-circle" inactiveName="help-circle-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: tr('tab_progress'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="bar-chart" inactiveName="bar-chart-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: tr('tab_compete'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="trophy" inactiveName="trophy-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: tr('tab_profile'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="person" inactiveName="person-outline" />
          ),
        }}
      />
    </Tabs>
  );
}

const tabStyles = StyleSheet.create({
  iconWrap: { alignItems: 'center', justifyContent: 'center', height: 28 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
});

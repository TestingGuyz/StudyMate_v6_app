// Subject card component for Learn screen

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../lib/context';
import { SubjectColors } from '../constants/colors';
import { BehavioralState } from '../lib/adaptiveEngine';

interface SubjectCardProps {
  name: string;
  icon: string;
  state?: BehavioralState;
  weighted_avg?: number;
  onPress: () => void;
}

const STATE_BADGES: Record<string, { label: string; color: string }> = {
  EMPIRICALLY_WEAK: { label: 'Weak', color: '#EF4444' },
  AVOIDED_AND_WEAK: { label: 'Avoided', color: '#F97316' },
  AVOIDED_BUT_STRONG: { label: 'Strong', color: '#3B82F6' },
  ACTIVE_AND_STRONG: { label: 'On Track', color: '#179C6E' },
  INSUFFICIENT_DATA: { label: 'New', color: '#787680' },
};

export function SubjectCard({ name, icon, state, weighted_avg, onPress }: SubjectCardProps) {
  const { colors, isDark } = useTheme();
  const subjectColor = SubjectColors[name]
    ? isDark
      ? SubjectColors[name].dark
      : SubjectColors[name].light
    : colors.primary;

  const badge = state ? STATE_BADGES[state] : STATE_BADGES.INSUFFICIENT_DATA;
  const progress = weighted_avg ?? 0;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={[styles.colorPip, { backgroundColor: subjectColor }]} />
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Ionicons name={icon as any} size={20} color={colors.textTertiary} />
      </View>

      <View style={styles.footer}>
        {/* Progress ring */}
        <Svg width={40} height={40}>
          <Circle cx={20} cy={20} r={radius} stroke={colors.border} strokeWidth={3} fill="none" />
          <Circle
            cx={20} cy={20} r={radius}
            stroke={subjectColor}
            strokeWidth={3}
            fill="none"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 20 20)`}
          />
        </Svg>

        {/* State badge */}
        <View style={[styles.badge, { backgroundColor: badge.color + '18' }]}>
          <Text style={[styles.badgeText, { color: badge.color }]}>
            {badge.label}
          </Text>
        </View>
      </View>

      {/* Bottom accent line */}
      <View style={[styles.accentLine, { backgroundColor: subjectColor }]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    width: '48%',
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  colorPip: {
    width: 4,
    height: 20,
    borderRadius: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  accentLine: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 16,
    height: 3,
    borderRadius: 2,
  },
});

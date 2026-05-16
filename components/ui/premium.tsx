// Shared premium UI primitives — glass cards, heroes, labels

import React, { ReactNode } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ViewStyle, TextStyle, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../lib/context';
import { PremiumTokens } from '../../constants/colors';

export function usePremium() {
  const { isDark } = useTheme();
  return isDark ? PremiumTokens.dark : PremiumTokens.light;
}

interface ScreenHeroProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function ScreenHero({ title, subtitle, children }: ScreenHeroProps) {
  const { isDark } = useTheme();
  const premium = usePremium();
  return (
    <LinearGradient
      colors={isDark
        ? [premium.gradientStart, premium.gradientEnd]
        : [premium.gradientStart, premium.gradientEnd]}
      style={heroStyles.wrap}
    >
      <Text style={[heroStyles.title, { color: isDark ? '#F8FAFF' : '#070235' }]}>{title}</Text>
      {subtitle ? (
        <Text style={[heroStyles.sub, { color: isDark ? 'rgba(248,250,255,0.65)' : 'rgba(7,2,53,0.55)' }]}>
          {subtitle}
        </Text>
      ) : null}
      {children}
    </LinearGradient>
  );
}

interface GlassCardProps {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}

export function GlassCard({ children, style, onPress }: GlassCardProps) {
  const { colors } = useTheme();
  const premium = usePremium();
  const inner = (
    <View style={[cardStyles.card, {
      backgroundColor: premium.glassBg,
      borderColor: premium.glassBorder,
      shadowColor: premium.cardShadowColor,
    }, style]}
    >
      {children}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.72} onPress={onPress}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

export function SectionLabel({ text, style }: { text: string; style?: TextStyle }) {
  const { colors } = useTheme();
  return (
    <Text style={[cardStyles.sectionLabel, { color: colors.textTertiary }, style]}>{text}</Text>
  );
}

export function PrimaryButton({
  label, onPress, disabled, icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const { colors, isDark } = useTheme();
  const premium = usePremium();
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[cardStyles.primaryBtn, { opacity: disabled ? 0.45 : 1 }]}
    >
      <LinearGradient
        colors={isDark
          ? [premium.gradientAccentStart, premium.gradientAccentEnd]
          : [colors.primary, colors.primaryContainer]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={cardStyles.primaryGradient}
      >
        {icon}
        <Text style={[cardStyles.primaryText, { color: isDark ? '#0F0E1A' : colors.onPrimary }]}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const heroStyles = StyleSheet.create({
  wrap: {
    paddingTop: Platform.OS === 'ios' ? 68 : 48,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  sub: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    letterSpacing: 0.1,
  },
});

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 8,
    marginTop: 16,
    textTransform: 'uppercase',
  },
  primaryBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 24,
  },
  primaryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

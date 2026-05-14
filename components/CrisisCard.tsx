// Crisis card component — shown when stress is at crisis level

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/context';
import { ICALL_HELPLINE } from '../lib/stressDetection';

export function CrisisCard() {
  const { colors } = useTheme();

  const handleCall = () => {
    Linking.openURL(`tel:${ICALL_HELPLINE}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.errorContainer }]}>
      <View style={styles.header}>
        <Ionicons name="heart" size={22} color={colors.error} />
        <Text style={[styles.title, { color: colors.error }]}>
          We're here for you
        </Text>
      </View>

      <Text style={[styles.message, { color: colors.text }]}>
        You've had a tough few days. It's okay to not be okay. Consider talking 
        to someone you trust — a parent, teacher, or counselor.
      </Text>

      <TouchableOpacity style={[styles.callBtn, { backgroundColor: colors.error }]} onPress={handleCall}>
        <Ionicons name="call" size={18} color="#FFF" />
        <Text style={styles.callText}>
          Call iCall: {ICALL_HELPLINE}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.helpNote, { color: colors.textSecondary }]}>
        iCall is a free, confidential helpline staffed by trained counselors who 
        understand student stress. Available Mon-Sat, 8AM-10PM.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  callText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  helpNote: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});

// Crisis screen — Full screen crisis resources

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ICALL_HELPLINE } from '../../lib/stressDetection';

export default function CrisisScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="heart" size={64} color="#EF4444" style={{ marginBottom: 24 }} />
      <Text style={styles.title}>You are not alone</Text>
      <Text style={styles.message}>
        It is okay to not feel okay. Stress during studies is common, but when it
        becomes overwhelming, talking to someone really helps.
      </Text>

      <TouchableOpacity
        style={styles.callBtn}
        onPress={() => Linking.openURL(`tel:${ICALL_HELPLINE}`)}
      >
        <Ionicons name="call" size={22} color="#FFF" />
        <Text style={styles.callText}>Call iCall: {ICALL_HELPLINE}</Text>
      </TouchableOpacity>

      <Text style={styles.callNote}>
        Free, confidential helpline. Mon-Sat, 8AM-10PM.
        Trained counselors who understand student stress.
      </Text>

      <Text style={styles.otherTitle}>Other things that help:</Text>
      {[
        'Talk to a parent or guardian',
        'Speak to a teacher you trust',
        'Write down what you are feeling',
        'Take a walk outside',
        'Remember: exams are important, but your health comes first',
      ].map((tip, i) => (
        <Text key={i} style={styles.tip}>• {tip}</Text>
      ))}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0F0E1A', padding: 24,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    alignItems: 'center',
  },
  title: { fontSize: 28, fontWeight: '700', color: '#EBF1FF', marginBottom: 16, textAlign: 'center' },
  message: { fontSize: 16, color: '#888', lineHeight: 26, textAlign: 'center', marginBottom: 32 },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#EF4444', paddingHorizontal: 32, paddingVertical: 18,
    borderRadius: 12, marginBottom: 12, width: '100%', justifyContent: 'center',
  },
  callText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  callNote: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  otherTitle: { fontSize: 16, fontWeight: '600', color: '#EBF1FF', marginBottom: 12, alignSelf: 'flex-start' },
  tip: { fontSize: 14, color: '#888', lineHeight: 24, alignSelf: 'flex-start' },
  backBtn: {
    marginTop: 32, paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: 8, borderWidth: 1, borderColor: '#333',
  },
  backText: { color: '#888', fontSize: 15, fontWeight: '500' },
});

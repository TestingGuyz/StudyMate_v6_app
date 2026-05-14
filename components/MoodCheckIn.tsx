// Enhanced Mood check-in — stress + sleep + energy with icons (no emojis)
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../lib/context';
import { writeQuery } from '../lib/neo4j';
import { callGroq } from '../lib/groq';
import { STRESS_SOURCES } from '../constants/subjects';
import { v4 as uuidv4 } from 'uuid';

interface MoodCheckInProps { onComplete: (quote: string) => void; }

const MOOD_OPTIONS = [
  { level: 1, icon: 'happy-outline' as const, label: 'Great', color: '#059669' },
  { level: 2, icon: 'thumbs-up-outline' as const, label: 'Good', color: '#34D399' },
  { level: 3, icon: 'remove-circle-outline' as const, label: 'Okay', color: '#F59E0B' },
  { level: 4, icon: 'sad-outline' as const, label: 'Stressed', color: '#F97316' },
  { level: 5, icon: 'alert-circle-outline' as const, label: 'Overwhelmed', color: '#EF4444' },
];

const SLEEP_OPTIONS = [
  { value: 'great', icon: 'moon-outline' as const, label: '8h+', color: '#059669' },
  { value: 'okay', icon: 'cloudy-night-outline' as const, label: '6-8h', color: '#F59E0B' },
  { value: 'poor', icon: 'thunderstorm-outline' as const, label: '<6h', color: '#EF4444' },
];

const ENERGY_OPTIONS = [
  { value: 'high', icon: 'flash-outline' as const, label: 'High', color: '#059669' },
  { value: 'medium', icon: 'remove-outline' as const, label: 'Medium', color: '#F59E0B' },
  { value: 'low', icon: 'battery-dead-outline' as const, label: 'Low', color: '#EF4444' },
];

export function MoodCheckIn({ onComplete }: MoodCheckInProps) {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [stress, setStress] = useState<number | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [sleep, setSleep] = useState<string | null>(null);
  const [energy, setEnergy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (stress === null || !studentId) return;
    setLoading(true);
    try {
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (m:MoodLog {
           id: $moodId, stress_level: $stress, source: $source, note: $note,
           sleep_quality: $sleep, energy_level: $energy, date: datetime()
         })
         CREATE (s)-[:LOGGED_MOOD]->(m)`,
        { studentId, moodId: uuidv4(), stress, source: source || '', note, sleep: sleep || '', energy: energy || '' }
      );
      let aiQuote = "Remember, every step forward counts.";
      try {
        const sleepCtx = sleep ? ` Sleep: ${sleep}.` : '';
        const energyCtx = energy ? ` Energy: ${energy}.` : '';
        aiQuote = await callGroq([
          { role: 'system', content: 'You are an empathetic study coach. Give ONE short, actionable tip based on the student\'s state. Max 2 sentences. Be warm but practical.' },
          { role: 'user', content: `Stress: ${stress}/5. Cause: ${source || 'general'}.${sleepCtx}${energyCtx}` }
        ], 'mood_quote');
      } catch {}
      onComplete(aiQuote);
    } catch (err) { console.error('Mood log error:', err); }
    finally { setLoading(false); }
  };

  const selectedMood = MOOD_OPTIONS.find(m => m.level === stress);

  return (
    <View style={[st.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
        <Ionicons name="heart-outline" size={18} color={colors.primary} />
        <Text style={[st.label, { color: colors.textTertiary }]}>DAILY WELLNESS CHECK</Text>
      </View>
      <Text style={[st.title, { color: colors.text }]}>How are you feeling?</Text>

      {/* Mood selector with icons */}
      <View style={st.moodRow}>
        {MOOD_OPTIONS.map(m => {
          const isSelected = stress === m.level;
          return (
            <TouchableOpacity key={m.level} onPress={() => setStress(m.level)}
              style={[st.moodBtn, {
                backgroundColor: isSelected ? m.color + '15' : colors.surfaceContainer,
                borderColor: isSelected ? m.color : 'transparent',
                borderWidth: isSelected ? 1.5 : 0,
              }]}>
              <Ionicons name={m.icon} size={22} color={isSelected ? m.color : colors.textTertiary} />
              <Text style={{ fontSize: 9, fontWeight: '600', color: isSelected ? m.color : colors.textTertiary, marginTop: 3 }}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {stress !== null && (
        <>
          {/* Sleep */}
          <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>How did you sleep?</Text>
          <View style={st.optionRow}>
            {SLEEP_OPTIONS.map(s => {
              const isActive = sleep === s.value;
              return (
                <TouchableOpacity key={s.value} onPress={() => setSleep(s.value)}
                  style={[st.optionPill, {
                    backgroundColor: isActive ? s.color + '12' : colors.surfaceContainer,
                    borderColor: isActive ? s.color : colors.border,
                  }]}>
                  <Ionicons name={s.icon} size={16} color={isActive ? s.color : colors.textTertiary} />
                  <Text style={[st.optionLabel, { color: isActive ? s.color : colors.text }]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Energy */}
          <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>Energy level?</Text>
          <View style={st.optionRow}>
            {ENERGY_OPTIONS.map(e => {
              const isActive = energy === e.value;
              return (
                <TouchableOpacity key={e.value} onPress={() => setEnergy(e.value)}
                  style={[st.optionPill, {
                    backgroundColor: isActive ? e.color + '12' : colors.surfaceContainer,
                    borderColor: isActive ? e.color : colors.border,
                  }]}>
                  <Ionicons name={e.icon} size={16} color={isActive ? e.color : colors.textTertiary} />
                  <Text style={[st.optionLabel, { color: isActive ? e.color : colors.text }]}>{e.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Source */}
          <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>What's on your mind?</Text>
          <View style={st.pillRow}>
            {STRESS_SOURCES.map(s => (
              <TouchableOpacity key={s} onPress={() => setSource(s)}
                style={[st.pill, {
                  backgroundColor: source === s ? colors.primary : colors.surfaceContainer,
                  borderColor: source === s ? colors.primary : colors.border,
                }]}>
                <Text style={[st.pillText, { color: source === s ? colors.onPrimary : colors.text }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Note */}
          <TextInput style={[st.noteInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]}
            placeholder="Add a note (optional)" placeholderTextColor={colors.textTertiary} value={note} onChangeText={setNote} multiline />

          {/* Submit */}
          <TouchableOpacity style={[st.submitBtn, { backgroundColor: colors.primary }]} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.onPrimary} /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.onPrimary} />
                <Text style={[st.submitText, { color: colors.onPrimary }]}>Log Wellness Check</Text>
              </View>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { borderRadius: 16, borderWidth: 1, padding: 24, marginBottom: 16 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  moodRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  moodBtn: { width: 54, height: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 13, fontWeight: '500', marginBottom: 10, marginTop: 16 },
  optionRow: { flexDirection: 'row', gap: 10 },
  optionPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
  optionLabel: { fontSize: 13, fontWeight: '600' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  pillText: { fontSize: 13, fontWeight: '500' },
  noteInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 50, marginBottom: 16, textAlignVertical: 'top' },
  submitBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitText: { fontSize: 15, fontWeight: '600' },
});

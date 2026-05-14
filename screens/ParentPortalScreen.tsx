// Parent portal — PIN-verified access + hidden study notes for AI adaptation

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/context';
import { verifyParentAccess, ParentAuthResult } from '../../lib/parentAuth';
import { readQuery, writeQuery } from '../../lib/neo4j';

export default function ParentPortalScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [sid, setSid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<string>('');

  // Parent notes state (hidden from student)
  const [studyNotes, setStudyNotes] = useState('');
  const [weaknessNotes, setWeaknessNotes] = useState('');
  const [notesUpdatedAt, setNotesUpdatedAt] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);

  const handleUnlock = async () => {
    if (!email.trim() || pin.length < 4) {
      Alert.alert('Missing info', 'Enter the student email and parent PIN from their Profile.');
      return;
    }
    setLoading(true);
    try {
      const result: ParentAuthResult = await verifyParentAccess(email, pin);
      if (!result.success) {
        const msgs: Record<string, { title: string; body: string }> = {
          email_not_found: {
            title: 'Student not found',
            body: 'No student account found with this email. Please check the email address.',
          },
          pin_not_set: {
            title: 'Parent access not set up',
            body: 'Parent access has not been set up yet. The student needs to set a parent PIN in their Profile settings.',
          },
          wrong_pin: {
            title: 'Incorrect PIN',
            body: 'The parent PIN is incorrect. Please check the PIN set in the student\'s Profile.',
          },
        };
        const msg = msgs[result.reason] || { title: 'Access denied', body: 'Check email and PIN.' };
        Alert.alert(msg.title, msg.body);
        setLoading(false);
        return;
      }
      setSid(result.studentId);

      // Load stats
      const [quizAgg, sessRow, mood] = await Promise.all([
        readQuery(
          `MATCH (s:Student {id: $sid})-[:ATTEMPTED]->(q:Quiz)
           WHERE q.date > datetime() - duration('P14D')
           RETURN count(q) AS quizzes, avg(toFloat(q.score)/q.total) AS avg`,
          { sid: result.studentId }
        ),
        readQuery(
          `MATCH (s:Student {id: $sid})-[:STUDIED]->(ss:StudySession)
           WHERE ss.date > datetime() - duration('P14D')
           RETURN count(ss) AS sessions`,
          { sid: result.studentId }
        ),
        readQuery(
          `MATCH (s:Student {id: $sid})-[:LOGGED_MOOD]->(m:MoodLog)
           WHERE m.date > datetime() - duration('P7D')
           RETURN avg(toFloat(m.stress_level)) AS ms`,
          { sid: result.studentId }
        ),
      ]);

      const q = quizAgg[0]?.get('quizzes') ?? 0;
      const avg = quizAgg[0]?.get('avg');
      const sess = sessRow[0]?.get('sessions') ?? 0;
      const moodAvg = mood[0]?.get('ms');

      const lines = [
        `Last 14 days — quizzes attempted: ${q}`,
        avg != null ? `Average quiz score: ${Math.round(Number(avg) * 100)}%` : 'No quiz averages yet.',
        `Study sessions logged: ${sess}`,
        moodAvg != null ? `Avg stress (1–5): ${Number(moodAvg).toFixed(1)}` : 'No mood logs this week.',
      ];
      setStats(lines.join('\n'));

      // Load existing parent notes
      try {
        const noteRecs = await readQuery(
          `MATCH (s:Student {id: $sid})
           RETURN s.parent_study_notes AS sn, s.parent_weakness_notes AS wn, s.parent_notes_updated_at AS ua`,
          { sid: result.studentId }
        );
        if (noteRecs.length > 0) {
          setStudyNotes(noteRecs[0].get('sn') || '');
          setWeaknessNotes(noteRecs[0].get('wn') || '');
          const ua = noteRecs[0].get('ua');
          setNotesUpdatedAt(ua ? new Date(ua.toString()).toLocaleDateString() : null);
        }
      } catch { /* ignore */ }
    } catch (e) {
      Alert.alert('Connection error', 'Could not connect. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!sid) return;
    setSavingNotes(true);
    try {
      await writeQuery(
        `MATCH (s:Student {id: $sid})
         SET s.parent_study_notes = $studyNotes,
             s.parent_weakness_notes = $weaknessNotes,
             s.parent_notes_updated_at = datetime()`,
        { sid, studyNotes, weaknessNotes }
      );
      setNotesUpdatedAt(new Date().toLocaleDateString());
      Alert.alert('Saved', 'Your observations have been saved. The AI will silently adapt its teaching approach.');
    } catch {
      Alert.alert('Error', 'Could not save notes. Please try again.');
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Parent view</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        The student sets a parent PIN in Profile &gt; Parent access. This screen shows study signals only — no chat history.
      </Text>

      {!sid ? (
        <>
          <Text style={[styles.lab, { color: colors.textSecondary }]}>Student email</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="student@email.com"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={[styles.lab, { color: colors.textSecondary }]}>Parent PIN</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            secureTextEntry
            keyboardType="number-pad"
            value={pin}
            onChangeText={setPin}
            placeholder="••••"
            placeholderTextColor={colors.textTertiary}
          />
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={() => void handleUnlock()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={[styles.btnText, { color: colors.onPrimary }]}>View summary</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          {/* Stats card */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Ionicons name="stats-chart-outline" size={18} color={colors.primary} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>Study Summary</Text>
            </View>
            <Text style={[styles.stats, { color: colors.text }]}>{stats}</Text>
          </View>

          {/* Parent Observations — hidden from student */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 16 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Ionicons name="eye-off-outline" size={18} color={colors.primary} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>Parent Observations</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginBottom: 16, lineHeight: 18 }}>
              These notes are private and will not be shown to your child. They help the AI silently adapt its teaching style.
            </Text>

            <Text style={[styles.lab, { color: colors.textSecondary, marginTop: 0 }]}>How does your child study?</Text>
            <TextInput
              style={[styles.notesInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              value={studyNotes}
              onChangeText={setStudyNotes}
              placeholder="e.g., Studies only before exams, gets distracted easily, prefers visual learning, needs constant reminders..."
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={[styles.lab, { color: colors.textSecondary }]}>Known weaknesses or concerns</Text>
            <TextInput
              style={[styles.notesInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              value={weaknessNotes}
              onChangeText={setWeaknessNotes}
              placeholder="e.g., Struggles with algebra word problems, avoids Chemistry, gets anxious during timed tests..."
              placeholderTextColor={colors.textTertiary}
            />

            {notesUpdatedAt && (
              <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 8 }}>
                Last updated: {notesUpdatedAt}
              </Text>
            )}

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary, marginTop: 16 }]}
              onPress={handleSaveNotes}
              disabled={savingNotes}
            >
              {savingNotes ? (
                <ActivityIndicator color={colors.onPrimary} size="small" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="save-outline" size={18} color={colors.onPrimary} />
                  <Text style={[styles.btnText, { color: colors.onPrimary }]}>Save Notes</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={{ marginTop: 20, alignSelf: 'center' }} onPress={() => { setSid(null); setStats(''); setStudyNotes(''); setWeaknessNotes(''); }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Sign out</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 14, lineHeight: 22, marginBottom: 20 },
  lab: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16 },
  notesInput: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 14, minHeight: 80, lineHeight: 20 },
  btn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  btnText: { fontWeight: '700', fontSize: 16 },
  card: { borderRadius: 16, borderWidth: 1, padding: 20 },
  stats: { fontSize: 15, lineHeight: 26 },
});

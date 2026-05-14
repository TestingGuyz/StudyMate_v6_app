// PROGRESS DASHBOARD — Gradient header, clean cards
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { getStudentProfile, getSubjectStates, SubjectState } from '../../lib/adaptiveEngine';
import { readQuery } from '../../lib/neo4j';
import { shouldShowBurnoutAlert } from '../../lib/stressDetection';
import { CrisisCard } from '../../components/CrisisCard';
import { ScreenSkeleton } from '../../components/LoadingSkeleton';
import { SubjectColors } from '../../constants/colors';

export default function ProgressScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [studyMins, setStudyMins] = useState(0);
  const [totalQuizzes, setTotalQuizzes] = useState(0);
  const [states, setStates] = useState<SubjectState[]>([]);
  const [moodData, setMoodData] = useState<Array<{ stress: number; day: string }>>([]);
  const [showBurnout, setShowBurnout] = useState(false);
  const [quizHistory, setQuizHistory] = useState<any[]>([]);
  const [answerHistory, setAnswerHistory] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      try {
        const profile = await getStudentProfile(studentId);
        setStreak(profile?.streak || 0);
        const [subStates, studyR, quizR, moodR, quizHistR, ansHistR] = await Promise.all([
          getSubjectStates(studentId),
          readQuery(`MATCH (s:Student {id: $studentId})-[:STUDIED]->(ss:StudySession) WHERE ss.date > datetime() - duration('P7D') RETURN sum(ss.duration_mins) AS total`, { studentId }),
          readQuery(`MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz) RETURN count(q) AS count`, { studentId }),
          readQuery(`MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog) WHERE m.date > datetime() - duration('P7D') RETURN m.stress_level AS stress, m.date AS date ORDER BY m.date ASC`, { studentId }),
          readQuery(`MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz) RETURN q.date AS date, q.subject AS subject, q.chapter AS chapter, q.score AS score, q.total AS total ORDER BY q.date DESC LIMIT 20`, { studentId }),
          readQuery(`MATCH (s:Student {id: $studentId})-[:SUBMITTED]->(a:AnswerSubmission) RETURN a.date AS date, a.subject AS subject, a.marks_obtained AS obtained, a.marks_max AS max ORDER BY a.date DESC LIMIT 10`, { studentId }),
        ]);
        setStates(subStates);
        setStudyMins(studyR[0]?.get('total') || 0);
        setTotalQuizzes(quizR[0]?.get('count') || 0);
        setMoodData(moodR.map(r => ({ stress: r.get('stress') || 0, day: new Date(r.get('date')?.toString() || '').toLocaleDateString('en', { weekday: 'short' }) })));
        setShowBurnout(shouldShowBurnoutAlert(moodR.map(r => ({ stress_level: r.get('stress') || 0, date: r.get('date')?.toString() || '' }))));
        setQuizHistory(quizHistR.map(r => ({ date: new Date(r.get('date')?.toString() || '').toLocaleDateString(), subject: r.get('subject'), chapter: r.get('chapter'), score: r.get('score'), total: r.get('total') })));
        setAnswerHistory(ansHistR.map(r => ({ date: new Date(r.get('date')?.toString() || '').toLocaleDateString(), subject: r.get('subject'), obtained: r.get('obtained'), max: r.get('max') })));
      } catch (err) { console.error('Progress fetch error:', err); }
      finally { setLoading(false); }
    })();
  }, [studentId]);

  if (loading) return <ScreenSkeleton />;

  return (
    <ScrollView style={[st.container, { backgroundColor: colors.background }]} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={isDark ? ['#1E1B4B', '#0F0E1A'] : ['#E0E7FF', '#F9F9FF']} style={st.hero}>
        <Text style={[st.title, { color: isDark ? '#FFF' : '#070235' }]}>Progress</Text>
        <View style={st.statsRow}>
          {[{ icon: 'flame-outline', value: `${streak}`, label: 'Streak' },
            { icon: 'time-outline', value: `${Math.floor(studyMins / 60)}h ${studyMins % 60}m`, label: 'This Week' },
            { icon: 'checkmark-done-outline', value: `${totalQuizzes}`, label: 'Quizzes' },
          ].map(s => (
            <View key={s.label} style={[st.stat, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(7,2,53,0.04)' }]}>
              <Ionicons name={s.icon as any} size={14} color={isDark ? '#C4C1FB' : '#070235'} />
              <Text style={[st.statValue, { color: isDark ? '#FFF' : '#070235' }]}>{s.value}</Text>
              <Text style={[st.statLabel, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(7,2,53,0.5)' }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <View style={st.body}>
        {showBurnout && <CrisisCard />}

        {/* Mood chart */}
        {moodData.length > 0 && (
          <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[st.cardTitle, { color: colors.text }]}>Mood — Last 7 Days</Text>
            <View style={st.moodChart}>
              {moodData.map((m, i) => {
                const height = Math.max((m.stress / 5) * 60, 8);
                const barColor = m.stress <= 2 ? '#059669' : m.stress === 3 ? '#F59E0B' : '#EF4444';
                return (
                  <View key={i} style={st.moodBar}>
                    <View style={[st.moodBarFill, { height, backgroundColor: barColor }]} />
                    <Text style={[st.moodLabel, { color: colors.textTertiary }]}>{m.day}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Subject performance */}
        <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[st.cardTitle, { color: colors.text }]}>Subject Performance</Text>
          {states.map(s => {
            const barWidth = `${Math.max(s.weighted_avg, 5)}%`;
            const subColor = isDark ? SubjectColors[s.subject]?.dark || colors.primary : SubjectColors[s.subject]?.light || colors.primary;
            const isWeak = s.state === 'EMPIRICALLY_WEAK' || s.state === 'AVOIDED_AND_WEAK';
            return (
              <View key={s.subject} style={st.perfRow}>
                <Text style={[st.perfSubject, { color: colors.text }]} numberOfLines={1}>{s.subject}</Text>
                <View style={[st.perfBarBg, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <View style={[st.perfBar, { width: barWidth as any, backgroundColor: subColor }]} />
                </View>
                <Text style={[st.perfPct, { color: colors.textSecondary }]}>{s.weighted_avg}%</Text>
                {isWeak && <View style={st.weakBadge}><Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '600' }}>Weak</Text></View>}
              </View>
            );
          })}
        </View>

        {/* Quiz history */}
        {quizHistory.length > 0 && (
          <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[st.cardTitle, { color: colors.text }]}>Quiz History</Text>
            {quizHistory.map((q, i) => (
              <View key={i} style={[st.histRow, { borderBottomColor: colors.border }]}>
                <Text style={[st.histDate, { color: colors.textTertiary }]}>{q.date}</Text>
                <Text style={[st.histSubject, { color: colors.text }]} numberOfLines={1}>{q.subject}</Text>
                <Text style={[st.histScore, { color: colors.text }]}>{q.score}/{q.total}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Answer grading history */}
        {answerHistory.length > 0 && (
          <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[st.cardTitle, { color: colors.text }]}>Answer Grading History</Text>
            {answerHistory.map((a, i) => (
              <View key={i} style={[st.histRow, { borderBottomColor: colors.border }]}>
                <Text style={[st.histDate, { color: colors.textTertiary }]}>{a.date}</Text>
                <Text style={[st.histSubject, { color: colors.text }]} numberOfLines={1}>{a.subject}</Text>
                <Text style={[st.histScore, { color: colors.text }]}>{a.obtained}/{a.max}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 32 },
  hero: { paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingBottom: 20, paddingHorizontal: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 16, letterSpacing: -0.5 },
  statsRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, padding: 14, borderRadius: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  body: { padding: 20 },
  card: { borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 16 },
  moodChart: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 80 },
  moodBar: { alignItems: 'center', gap: 4 },
  moodBarFill: { width: 24, borderRadius: 6 },
  moodLabel: { fontSize: 10, fontWeight: '500' },
  perfRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  perfSubject: { width: 90, fontSize: 13, fontWeight: '600' },
  perfBarBg: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  perfBar: { height: 8, borderRadius: 4 },
  perfPct: { width: 36, textAlign: 'right', fontSize: 12, fontWeight: '600' },
  weakBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#EF444418' },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, gap: 8 },
  histDate: { width: 70, fontSize: 11, fontWeight: '500' },
  histSubject: { flex: 1, fontSize: 13 },
  histScore: { fontSize: 14, fontWeight: '700' },
});

// LEARN SCREEN — Subject grid with gradient header
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, useAuth } from '../../lib/context';
import { getSubjectStates, SubjectState } from '../../lib/adaptiveEngine';
import { SUBJECTS } from '../../constants/subjects';
import { SubjectCard } from '../../components/SubjectCard';
import { ScreenSkeleton } from '../../components/LoadingSkeleton';

export default function LearnScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [states, setStates] = useState<SubjectState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      try { setStates(await getSubjectStates(studentId)); }
      catch (err) { console.error('Failed to load subject states:', err); }
      finally { setLoading(false); }
    })();
  }, [studentId]);

  if (loading) return <ScreenSkeleton />;

  const getSubjectState = (name: string) => states.find(s => s.subject === name);

  return (
    <ScrollView style={[st.container, { backgroundColor: colors.background }]} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={isDark ? ['#1E1B4B', '#0F0E1A'] : ['#E0E7FF', '#F9F9FF']} style={st.hero}>
        <Text style={[st.title, { color: isDark ? '#FFF' : '#070235' }]}>Subjects</Text>
        <Text style={[st.subtitle, { color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(7,2,53,0.5)' }]}>Your current focus areas</Text>
      </LinearGradient>
      <View style={st.grid}>
        {SUBJECTS.map(subject => {
          const state = getSubjectState(subject.name);
          return (
            <SubjectCard key={subject.name} name={subject.name} icon={subject.icon} state={state?.state} weighted_avg={state?.weighted_avg}
              onPress={() => router.push({ pathname: '/screens/ChapterDetailScreen', params: { subject: subject.name } })} />
          );
        })}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 32 },
  hero: { paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingBottom: 28, paddingHorizontal: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 4, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: 20 },
});

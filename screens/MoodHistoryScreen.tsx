// Mood History — Weekly trends, AI insights, mood-performance correlation
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, useAuth } from '../../lib/context';
import { readQuery } from '../../lib/neo4j';
import { callGroq } from '../../lib/groq';

export default function MoodHistoryScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [moods, setMoods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [avgStress, setAvgStress] = useState(0);
  const [topSource, setTopSource] = useState('');
  const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable');
  const [aiInsight, setAiInsight] = useState('');
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [sleepStats, setSleepStats] = useState({ great: 0, okay: 0, poor: 0 });

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      try {
        const res = await readQuery(
          `MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog)
           RETURN m.stress_level AS stress, m.source AS source, m.note AS note, m.date AS date,
                  m.sleep_quality AS sleep, m.energy_level AS energy
           ORDER BY m.date DESC LIMIT 14`,
          { studentId }
        );
        const parsed = res.map(r => ({
          stress: r.get('stress') || 0,
          source: r.get('source') || '',
          note: r.get('note') || '',
          sleep: r.get('sleep') || '',
          energy: r.get('energy') || '',
          date: new Date(r.get('date')).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        }));
        setMoods(parsed);

        // Compute stats
        if (parsed.length > 0) {
          const avg = parsed.reduce((a, m) => a + m.stress, 0) / parsed.length;
          setAvgStress(Math.round(avg * 10) / 10);

          // Top source
          const sources: Record<string, number> = {};
          parsed.forEach(m => { if (m.source) sources[m.source] = (sources[m.source] || 0) + 1; });
          const top = Object.entries(sources).sort((a, b) => b[1] - a[1])[0];
          setTopSource(top ? top[0] : 'General');

          // Trend
          if (parsed.length >= 4) {
            const recent = parsed.slice(0, Math.floor(parsed.length / 2)).reduce((a, m) => a + m.stress, 0) / Math.floor(parsed.length / 2);
            const older = parsed.slice(Math.floor(parsed.length / 2)).reduce((a, m) => a + m.stress, 0) / (parsed.length - Math.floor(parsed.length / 2));
            if (recent > older + 0.4) setTrend('up');
            else if (recent < older - 0.4) setTrend('down');
            else setTrend('stable');
          }

          // Sleep stats
          const sleepCount = { great: 0, okay: 0, poor: 0 };
          parsed.forEach(m => { if (m.sleep === 'great') sleepCount.great++; else if (m.sleep === 'poor') sleepCount.poor++; else if (m.sleep === 'okay') sleepCount.okay++; });
          setSleepStats(sleepCount);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [studentId]);

  const generateInsight = async () => {
    if (moods.length === 0 || !studentId) return;
    setLoadingInsight(true);
    try {
      const summary = moods.slice(0, 7).map(m => `Stress:${m.stress}/5, Source:${m.source || 'none'}, Sleep:${m.sleep || '?'}, Energy:${m.energy || '?'}`).join('; ');
      const result = await callGroq([
        { role: 'system', content: 'You are a student wellness advisor. Analyze mood data and give 3-4 practical, evidence-based wellness tips. Be specific and actionable. Max 100 words. Use bullet points.' },
        { role: 'user', content: `Recent mood data (newest first): ${summary}. Avg stress: ${avgStress}/5. Main stressor: ${topSource}. Trend: stress is ${trend === 'up' ? 'increasing' : trend === 'down' ? 'decreasing' : 'stable'}.` }
      ], 'wellness_insight');
      setAiInsight(result);
    } catch { setAiInsight('Could not generate insight. Try again later.'); }
    finally { setLoadingInsight(false); }
  };

  const getMoodIcon = (level: number): { name: string; color: string } => {
    if (level <= 1) return { name: 'happy-outline', color: '#059669' };
    if (level === 2) return { name: 'thumbs-up-outline', color: '#34D399' };
    if (level === 3) return { name: 'remove-circle-outline', color: '#F59E0B' };
    if (level === 4) return { name: 'sad-outline', color: '#F97316' };
    return { name: 'alert-circle-outline', color: '#EF4444' };
  };
  const trendIcon = trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'remove';
  const trendColor = trend === 'up' ? '#EF4444' : trend === 'down' ? '#059669' : '#F59E0B';

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient colors={isDark ? ['#1E1B4B', '#0F0E1A'] : ['#E0E7FF', '#F9F9FF']} style={st.hero}>
        <View style={st.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={24} color={isDark ? '#FFF' : '#070235'} />
          </TouchableOpacity>
          <Text style={[st.heroTitle, { color: isDark ? '#FFF' : '#070235' }]}>Wellness Analytics</Text>
          <View style={{ width: 32 }} />
        </View>
        <Text style={[st.heroSub, { color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(7,2,53,0.5)' }]}>
          Track your emotional patterns and get personalized insights
        </Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : moods.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Ionicons name="heart-outline" size={48} color={colors.textTertiary} />
            <Text style={{ color: colors.textTertiary, marginTop: 16, fontSize: 15, textAlign: 'center' }}>No mood logs yet. Check in from the dashboard!</Text>
          </View>
        ) : (
          <>
            {/* Summary Cards */}
            <View style={st.summaryRow}>
              <View style={[st.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>{avgStress}</Text>
                <Text style={[st.summaryLabel, { color: colors.textTertiary }]}>Avg Stress</Text>
              </View>
              <View style={[st.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name={trendIcon as any} size={28} color={trendColor} />
                <Text style={[st.summaryLabel, { color: colors.textTertiary }]}>{trend === 'up' ? 'Rising' : trend === 'down' ? 'Improving' : 'Stable'}</Text>
              </View>
              <View style={[st.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }} numberOfLines={1}>{topSource || '—'}</Text>
                <Text style={[st.summaryLabel, { color: colors.textTertiary }]}>Top Cause</Text>
              </View>
            </View>

            {/* Mood Chart */}
            <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[st.cardTitle, { color: colors.text }]}>Stress Trend</Text>
              <View style={st.chart}>
                {moods.slice(0, 7).reverse().map((m, i) => {
                  const height = Math.max((m.stress / 5) * 60, 8);
                  const barColor = m.stress <= 2 ? '#059669' : m.stress === 3 ? '#F59E0B' : '#EF4444';
                  return (
                    <View key={i} style={st.chartBar}>
                      <View style={[st.chartBarFill, { height, backgroundColor: barColor }]} />
                      <Text style={[st.chartLabel, { color: colors.textTertiary }]}>{m.date.split(' ')[0]}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Sleep Summary */}
            {(sleepStats.great + sleepStats.okay + sleepStats.poor) > 0 && (
              <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[st.cardTitle, { color: colors.text }]}>Sleep Pattern</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                {[{ label: '8h+', count: sleepStats.great, color: '#059669', icon: 'moon-outline' as const },
                    { label: '6-8h', count: sleepStats.okay, color: '#F59E0B', icon: 'cloudy-night-outline' as const },
                    { label: '<6h', count: sleepStats.poor, color: '#EF4444', icon: 'thunderstorm-outline' as const }
                  ].map(s => (
                    <View key={s.label} style={{ flex: 1, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: s.color + '10' }}>
                      <Ionicons name={s.icon} size={22} color={s.color} />
                      <Text style={{ fontSize: 20, fontWeight: '800', color: s.color, marginTop: 4 }}>{s.count}</Text>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '600' }}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* AI Insight */}
            <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Ionicons name="sparkles" size={18} color={colors.primary} />
                <Text style={[st.cardTitle, { color: colors.text, marginBottom: 0 }]}>AI Wellness Insight</Text>
              </View>
              {aiInsight ? (
                <Text style={{ fontSize: 14, lineHeight: 22, color: colors.textSecondary }}>{aiInsight}</Text>
              ) : (
                <TouchableOpacity style={{ backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 10, alignItems: 'center' }} onPress={generateInsight} disabled={loadingInsight}>
                  {loadingInsight ? <ActivityIndicator color={colors.onPrimary} size="small" /> : (
                    <Text style={{ color: colors.onPrimary, fontWeight: '600', fontSize: 14 }}>Generate Personalized Tips</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Actions */}
            <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[st.cardTitle, { color: colors.text }]}>Quick Wellness Tools</Text>
              <TouchableOpacity style={[st.toolRow, { borderBottomColor: colors.border }]} onPress={() => router.push('/screens/FocusTimerScreen')}>
                <View style={[st.toolIcon, { backgroundColor: '#2DD4BF18' }]}>
                  <Ionicons name="timer-outline" size={20} color="#2DD4BF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>Focus Timer</Text>
                  <Text style={{ fontSize: 12, color: colors.textTertiary }}>Pomodoro sessions with breaks</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity style={st.toolRow} onPress={() => router.push('/screens/VoiceModeScreen')}>
                <View style={[st.toolIcon, { backgroundColor: '#818CF818' }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={20} color="#818CF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>Talk to AI Coach</Text>
                  <Text style={{ fontSize: 12, color: colors.textTertiary }}>Voice-based support and guidance</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* History */}
            <Text style={[st.cardTitle, { color: colors.text, paddingHorizontal: 4, marginTop: 8 }]}>Recent Logs</Text>
            {moods.map((m, i) => (
              <View key={i} style={[st.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={st.logHeader}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: getMoodIcon(m.stress).color + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={getMoodIcon(m.stress).name as any} size={22} color={getMoodIcon(m.stress).color} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary, letterSpacing: 1 }}>{m.date.toUpperCase()}</Text>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{m.source || 'General Check-in'}</Text>
                    {m.sleep ? <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>Sleep: {m.sleep} · Energy: {m.energy || '—'}</Text> : null}
                  </View>
                  <View style={[st.levelBadge, { backgroundColor: m.stress > 3 ? '#FEF2F2' : '#F0FDF4' }]}>
                    <Text style={{ color: m.stress > 3 ? '#EF4444' : '#059669', fontSize: 12, fontWeight: '700' }}>{m.stress}/5</Text>
                  </View>
                </View>
                {m.note ? <Text style={[st.logNote, { color: colors.textSecondary, backgroundColor: colors.surfaceContainerLow }]}>"{m.note}"</Text> : null}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  hero: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 24, paddingHorizontal: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  heroTitle: { fontSize: 20, fontWeight: '700' },
  heroSub: { fontSize: 13, lineHeight: 20 },
  content: { padding: 20, paddingBottom: 40 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: { flex: 1, padding: 16, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontSize: 10, fontWeight: '600', marginTop: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
  card: { borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  chart: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 80 },
  chartBar: { alignItems: 'center', gap: 4 },
  chartBarFill: { width: 24, borderRadius: 6 },
  chartLabel: { fontSize: 10, fontWeight: '500' },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  toolIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 10 },
  logHeader: { flexDirection: 'row', alignItems: 'center' },
  levelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  logNote: { marginTop: 12, padding: 12, borderRadius: 8, fontStyle: 'italic', fontSize: 13, lineHeight: 20 },
});

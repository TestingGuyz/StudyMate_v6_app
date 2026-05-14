// Spaced-style review — surfaces incorrect diagnostic items by chapter

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { readQuery, writeQuery } from '../../lib/neo4j';
import { v4 as uuidv4 } from 'uuid';

interface ReviewItem {
  subject: string;
  chapter: string;
  snippet: string;
  explanation: string;
}

export default function ReviewDeckScreen() {
  const { colors } = useTheme();
  const { studentId } = useAuth();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [idx, setIdx] = useState(0);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const recs = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:TOOK_DIAGNOSTIC]->(:DiagnosticRun)-[:HAS_ATTEMPT]->(a:DiagnosticAttempt)
         WHERE a.is_correct = false
         RETURN DISTINCT a.subject AS subject, a.chapter AS chapter,
                collect(a.question_text)[0] AS snippet,
                collect(a.explanation)[0] AS explanation
         LIMIT 24`,
        { studentId }
      );

      const parsed: ReviewItem[] = recs.map(r => ({
        subject: String(r.get('subject') ?? ''),
        chapter: String(r.get('chapter') ?? ''),
        snippet: String(r.get('snippet') ?? '').slice(0, 320),
        explanation: String(r.get('explanation') ?? '').slice(0, 600),
      }));

      setItems(parsed);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const logReview = async (item: ReviewItem) => {
    if (!studentId) return;
    try {
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (rv:ReviewSession {
           id: $id,
           subject: $subject,
           chapter: $chapter,
           reviewed_at: datetime(),
           source: 'review_deck'
         })
         CREATE (s)-[:COMPLETED_REVIEW]->(rv)`,
        {
          studentId,
          id: uuidv4(),
          subject: item.subject,
          chapter: item.chapter,
        }
      );
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const cur = items[idx];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Review deck</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Pulled from diagnostic mistakes — revisit weak chapters in short bursts (classic spaced repetition pattern).
      </Text>

      {!items.length ? (
        <View style={[styles.empty, { borderColor: colors.border }]}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center', lineHeight: 22 }}>
            No incorrect diagnostic attempts on file yet. Take the diagnostic from Profile, then come back here.
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.counter, { color: colors.textTertiary }]}>
            Card {idx + 1} / {items.length}
          </Text>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.meta, { color: colors.primary }]}>
              {cur.subject} • {cur.chapter}
            </Text>
            <Text style={[styles.q, { color: colors.text }]}>{cur.snippet || 'Review this chapter concept.'}</Text>
            <TouchableOpacity
              style={[styles.reveal, { backgroundColor: colors.primaryContainer }]}
              onPress={() =>
                setExpanded(prev => {
                  const next = { ...prev, [idx]: !prev[idx] };
                  return next;
                })
              }
            >
              <Text style={{ color: colors.onPrimaryContainer, fontWeight: '700' }}>
                {expanded[idx] ? 'Hide recap' : 'Show recap'}
              </Text>
            </TouchableOpacity>
            {expanded[idx] ? (
              <Text style={[styles.exp, { color: colors.textSecondary }]}>{cur.explanation}</Text>
            ) : null}
          </View>

          <View style={styles.nav}>
            <TouchableOpacity
              style={[styles.navBtn, { borderColor: colors.border }]}
              disabled={idx <= 0}
              onPress={() => setIdx(i => Math.max(0, i - 1))}
            >
              <Text style={{ color: idx <= 0 ? colors.textTertiary : colors.text }}>Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                void logReview(cur);
                if (idx < items.length - 1) setIdx(i => i + 1);
                else router.back();
              }}
            >
              <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>
                {idx < items.length - 1 ? 'Got it — next' : 'Finish'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 14, lineHeight: 22, marginBottom: 20 },
  counter: { fontSize: 13, marginBottom: 10, fontWeight: '600' },
  card: { borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 20 },
  meta: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 12 },
  q: { fontSize: 17, lineHeight: 26, fontWeight: '600' },
  reveal: { marginTop: 16, padding: 12, borderRadius: 10, alignItems: 'center' },
  exp: { marginTop: 14, fontSize: 15, lineHeight: 24 },
  nav: { flexDirection: 'row', gap: 12 },
  navBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  empty: { padding: 24, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed' },
});

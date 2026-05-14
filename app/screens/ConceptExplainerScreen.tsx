// CONCEPT EXPLAINER — Feature #19
// Student types any concept, AI explains with structure

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext, getStudentProfile } from '../../lib/adaptiveEngine';
import { callGroq } from '../../lib/groq';
import { writeQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { v4 as uuidv4 } from 'uuid';
import { MarkdownView } from '../../components/MarkdownView';

export default function ConceptExplainerScreen() {
  const { colors } = useTheme();
  const { studentId } = useAuth();
  const [subject, setSubject] = useState('');
  const [concept, setConcept] = useState('');
  const [explanation, setExplanation] = useState('');
  const [practiceQuestions, setPracticeQuestions] = useState('');
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) { setBoard(profile.board); setClassNum(profile.class); }
    })();
  }, [studentId]);

  const handleExplain = async () => {
    if (!concept.trim() || !studentId) return;
    setLoading(true);
    setExplanation('');
    setPracticeQuestions('');
    try {
      const context = await buildStudentContext(studentId);
      const result = await callGroq(
        [
          { role: 'system', content: `You are an expert ${board} tutor for Class ${classNum}. ${context}` },
          {
            role: 'user',
            content: `Explain the concept "${concept}" for ${subject || 'General'}, ${board} Class ${classNum}.

Format exactly as:
WHAT IS IT:
(Simple, age-appropriate definition in 2-3 sentences)

HOW IT WORKS:
(Step-by-step mechanism or process, numbered)

REAL-LIFE EXAMPLE (INDIA):
(One relatable Indian context example)

KEY FORMULA / RULE:
(The core formula or rule to memorize, if applicable)

COMMON EXAM MISTAKES:
(2-3 mistakes students make in board exams)

---
PRACTICE QUESTIONS:
1. (Application-based question)
2. (Conceptual question)
3. (Tricky board-style question)

Be concise. Reference the student's weak areas if this concept connects to them.`,
          },
        ],
        'concept_explainer'
      );

      // Split explanation and practice questions
      const parts = result.split('PRACTICE QUESTIONS:');
      setExplanation(parts[0]?.trim() || result);
      setPracticeQuestions(parts[1]?.trim() || '');

      // Log study session
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (ss:StudySession {
           id: $id, subject: $subject, chapter: $concept,
           duration_mins: 5, session_type: 'concept_explainer', date: datetime()
         })
         CREATE (s)-[:STUDIED]->(ss)`,
        { studentId, id: uuidv4(), subject: subject || 'General', concept }
      );
    } catch (err: any) {
      setExplanation(err.message || 'Failed to explain concept');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Concept Explainer</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Type any concept and get a structured explanation with practice questions
      </Text>

      {/* Subject selector */}
      <Text style={[styles.label, { color: colors.textSecondary }]}>SUBJECT (OPTIONAL)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {SUBJECTS.map(s => (
            <TouchableOpacity
              key={s.name}
              style={[styles.pill, {
                backgroundColor: subject === s.name ? colors.primary : colors.surface,
                borderColor: subject === s.name ? colors.primary : colors.border,
              }]}
              onPress={() => setSubject(subject === s.name ? '' : s.name)}
            >
              <Text style={{ color: subject === s.name ? colors.onPrimary : colors.text, fontSize: 13 }}>
                {s.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Concept input */}
      <View style={[styles.inputArea, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          style={[styles.conceptInput, { color: colors.text }]}
          placeholder='e.g. "Photosynthesis", "Quadratic Equations", "Mughal Architecture"'
          placeholderTextColor={colors.textTertiary}
          value={concept}
          onChangeText={setConcept}
          multiline
        />
        <TouchableOpacity
          style={[styles.explainBtn, { backgroundColor: concept.trim() ? colors.primary : colors.surfaceContainerHigh }]}
          onPress={handleExplain}
          disabled={loading || !concept.trim()}
        >
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color={concept.trim() ? colors.onPrimary : colors.textTertiary} />
              <Text style={[styles.explainText, { color: concept.trim() ? colors.onPrimary : colors.textTertiary }]}>
                Explain
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Explanation */}
      {explanation ? (
        <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.resultHeader}>
            <Ionicons name="bulb" size={18} color={colors.primary} />
            <Text style={[styles.resultTitle, { color: colors.primary }]}>Explanation</Text>
          </View>
          <MarkdownView content={explanation} />
        </View>
      ) : null}

      {/* Practice Questions */}
      {practiceQuestions ? (
        <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: '#8B5CF6', borderLeftWidth: 3 }]}>
          <View style={styles.resultHeader}>
            <Ionicons name="help-circle" size={18} color="#8B5CF6" />
            <Text style={[styles.resultTitle, { color: '#8B5CF6' }]}>Practice Questions</Text>
          </View>
          <MarkdownView content={practiceQuestions} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 14, marginBottom: 24, lineHeight: 22 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 10 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  inputArea: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 20 },
  conceptInput: { minHeight: 60, fontSize: 15, lineHeight: 22, marginBottom: 12 },
  explainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 8,
  },
  explainText: { fontSize: 14, fontWeight: '600' },
  resultCard: { borderRadius: 12, borderWidth: 1, padding: 20, marginBottom: 16 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  resultTitle: { fontSize: 14, fontWeight: '600' },
  resultText: { fontSize: 14, lineHeight: 24 },
});

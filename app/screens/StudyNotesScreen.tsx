// STUDY NOTES — Generate revision notes with Groq

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext, getStudentProfile } from '../../lib/adaptiveEngine';
import { callGroq } from '../../lib/groq';
import { writeQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { getChaptersForSubject } from '../../constants/chapters';
import { v4 as uuidv4 } from 'uuid';

export default function StudyNotesScreen() {
  const { colors } = useTheme();
  const { studentId } = useAuth();
  const [subject, setSubject] = useState('');
  const [chapter, setChapter] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [chapters, setChapters] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) { setBoard(profile.board); setClassNum(profile.class); }
    })();
  }, [studentId]);

  useEffect(() => {
    if (subject) setChapters(getChaptersForSubject(subject, board, classNum));
  }, [subject, board, classNum]);

  const handleGenerate = async () => {
    if (!subject || !chapter || !studentId) return;
    setLoading(true);
    setNotes('');
    try {
      const context = await buildStudentContext(studentId);
      const result = await callGroq(
        [
          { role: 'system', content: `You are an expert ${board} tutor. ${context}` },
          {
            role: 'user',
            content: `Generate concise exam revision notes for "${chapter}" in ${subject}, ${board} Class ${classNum}.

Format exactly as:
KEY CONCEPTS:
(5-8 bullet points, each under 20 words)

IMPORTANT FORMULAS / FACTS / DATES:
(list format, each on own line)

EXAMINER FAVOURITES:
(3 most commonly asked question types with brief answer approach)

MEMORY AIDS:
(1-2 mnemonics or memory tricks)

CONNECTION TO YOUR WEAK AREAS:
(based on this student's profile, highlight connections if any exist — skip if none)

Max 400 words total. Dense. No filler.`,
          },
        ],
        'notes_generator'
      );
      setNotes(result);

      // Log study session
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (ss:StudySession {
           id: $id, subject: $subject, chapter: $chapter,
           duration_mins: 10, session_type: 'notes_review', date: datetime()
         })
         CREATE (s)-[:STUDIED]->(ss)`,
        { studentId, id: uuidv4(), subject, chapter }
      );
    } catch (err: any) {
      setNotes(err.message || 'Failed to generate notes');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(notes);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        <Text style={[styles.title, { color: colors.text }]}>Study Notes</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Subject */}
      <Text style={[styles.label, { color: colors.textSecondary }]}>SELECT SUBJECT</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {SUBJECTS.map(s => (
            <TouchableOpacity
              key={s.name}
              style={[styles.pill, {
                backgroundColor: subject === s.name ? colors.primary : colors.surface,
                borderColor: subject === s.name ? colors.primary : colors.border,
              }]}
              onPress={() => setSubject(s.name)}
            >
              <Text style={{ color: subject === s.name ? colors.onPrimary : colors.text, fontSize: 13 }}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Chapter */}
      {subject && (
        <>
          <Text style={[styles.label, { color: colors.textSecondary }]}>SELECT CHAPTER</Text>
          <ScrollView style={[styles.chapterList, { borderColor: colors.border }]}>
            {chapters.map(ch => (
              <TouchableOpacity
                key={ch}
                style={[styles.chapterItem, {
                  backgroundColor: chapter === ch ? colors.primaryContainer : 'transparent',
                  borderBottomColor: colors.border,
                }]}
                onPress={() => setChapter(ch)}
              >
                <Text style={{ color: chapter === ch ? colors.onPrimaryContainer : colors.text, fontSize: 14 }}>{ch}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {/* Generate */}
      <TouchableOpacity
        style={[styles.generateBtn, { backgroundColor: subject && chapter ? colors.primary : colors.surfaceContainerHigh }]}
        onPress={handleGenerate}
        disabled={!subject || !chapter || loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <>
            <Ionicons name="sparkles" size={18} color={subject && chapter ? colors.onPrimary : colors.textTertiary} />
            <Text style={[styles.generateText, { color: subject && chapter ? colors.onPrimary : colors.textTertiary }]}>
              Generate Notes
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Notes display */}
      {notes ? (
        <View style={[styles.notesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.notesHeader}>
            <Text style={[styles.notesTitle, { color: colors.text }]}>
              {chapter}
            </Text>
            <View style={styles.notesActions}>
              <TouchableOpacity onPress={handleCopy} style={styles.actionBtn}>
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[styles.notesText, { color: colors.text }]}>{notes}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '700' },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 10, marginTop: 16 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  chapterList: { maxHeight: 180, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  chapterItem: { padding: 14, borderBottomWidth: 1 },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 8, marginTop: 20,
  },
  generateText: { fontSize: 15, fontWeight: '600' },
  notesCard: { borderRadius: 12, borderWidth: 1, padding: 20, marginTop: 20 },
  notesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  notesTitle: { fontSize: 16, fontWeight: '600', flex: 1 },
  notesActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 6 },
  notesText: { fontSize: 14, lineHeight: 24, whiteSpace: 'pre-wrap' } as any,
});

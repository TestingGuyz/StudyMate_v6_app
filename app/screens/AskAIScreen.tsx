// Ask AI — hints first, then simplified explanations; web sources + uploads; Neo4j logging

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext, getStudentProfile } from '../../lib/adaptiveEngine';
import { callGroq, callGroqVision } from '../../lib/groq';
import { writeQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { getChaptersForSubject } from '../../constants/chapters';
import { v4 as uuidv4 } from 'uuid';
import { searchStudyReferences, formatSnippetsForPrompt } from '../../lib/webSearch';
import { MarkdownView } from '../../components/MarkdownView';

type Tab = 'type' | 'photograph' | 'resources';

export default function AskAIScreen() {
  const { colors } = useTheme();
  const { studentId } = useAuth();
  const [tab, setTab] = useState<Tab>('type');
  const [subject, setSubject] = useState('');
  const [chapter, setChapter] = useState('');
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [chapters, setChapters] = useState<string[]>([]);
  const [followUp, setFollowUp] = useState('');
  /** 0 = hints only, 1 = full explanation allowed */
  const [helpTier, setHelpTier] = useState<0 | 1>(0);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);
  const [uploadExcerpt, setUploadExcerpt] = useState('');
  const [searchNotes, setSearchNotes] = useState('');
  /** ELI5 — simpler wording + analogies */
  const [eli5, setEli5] = useState(false);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) {
        setBoard(profile.board);
        setClassNum(profile.class);
      }
    })();
  }, [studentId]);

  useEffect(() => {
    if (subject) {
      setChapters(getChaptersForSubject(subject, board, classNum));
    }
  }, [subject, board, classNum]);

  const resetTurn = () => {
    setResponse('');
    setHelpTier(0);
    setFollowUp('');
  };

  const persistDoubt = async (payload: {
    hint_text?: string;
    explain_text?: string;
    sources_json?: string;
    uploaded_excerpt?: string;
    vision?: boolean;
  }) => {
    if (!studentId) return;
    try {
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (ds:DoubtSession {
           id: $id,
           subject: $subject,
           chapter: $chapter,
           board: $board,
           class: $class,
           question_preview: $preview,
           hint_text: $hint_text,
           explain_text: $explain_text,
           sources_json: $sources_json,
           uploaded_excerpt: $uploaded_excerpt,
           used_vision: $used_vision,
           date: datetime()
         })
         CREATE (s)-[:LOGGED_DOUBT]->(ds)`,
        {
          studentId,
          id: uuidv4(),
          subject: subject || 'General',
          chapter: chapter || '',
          board,
          class: classNum,
          preview: question.slice(0, 280),
          hint_text: payload.hint_text || '',
          explain_text: payload.explain_text || '',
          sources_json: payload.sources_json || '',
          uploaded_excerpt: (payload.uploaded_excerpt || uploadExcerpt).slice(0, 4000),
          used_vision: !!payload.vision,
        }
      );
    } catch (e) {
      console.warn('Doubt log failed', e);
    }
  };

  const gatherSources = async (): Promise<string> => {
    const q = `${board} Class ${classNum} ${subject} ${chapter} ${question} ICSE CBSE textbook`;
    try {
      const snippets = await searchStudyReferences(q);
      const formatted = formatSnippetsForPrompt(snippets);
      setSearchNotes(formatted);
      return formatted;
    } catch {
      setSearchNotes('');
      return '';
    }
  };

  const handleSubmitText = async () => {
    if (!question.trim() || !studentId) return;
    setLoading(true);
    resetTurn();
    try {
      const context = await buildStudentContext(studentId);
      const sources = await gatherSources();
      const resourceBlock =
        uploadExcerpt.trim().length > 0
          ? `\n\nSTUDENT UPLOAD EXCERPT (their material — stay consistent with it):\n${uploadExcerpt.slice(0, 6000)}`
          : '';

      const hintPrompt = `${context}

REFERENCE RESULTS (titles/snippets from web search — use for syllabus alignment, do not copy verbatim):
${sources || '(none)'}

BOARD: ${board}, CLASS: ${classNum}. Subject: ${subject || 'General'}, Chapter: ${chapter || 'any'}.
${resourceBlock}

TASK — HINT LEVEL ONLY:
- Do NOT give the final numeric answer or fully worked solution.
- Offer guiding questions, strategy, and at most a partial setup.
- If multiple choice, do NOT reveal which option is correct; teach how to eliminate wrong options.
- Mention textbook lineage when helpful (e.g. Concise Physics, ML Aggarwal for ICSE maths) without dumping copyrighted text.
${eli5 ? '\n\nELI5 MODE: Use very simple words, short sentences, and one relatable analogy — still no direct final answers.' : ''}`;

      const result = await callGroq(
        [
          { role: 'system', content: hintPrompt },
          { role: 'user', content: question.trim() },
        ],
        'doubt_solver'
      );
      setResponse(result);
      setHelpTier(0);

      await persistDoubt({
        hint_text: result,
        sources_json: JSON.stringify({ web: sources.slice(0, 2000), upload: !!uploadExcerpt }),
      });

      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (ss:StudySession {
           id: $sessionId, subject: $subject, chapter: $chapter,
           duration_mins: 8, session_type: 'doubt_hint', date: datetime()
         })
         CREATE (s)-[:STUDIED]->(ss)`,
        { studentId, sessionId: uuidv4(), subject: subject || 'General', chapter: chapter || '' }
      );
    } catch (err: unknown) {
      setResponse(err instanceof Error ? err.message : 'Could not reach AI');
    } finally {
      setLoading(false);
    }
  };

  const handleExplainFurther = async () => {
    if (!studentId || !question.trim()) return;
    setLoading(true);
    try {
      const context = await buildStudentContext(studentId);
      const sources = searchNotes || (await gatherSources());
      const explainPrompt = `${context}

SOURCES (for grounding tone only):
${sources || ''}

BOARD: ${board}, CLASS: ${classNum}.
${uploadExcerpt ? `Student notes excerpt:\n${uploadExcerpt.slice(0, 4000)}` : ''}

TASK — FULL HELP:
The learner is still stuck after hints. Now give a clear, step-by-step explanation in simple language.
Use at least one real-life analogy or everyday example.
Still avoid blindly giving competitive-exam shortcuts — focus on understanding.
${eli5 ? '\n\nELI5 MODE: Assume age ~12 reading level; define jargon when needed.' : ''}`;

      const result = await callGroq(
        [
          { role: 'system', content: explainPrompt },
          {
            role: 'user',
            content: `Original doubt:\n${question}\n\nPrevious hint response:\n${response}\n\nExplain further with examples.`,
          },
        ],
        'doubt_solver'
      );
      setResponse(prev => `${prev}\n\n———\nDETAILED EXPLANATION\n———\n\n${result}`);
      setHelpTier(1);

      await persistDoubt({
        explain_text: result,
        hint_text: response,
        sources_json: JSON.stringify({ stage: 'explain' }),
      });

      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (ss:StudySession {
           id: $sessionId, subject: $subject, chapter: $chapter,
           duration_mins: 12, session_type: 'doubt_explain', date: datetime()
         })
         CREATE (s)-[:STUDIED]->(ss)`,
        { studentId, sessionId: uuidv4(), subject: subject || 'General', chapter: chapter || '' }
      );
    } catch (err: unknown) {
      setResponse(prev => `${prev}\n\n(Error: ${err instanceof Error ? err.message : 'failed'})`);
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setLoading(true);
      try {
        const manipResult = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        setImage(manipResult.uri);
        setImageBase64(manipResult.base64 || null);
      } catch (e) {
        console.error('Image optimization failed', e);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSubmitPhoto = async () => {
    if (!imageBase64 || !studentId) return;
    setLoading(true);
    resetTurn();
    try {
      const context = await buildStudentContext(studentId);
      const sources = await gatherSources();

      const hintVision = `${context}

SOURCES:\n${sources || ''}

PHOTO MODE — HINT LEVEL:
Describe what you see briefly, then give hints and method only — no full solution or final matched answer.
${eli5 ? '\nELI5: simpler wording throughout.' : ''}`;

      const result = await callGroqVision(
        hintVision,
        imageBase64,
        `Subject hint: ${subject || 'unknown'}, chapter: ${chapter || 'unknown'}, board ${board} class ${classNum}.`,
        'vision_question'
      );
      setResponse(result);
      setHelpTier(0);

      await persistDoubt({
        hint_text: result,
        sources_json: JSON.stringify({ photo: true }),
        vision: true,
      });

      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (ss:StudySession {
           id: $sessionId, subject: $subject, chapter: $chapter,
           duration_mins: 8, session_type: 'photo_doubt_hint', date: datetime()
         })
         CREATE (s)-[:STUDIED]->(ss)`,
        { studentId, sessionId: uuidv4(), subject: subject || 'General', chapter: chapter || '' }
      );
    } catch (err: unknown) {
      setResponse(err instanceof Error ? err.message : 'Vision AI failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoExplain = async () => {
    if (!imageBase64 || !studentId) return;
    setLoading(true);
    try {
      const context = await buildStudentContext(studentId);
      const explainVision = `${context}

PHOTO MODE — EXPLAIN NOW:
Give full worked reasoning with a simple analogy. Student already saw hints above.
${eli5 ? '\nELI5 mode on — keep language friendly and concrete.' : ''}`;

      const result = await callGroqVision(
        explainVision,
        imageBase64,
        `Explain the problem completely with a real-life analogy. Prior response:\n${response}`,
        'vision_question'
      );
      setResponse(prev => `${prev}\n\n———\nDETAILED EXPLANATION\n———\n\n${result}`);
      setHelpTier(1);

      await persistDoubt({
        explain_text: result,
        vision: true,
      });
    } catch (err: unknown) {
      setResponse(prev => `${prev}\n\n(Error)`);
    } finally {
      setLoading(false);
    }
  };

  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ['text/plain', 'text/markdown', 'application/json'],
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setUploadLabel(asset.name);
      const uri = asset.uri;
      const text = await FileSystem.readAsStringAsync(uri);
      setUploadExcerpt(text.slice(0, 12000));
      Alert.alert('Attached', `${asset.name} loaded (${text.length} chars, truncated for AI).`);
    } catch (e) {
      Alert.alert('Could not read file', 'Try a .txt or .md file.');
    }
  };

  const handleFollowUp = async () => {
    if (!followUp.trim() || !studentId) return;
    setLoading(true);
    try {
      const context = await buildStudentContext(studentId);
      const mode =
        helpTier === 0
          ? `Stay at hint level — still no direct final answers.${eli5 ? ' ELI5 wording.' : ''}`
          : `You may clarify with full explanations if needed.${eli5 ? ' ELI5 wording.' : ''}`;
      const result = await callGroq(
        [
          { role: 'system', content: `Expert ${board} tutor. ${context}\n${mode}` },
          { role: 'assistant', content: response },
          { role: 'user', content: followUp },
        ],
        'doubt_solver'
      );
      setResponse(prev => `${prev}\n\n---\n\n${result}`);
      setFollowUp('');
    } catch (err: unknown) {
      setResponse(prev => `${prev}\n\n${err instanceof Error ? err.message : 'error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Ask AI</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={[styles.tabs, { backgroundColor: colors.surfaceContainer, borderColor: colors.border }]}>
          {(
            [
              ['type', 'chatbubble-outline', 'Type'],
              ['photograph', 'camera-outline', 'Photo'],
              ['resources', 'folder-outline', 'Upload'],
            ] as const
          ).map(([key, icon, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.tab, tab === key && { backgroundColor: colors.surface }]}
              onPress={() => setTab(key)}
            >
              <Ionicons
                name={icon as keyof typeof Ionicons.glyphMap}
                size={16}
                color={tab === key ? colors.primary : colors.textTertiary}
              />
              <Text style={[styles.tabText, { color: tab === key ? colors.primary : colors.textTertiary }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.eli5Row, { borderColor: colors.border, backgroundColor: colors.surfaceContainer }]}
          onPress={() => setEli5(v => !v)}
          activeOpacity={0.8}
        >
          <Ionicons name={eli5 ? 'checkbox' : 'square-outline'} size={22} color={eli5 ? colors.primary : colors.textTertiary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>Explain like I&apos;m 12 (ELI5)</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              Shorter words, analogies, less jargon in hints and explanations
            </Text>
          </View>
        </TouchableOpacity>

        <View style={[styles.subjectRow, { borderColor: colors.border }]}>
          <Ionicons name="school-outline" size={18} color={colors.textTertiary} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {SUBJECTS.map(s => (
                <TouchableOpacity
                  key={s.name}
                  onPress={() => setSubject(s.name)}
                  style={[
                    styles.subjectPill,
                    {
                      backgroundColor: subject === s.name ? colors.primary : 'transparent',
                      borderColor: subject === s.name ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: subject === s.name ? colors.onPrimary : colors.text, fontSize: 12 }}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {subject ? (
          <ScrollView horizontal style={{ marginBottom: 12 }} showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {chapters.slice(0, 40).map(ch => (
                <TouchableOpacity
                  key={ch}
                  onPress={() => setChapter(ch)}
                  style={[
                    styles.subjectPill,
                    {
                      backgroundColor: chapter === ch ? colors.primaryContainer : 'transparent',
                      borderColor: chapter === ch ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: chapter === ch ? colors.onPrimaryContainer : colors.textSecondary,
                      fontSize: 11,
                      maxWidth: 140,
                    }}
                    numberOfLines={2}
                  >
                    {ch}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : null}

        {tab === 'resources' && (
          <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={{ color: colors.textSecondary, marginBottom: 10, fontSize: 13 }}>
              Attach plain-text study notes (.txt / .md). Content is saved with your Neo4j profile for this session.
            </Text>
            <TouchableOpacity
              style={[styles.pickBtn, { borderColor: colors.border }]}
              onPress={() => void handlePickDocument()}
            >
              <Ionicons name="document-attach-outline" size={22} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '600' }}>
                {uploadLabel || 'Choose text file'}
              </Text>
            </TouchableOpacity>
            {uploadExcerpt ? (
              <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 10 }}>
                Loaded {uploadExcerpt.length} characters
              </Text>
            ) : null}
          </View>
        )}

        {tab === 'type' && (
          <View style={[styles.inputArea, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput
              style={[styles.questionInput, { color: colors.text }]}
              placeholder="Describe your doubt..."
              placeholderTextColor={colors.textTertiary}
              value={question}
              onChangeText={setQuestion}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.inputActions}>
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: colors.primary }]}
                onPress={() => void handleSubmitText()}
                disabled={loading || !question.trim()}
              >
                {loading ? (
                  <ActivityIndicator color={colors.onPrimary} size="small" />
                ) : (
                  <Text style={[styles.sendText, { color: colors.onPrimary }]}>Get hints</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {tab === 'photograph' && (
          <View>
            {image ? (
              <View style={styles.imagePreview}>
                <Image source={{ uri: image }} style={styles.previewImage} />
                <TouchableOpacity
                  style={[styles.removeImage, { backgroundColor: colors.error }]}
                  onPress={() => {
                    setImage(null);
                    setImageBase64(null);
                  }}
                >
                  <Ionicons name="close" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.pickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => void handlePickImage()}
              >
                <Ionicons name="image-outline" size={40} color={colors.textTertiary} />
                <Text style={[styles.pickText, { color: colors.textSecondary }]}>Pick a photo</Text>
              </TouchableOpacity>
            )}
            {image ? (
              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  style={[styles.sendBtn, { backgroundColor: colors.primary }]}
                  onPress={() => void handleSubmitPhoto()}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.onPrimary} size="small" />
                  ) : (
                    <Text style={[styles.sendText, { color: colors.onPrimary }]}>Get hints from photo</Text>
                  )}
                </TouchableOpacity>
                {response ? (
                  <TouchableOpacity
                    style={[styles.sendBtn, { backgroundColor: colors.primaryContainer }]}
                    onPress={() => void handlePhotoExplain()}
                    disabled={loading}
                  >
                    <Text style={[styles.sendText, { color: colors.onPrimaryContainer }]}>
                      Still stuck — full explanation
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        )}

        {response ? (
          <View style={[styles.responseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MarkdownView content={response} />

            {tab === 'type' && helpTier === 0 ? (
              <TouchableOpacity
                style={[styles.explainBtn, { backgroundColor: colors.primaryContainer }]}
                onPress={() => void handleExplainFurther()}
                disabled={loading}
              >
                <Text style={{ color: colors.onPrimaryContainer, fontWeight: '700', textAlign: 'center' }}>
                  I am still stuck — explain with real-life examples
                </Text>
              </TouchableOpacity>
            ) : null}

            <View style={[styles.followUpRow, { borderTopColor: colors.border }]}>
              <TextInput
                style={[styles.followUpInput, { color: colors.text }]}
                placeholder="Follow-up..."
                placeholderTextColor={colors.textTertiary}
                value={followUp}
                onChangeText={setFollowUp}
              />
              <TouchableOpacity onPress={() => void handleFollowUp()} disabled={loading || !followUp.trim()}>
                <Ionicons name="arrow-up-circle" size={32} color={followUp.trim() ? colors.primary : colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '700' },
  tabs: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, padding: 3, marginBottom: 16 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8 },
  tabText: { fontSize: 13, fontWeight: '500' },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, marginBottom: 8 },
  subjectPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  inputArea: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 16 },
  questionInput: { minHeight: 120, fontSize: 15, lineHeight: 22 },
  inputActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, justifyContent: 'center' },
  sendText: { fontSize: 14, fontWeight: '600' },
  pickBtn: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 28, alignItems: 'center', gap: 12 },
  pickText: { fontSize: 14 },
  imagePreview: { borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  previewImage: { width: '100%', height: 200, borderRadius: 12 },
  removeImage: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  responseCard: { borderRadius: 12, borderWidth: 1, padding: 20, marginTop: 16 },
  responseText: { fontSize: 15, lineHeight: 24 },
  explainBtn: { marginTop: 16, padding: 14, borderRadius: 10 },
  followUpRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  followUpInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  box: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 16 },
  eli5Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
});

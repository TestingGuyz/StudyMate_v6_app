// PROFILE & SETTINGS — Clean sectioned layout with gradient header
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Alert, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, useAuth, useLanguage } from '../../lib/context';
import { useT } from '../../lib/translations';
import { SUPPORTED_LANGUAGES } from '../../constants/languages';
import { usePremium } from '../../components/ui/premium';
import { getStudentProfile, StudentProfile } from '../../lib/adaptiveEngine';
import { setStoredValue, testConnection, writeQuery, getStoredValue, readQuery, deleteStudentCascade } from '../../lib/neo4j';
import { hashPassword, verifyPassword } from '../../lib/password';

export default function ProfileScreen() {
  const { colors, mode, setMode, isDark } = useTheme();
  const { studentId, setStudentId } = useAuth();
  const { language, setLanguage } = useLanguage();
  const tr = useT();
  const premium = usePremium();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [neo4jConnected, setNeo4jConnected] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [groqKey, setGroqKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [neo4jUri, setNeo4jUri] = useState('');
  const [neo4jUser, setNeo4jUser] = useState('');
  const [neo4jPass, setNeo4jPass] = useState('');
  const [tavilyKey, setTavilyKey] = useState('');
  const [saving, setSaving] = useState(false);

  // Parent PIN states
  const [hasPinSet, setHasPinSet] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [verifyingPin, setVerifyingPin] = useState(false);

  // Baseline state
  const [hasBaseline, setHasBaseline] = useState(false);
  const [lastDiagScore, setLastDiagScore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      try {
        const p = await getStudentProfile(studentId);
        setProfile(p);
        const connected = await testConnection();
        setNeo4jConnected(connected);

        if (Platform.OS === 'web') {
          setGroqKey(localStorage.getItem('groq_api_key') || '');
          setOpenRouterKey(localStorage.getItem('openrouter_api_key') || '');
          setCustomModel(localStorage.getItem('custom_model') || '');
          setNeo4jUri(localStorage.getItem('neo4j_uri') || '');
          setNeo4jUser(localStorage.getItem('neo4j_username') || '');
          setNeo4jPass(localStorage.getItem('neo4j_password') || '');
        } else {
          const SecureStore = require('expo-secure-store');
          setGroqKey((await SecureStore.getItemAsync('groq_api_key')) || '');
          setOpenRouterKey((await SecureStore.getItemAsync('openrouter_api_key')) || '');
          setCustomModel((await SecureStore.getItemAsync('custom_model')) || '');
          setNeo4jUri((await SecureStore.getItemAsync('neo4j_uri')) || '');
          setNeo4jUser((await SecureStore.getItemAsync('neo4j_username')) || '');
          setNeo4jPass((await SecureStore.getItemAsync('neo4j_password')) || '');
        }
        const tv = await getStoredValue('tavily_api_key');
        setTavilyKey(tv || '');

        // Check if parent PIN is set
        const pinRec = await readQuery(
          `MATCH (s:Student {id: $studentId}) RETURN s.parent_pin_salt AS salt`,
          { studentId }
        );
        setHasPinSet(!!(pinRec[0]?.get('salt')));

        // Check baseline status
        const diagDone = await readQuery(
          `MATCH (s:Student {id: $studentId})-[:TOOK_DIAGNOSTIC]->(r:DiagnosticRun)
           RETURN r.correct_total AS c, r.total_questions AS t
           ORDER BY r.completed_at DESC LIMIT 1`,
          { studentId }
        );
        const legacyBaseline = await readQuery(
          `MATCH (s:Student {id: $studentId})-[:TOOK_BASELINE]->() RETURN 1 LIMIT 1`,
          { studentId }
        );
        if (diagDone.length > 0) {
          setHasBaseline(true);
          const c = diagDone[0].get('c');
          const t = diagDone[0].get('t');
          if (c != null && t != null) setLastDiagScore(`${c}/${t}`);
        } else if (legacyBaseline.length > 0) {
          setHasBaseline(true);
        }
      } catch (err) {
        console.error('Profile load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId]);

  const saveCredentials = async () => {
    setSaving(true);
    try {
      await setStoredValue('groq_api_key', groqKey);
      await setStoredValue('openrouter_api_key', openRouterKey);
      await setStoredValue('custom_model', customModel);
      await setStoredValue('neo4j_uri', neo4jUri);
      await setStoredValue('neo4j_username', neo4jUser);
      await setStoredValue('neo4j_password', neo4jPass);
      await setStoredValue('tavily_api_key', tavilyKey);
      const connected = await testConnection();
      setNeo4jConnected(connected);
      Alert.alert('Saved', connected ? 'Credentials saved and connected!' : 'Saved, but Neo4j connection failed.');
    } catch (err) {
      Alert.alert('Error', 'Failed to save credentials.');
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyCurrentPin = async () => {
    if (!studentId || currentPinInput.length < 4) {
      Alert.alert('Invalid', 'Enter your current 4-8 digit PIN.');
      return;
    }
    setVerifyingPin(true);
    try {
      const recs = await readQuery(
        `MATCH (s:Student {id: $studentId}) RETURN s.parent_pin_salt AS salt, s.parent_pin_hash AS hash`,
        { studentId }
      );
      const salt = recs[0]?.get('salt');
      const hash = recs[0]?.get('hash');
      if (!salt || !hash) { Alert.alert('Error', 'No PIN found.'); return; }
      const ok = await verifyPassword(currentPinInput, salt, hash);
      if (ok) {
        setPinVerified(true);
      } else {
        Alert.alert('Incorrect', 'Current PIN is wrong. Please try again.');
      }
    } catch { Alert.alert('Error', 'Could not verify PIN.'); }
    finally { setVerifyingPin(false); }
  };

  const handleSaveNewPin = async () => {
    if (newPinInput.length < 4 || newPinInput.length > 8) {
      Alert.alert('Invalid', 'PIN must be 4-8 digits.'); return;
    }
    if (newPinInput !== confirmPinInput) {
      Alert.alert('Mismatch', 'New PIN and confirmation do not match.'); return;
    }
    try {
      const { saltHex, hashHex } = await hashPassword(newPinInput);
      await writeQuery(
        `MATCH (s:Student {id: $studentId}) SET s.parent_pin_salt = $salt, s.parent_pin_hash = $hash`,
        { studentId, salt: saltHex, hash: hashHex }
      );
      setHasPinSet(true);
      setPinVerified(false);
      setCurrentPinInput(''); setNewPinInput(''); setConfirmPinInput('');
      Alert.alert('Saved', 'Parent PIN updated successfully.');
    } catch { Alert.alert('Error', 'Could not save PIN.'); }
  };

  const handleLogout = async () => {
    await setStudentId(null);
    router.replace('/(auth)/login');
  };

  const handleReset = () => {
    Alert.alert('Reset All Progress', 'This will delete all your data. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes, Reset', style: 'destructive', onPress: () => {
        Alert.alert('Final Confirmation', 'Absolutely sure? All data will be permanently deleted.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'DELETE EVERYTHING', style: 'destructive', onPress: async () => {
            try {
              await deleteStudentCascade(studentId!);
              await setStudentId(null);
              router.replace('/(auth)/login');
            } catch { Alert.alert('Error', 'Failed to reset.'); }
          }},
        ]);
      }},
    ]);
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={colors.primary} size="large" /></View>;

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={[s.sectionHeader, { color: colors.textTertiary }]}>{title}</Text>
  );

  const SettingRow = ({ icon, label, onPress, trailing, danger }: { icon: string; label: string; onPress: () => void; trailing?: React.ReactNode; danger?: boolean }) => (
    <TouchableOpacity style={[s.settingRow, { borderBottomColor: colors.border }]} onPress={onPress}>
      <View style={s.settingLeft}>
        <View style={[s.settingIcon, { backgroundColor: danger ? '#EF444412' : isDark ? 'rgba(196,193,251,0.08)' : '#EEF2FF' }]}>
          <Ionicons name={icon as any} size={18} color={danger ? '#EF4444' : colors.primary} />
        </View>
        <Text style={[s.settingLabel, { color: danger ? '#EF4444' : colors.text }]}>{label}</Text>
      </View>
      {trailing || <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={[s.container, { backgroundColor: colors.background }]} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      {/* Gradient Header */}
      <LinearGradient colors={isDark ? ['#1E1B4B', '#0F0E1A'] : ['#E0E7FF', '#F9F9FF']} style={s.hero}>
        <View style={[s.avatar, { backgroundColor: isDark ? 'rgba(196,193,251,0.12)' : 'rgba(7,2,53,0.06)' }]}>
          <Text style={[s.avatarText, { color: colors.primary }]}>{profile?.name?.[0]?.toUpperCase() || '?'}</Text>
        </View>
        <Text style={[s.heroName, { color: isDark ? '#FFF' : '#070235' }]}>{profile?.name || tr('student')}</Text>
        <Text style={[s.heroSub, { color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(7,2,53,0.5)' }]}>
          {profile?.email ? `${profile.email} · ` : ''}Class {profile?.class} · {profile?.board}
        </Text>
      </LinearGradient>

      <View style={s.body}>
        {/* Profile Section */}
        <SectionHeader title="PROFILE" />
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SettingRow icon="person-outline" label="Edit Ambitions & Motives" onPress={() => setIsEditing(!isEditing)} />
          {isEditing && profile && (
            <View style={{ padding: 16, paddingTop: 0 }}>
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Ambitions</Text>
              <TextInput style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]} defaultValue={profile.ambitions.join(', ')} onChangeText={t => setProfile({...profile, ambitions: t.split(',').map(x => x.trim())})} placeholderTextColor={colors.textTertiary} />
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Motives</Text>
              <TextInput style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]} defaultValue={profile.motives.join(', ')} onChangeText={t => setProfile({...profile, motives: t.split(',').map(x => x.trim())})} placeholderTextColor={colors.textTertiary} />
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={async () => {
                setIsEditing(false);
                await writeQuery(`MATCH (s:Student {id: $studentId}) SET s.ambitions = $ambitions, s.motives = $motives`, { studentId, ambitions: profile.ambitions, motives: profile.motives });
              }}>
                <Text style={{ color: colors.onPrimary, fontWeight: '600', fontSize: 14 }}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Appearance */}
        <SectionHeader title={tr('appearance').toUpperCase()} />
        <View style={[s.card, { backgroundColor: premium.glassBg, borderColor: premium.glassBorder }]}>
          <View style={s.themeRow}>
            {([
              { m: 'light' as const, key: 'theme_light', icon: 'sunny' as const },
              { m: 'dark' as const, key: 'theme_dark', icon: 'moon' as const },
              { m: 'system' as const, key: 'theme_system', icon: 'phone-portrait-outline' as const },
            ]).map(({ m, key, icon }) => (
              <TouchableOpacity key={m} style={[s.themePill, { backgroundColor: mode === m ? colors.primary : colors.surfaceContainer }]} onPress={() => setMode(m)}>
                <Ionicons name={icon} size={16} color={mode === m ? colors.onPrimary : colors.textSecondary} />
                <Text style={[s.themeText, { color: mode === m ? colors.onPrimary : colors.text }]}>{tr(key)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <View style={s.settingRowStatic}>
            <View style={s.settingLeft}>
              <View style={[s.settingIcon, { backgroundColor: isDark ? 'rgba(196,193,251,0.08)' : '#EEF2FF' }]}>
                <Ionicons name="language-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[s.settingLabel, { color: colors.text }]}>{tr('language')}</Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            {SUPPORTED_LANGUAGES.map(lang => (
              <TouchableOpacity key={lang} style={[s.themePill, { backgroundColor: language === lang ? colors.primary : colors.surfaceContainer, marginRight: 8 }]} onPress={() => setLanguage(lang)}>
                <Text style={[s.themeText, { color: language === lang ? colors.onPrimary : colors.text }]}>{lang}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Diagnostics */}
        <SectionHeader title={tr('diagnostics').toUpperCase()} />
        <View style={[s.card, { backgroundColor: premium.glassBg, borderColor: premium.glassBorder }]}>
          {hasBaseline ? (
            <>
              <SettingRow icon="checkmark-circle-outline" label={tr('retake_diagnostic')} onPress={() => router.push('/screens/BaselineTestScreen')}
                trailing={lastDiagScore ? <View style={{ backgroundColor: isDark ? '#05966920' : '#ECFDF5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}><Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>{lastDiagScore}</Text></View> : undefined}
              />
            </>
          ) : (
            <SettingRow icon="clipboard-outline" label={tr('take_baseline')} onPress={() => router.push('/screens/BaselineTestScreen')}
              trailing={<View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}><Text style={{ fontSize: 10, fontWeight: '700', color: '#B45309' }}>{tr('new')}</Text></View>}
            />
          )}
          <SettingRow icon="document-text-outline" label={tr('parental_report')} onPress={() => router.push('/screens/ParentalReportScreen')} />
        </View>

        {/* Parent PIN */}
        <SectionHeader title="PARENT ACCESS" />
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.cardDesc, { color: colors.textSecondary }]}>
            Set a PIN so parents can view study signals from Parent View using the student email and this PIN.
          </Text>
          {hasPinSet && !pinVerified ? (
            <>
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Current PIN</Text>
              <TextInput style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]} value={currentPinInput} onChangeText={setCurrentPinInput} placeholder="Enter current PIN" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" secureTextEntry />
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={handleVerifyCurrentPin} disabled={verifyingPin}>
                {verifyingPin ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Text style={{ color: colors.onPrimary, fontWeight: '600', fontSize: 14 }}>Verify Current PIN</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>{hasPinSet ? 'New PIN' : 'Set PIN (4-8 digits)'}</Text>
              <TextInput style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]} value={newPinInput} onChangeText={setNewPinInput} placeholder="••••" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" secureTextEntry />
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Confirm PIN</Text>
              <TextInput style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]} value={confirmPinInput} onChangeText={setConfirmPinInput} placeholder="••••" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" secureTextEntry />
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveNewPin}>
                <Text style={{ color: colors.onPrimary, fontWeight: '600', fontSize: 14 }}>{hasPinSet ? 'Update PIN' : 'Save PIN'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* API Configuration */}
        <SectionHeader title="API CONFIGURATION" />
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { label: 'Groq API Key', value: groqKey, onChange: setGroqKey, placeholder: 'gsk_...', secure: true },
            { label: 'OpenRouter Key (Optional)', value: openRouterKey, onChange: setOpenRouterKey, placeholder: 'sk-or-v1-...', secure: true },
            { label: 'Custom Model (Optional)', value: customModel, onChange: setCustomModel, placeholder: 'meta-llama/llama-3.1-8b-instruct:free', secure: false },
            { label: 'Neo4j URI', value: neo4jUri, onChange: setNeo4jUri, placeholder: 'neo4j+s://xxx.neo4j.io', secure: false },
            { label: 'Neo4j Username', value: neo4jUser, onChange: setNeo4jUser, placeholder: 'neo4j', secure: false },
            { label: 'Neo4j Password', value: neo4jPass, onChange: setNeo4jPass, placeholder: 'Password', secure: true },
            { label: 'Tavily API Key', value: tavilyKey, onChange: setTavilyKey, placeholder: 'tvly-...', secure: true },
          ].map(f => (
            <View key={f.label}>
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>{f.label}</Text>
              <TextInput style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]} value={f.value} onChangeText={f.onChange} placeholder={f.placeholder} placeholderTextColor={colors.textTertiary} secureTextEntry={f.secure} />
            </View>
          ))}
          <View style={s.connectionRow}>
            <View style={[s.statusDot, { backgroundColor: neo4jConnected ? '#059669' : '#EF4444' }]} />
            <Text style={[s.connectionText, { color: colors.textSecondary }]}>Neo4j: {neo4jConnected ? 'Connected' : 'Not Connected'}</Text>
          </View>
          <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={saveCredentials} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 14 }}>Save Credentials</Text>}
          </TouchableOpacity>
        </View>

        {/* Account */}
        <SectionHeader title="ACCOUNT" />
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SettingRow icon="log-out-outline" label="Log out" onPress={() => void handleLogout()} />
        </View>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.error + '20' }]}>
          <SettingRow icon="trash-outline" label="Reset All Progress" onPress={handleReset} danger />
        </View>

        <Text style={[s.version, { color: colors.textTertiary }]}>StudyMate AI v1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 40 },
  hero: { paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingBottom: 32, alignItems: 'center', borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 28, fontWeight: '800' },
  heroName: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  heroSub: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  body: { paddingHorizontal: 20, paddingTop: 24 },
  sectionHeader: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 8, marginLeft: 4 },
  card: { borderRadius: 16, borderWidth: 1, marginBottom: 16, overflow: 'hidden', shadowColor: '#1E1B4B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 3 },
  cardDesc: { fontSize: 13, lineHeight: 20, padding: 16, paddingBottom: 8 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: 15, fontWeight: '500' },
  themeRow: { flexDirection: 'row', gap: 8, padding: 16 },
  themePill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  themeText: { fontSize: 13, fontWeight: '600' },
  inputLabel: { fontSize: 12, fontWeight: '500', marginBottom: 6, marginTop: 12, letterSpacing: 0.3, paddingHorizontal: 16 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 14, marginHorizontal: 16 },
  divider: { height: 1, marginHorizontal: 16 },
  settingRowStatic: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingHorizontal: 16 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  connectionText: { fontSize: 13, fontWeight: '500' },
  saveBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginHorizontal: 16, marginVertical: 16 },
  version: { textAlign: 'center', fontSize: 12, marginTop: 12, fontWeight: '500' },
});

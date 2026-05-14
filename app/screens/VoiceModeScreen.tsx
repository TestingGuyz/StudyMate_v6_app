import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView, TextInput, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { callGroq, GroqMessage } from '../../lib/groq';
import { buildStudentContext } from '../../lib/adaptiveEngine';
import { Audio } from 'expo-av';
import * as SecureStore from 'expo-secure-store';

export default function VoiceModeScreen() {
  const { colors } = useTheme();
  const { studentId } = useAuth();
  const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [contextStr, setContextStr] = useState('');
  
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    if (studentId) {
      buildStudentContext(studentId).then(setContextStr);
    }
    
    // Web Speech Recognition Fallback
    if (Platform.OS === 'web') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'en-US';
        
        rec.onresult = (event: any) => {
          const text = event.results[0][0].transcript;
          handleSend(text);
        };
        
        rec.onend = () => setIsRecording(false);
        rec.onerror = (e: any) => {
          console.error('Speech Recognition Error:', e);
          setIsRecording(false);
        };
        setRecognition(rec);
      }
    }

    // Request permissions on load
    (async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') return;
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      } catch (e) {
        console.log('Error requesting audio permissions', e);
      }
    })();
  }, [studentId]);

  const startRecording = async () => {
    if (Platform.OS === 'web' && recognition) {
      setIsRecording(true);
      recognition.start();
      return;
    }

    try {
      if (recording) {
        await recording.stopAndUnloadAsync();
      }
      setIsRecording(true);
      const { recording: newRec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(newRec);
    } catch (err) {
      console.error('Failed to start recording', err);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (Platform.OS === 'web' && recognition) {
      recognition.stop();
      return;
    }

    if (!recording) return;
    setIsRecording(false);
    setTranscribing(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) throw new Error("No URI");
      
      const apiKey = Platform.OS === 'web' 
        ? localStorage.getItem('groq_api_key') 
        : await SecureStore.getItemAsync('groq_api_key');
        
      const key = apiKey || process.env.EXPO_PUBLIC_GROQ_API_KEY;
      if (!key) throw new Error("No Groq API Key found");

      const formData = new FormData();
      
      // Better cross-platform audio file handling
      const fileUri = Platform.OS === 'android' ? uri : uri.replace('file://', '');
      const filename = uri.split('/').pop() || 'audio.m4a';
      const extension = filename.split('.').pop() || 'm4a';
      
      formData.append('file', {
        uri: uri,
        type: `audio/${extension === 'm4a' ? 'mp4' : extension}`,
        name: filename
      } as any);
      formData.append('model', 'whisper-large-v3-turbo');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.text) {
        await handleSend(data.text);
      } else {
        throw new Error("Transcription result empty");
      }
    } catch (error: any) {
      console.error('Transcription error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I couldn't hear that. Error: ${error.message}` }]);
    } finally {
      setTranscribing(false);
      setRecording(null);
    }
  };

  const handleSendRef = useRef<((text: string) => Promise<void>) | null>(null);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const systemPrompt = `You are a warm, conversational AI tutor in Voice Mode. Respond in short, spoken-style sentences (max 2 sentences). Avoid markdown formatting like asterisks or bold text, as this is meant to be spoken aloud. ${contextStr}`;
      
      const apiMessages: GroqMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: userMsg.content },
      ];

      const response = await callGroq(apiMessages, 'voice_mode');
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);

      // Free web-based high-quality TTS
      if (Platform.OS === 'web' && 'speechSynthesis' in window) {
        const synth = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance(response);
        // Try to pick a high quality natural voice if available
        const voices = synth.getVoices();
        const bestVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Neural') || v.name.includes('Online')) || voices[0];
        if (bestVoice) {
          utterance.voice = bestVoice;
        }
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        synth.speak(utterance);
      }

    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, my connection dropped. Could you repeat that?" }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);
  
  useEffect(() => {
    if (Platform.OS === 'web' && recognition) {
      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        if (handleSendRef.current) handleSendRef.current(text);
      };
    }
  }, [recognition]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-down" size={32} color={colors.text} />
        </TouchableOpacity>
        <Text style={{color: colors.text, fontSize: 18, fontWeight: '600'}}>Voice AI Companion</Text>
        <View style={{width: 32}} />
      </View>

      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.chatArea}>
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.glowRing, { borderColor: colors.primary + '40', backgroundColor: colors.primary + '10' }]}>
              <Ionicons name="mic-outline" size={64} color={colors.primary} />
            </View>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Tap the microphone and start speaking. I'm listening!
            </Text>
          </View>
        ) : (
          messages.map((m, i) => (
            <View key={i} style={[styles.msgBubble, m.role === 'user' ? [styles.userBubble, { backgroundColor: colors.primary }] : [styles.aiBubble, { backgroundColor: colors.surfaceContainerHigh }]]}>
              <Text style={{ color: m.role === 'user' ? colors.onPrimary : colors.text, fontSize: 16, lineHeight: 24 }}>
                {m.content}
              </Text>
            </View>
          ))
        )}
        {transcribing && <Text style={{ color: colors.textTertiary, marginVertical: 10, alignSelf: 'center' }}>Listening...</Text>}
        {loading && <Text style={{ color: colors.textTertiary, marginVertical: 10, alignSelf: 'center' }}>AI is thinking...</Text>}
      </ScrollView>

      <View style={[styles.inputArea, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity 
          style={[styles.micBtn, { backgroundColor: isRecording ? '#EF4444' : colors.primary }]}
          onPress={isRecording ? stopRecording : startRecording}
          disabled={loading || transcribing}
        >
          {isRecording ? (
            <View style={styles.recordingDot} />
          ) : (
             <Ionicons name="mic" size={32} color={colors.onPrimary} />
          )}
        </TouchableOpacity>
        <Text style={{color: isRecording ? '#EF4444' : colors.textSecondary, fontWeight: '600', fontSize: 16}}>
          {isRecording ? "Recording... tap to stop" : "Tap to speak"}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  header: { paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatArea: { padding: 20, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  glowRing: { width: 140, height: 140, borderRadius: 70, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  emptyText: { textAlign: 'center', fontSize: 16, maxWidth: 240, lineHeight: 24 },
  msgBubble: { maxWidth: '85%', padding: 16, borderRadius: 20, marginBottom: 12 },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  inputArea: { padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, borderTopWidth: 1, alignItems: 'center', gap: 16 },
  micBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
  recordingDot: { width: 24, height: 24, borderRadius: 4, backgroundColor: 'white' }
});

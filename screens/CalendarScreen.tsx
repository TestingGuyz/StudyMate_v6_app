// MONTHLY CALENDAR — Shows events and timetable slots
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, useAuth } from '../../lib/context';
import { readQuery, writeQuery } from '../../lib/neo4j';
import { v4 as uuidv4 } from 'uuid';

interface CalendarEvent {
  id: string;
  title: string;
  type: 'event' | 'reminder';
  date: string; // YYYY-MM-DD
}

interface TimetableSlotInfo {
  subject: string;
  title: string;
  time_slot: string;
}

export default function CalendarScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [timetableSlots, setTimetableSlots] = useState<Record<string, TimetableSlotInfo[]>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState<'event'|'reminder'>('event');

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay(); // 0 is Sunday
  };

  const loadData = async () => {
    if (!studentId) return;
    try {
      // Load custom events for this month
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString();
      
      const eventRes = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:HAS_EVENT]->(e:CalendarEvent)
         WHERE e.date >= $start AND e.date <= $end
         RETURN e.id AS id, e.title AS title, e.type AS type, e.date AS date`,
        { studentId, start: startOfMonth, end: endOfMonth }
      );
      setEvents(eventRes.map(r => ({
        id: r.get('id'), title: r.get('title'), type: r.get('type'), date: r.get('date').split('T')[0]
      })));

      // Load timetable template to map to days
      const ttRes = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot)
         RETURN slot.day_index AS di, slot.subject AS sub, slot.title AS title, slot.time_slot AS ts`,
        { studentId }
      );
      
      const mappedSlots: Record<string, TimetableSlotInfo[]> = {};
      const daysInMonth = getDaysInMonth(currentDate);
      const slotsList = ttRes.map(r => ({
        day_index: Number(r.get('di')), subject: r.get('sub'), title: r.get('title'), time_slot: r.get('ts')
      }));

      // Map weekly template onto the month's dates
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
        const dayOfWeek = (d.getDay() + 6) % 7; // Convert to Mon=0, Sun=6
        const dateStr = d.toISOString().split('T')[0];
        
        const daySlots = slotsList.filter(s => s.day_index === dayOfWeek);
        if (daySlots.length > 0) {
          mappedSlots[dateStr] = daySlots.map(s => ({
            subject: s.subject, title: s.title, time_slot: s.time_slot
          }));
        }
      }
      setTimetableSlots(mappedSlots);
    } catch (e) {
      console.error("Calendar fetch error", e);
    }
  };

  useEffect(() => { loadData(); }, [studentId, currentDate]);

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const handleAddEvent = async () => {
    if (!selectedDate || !newEventTitle.trim()) return;
    const isoDate = new Date(selectedDate).toISOString();
    try {
      const id = uuidv4();
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (e:CalendarEvent {id: $id, title: $title, type: $type, date: $date})
         CREATE (s)-[:HAS_EVENT]->(e)`,
        { studentId, id, title: newEventTitle, type: newEventType, date: isoDate }
      );
      setAddModal(false);
      setNewEventTitle('');
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const renderGrid = () => {
    const days = getDaysInMonth(currentDate);
    let firstDay = getFirstDayOfMonth(currentDate) - 1; // Start Monday
    if (firstDay === -1) firstDay = 6; // Sunday is 6

    const grid = [];
    let week = [];
    
    for (let i = 0; i < firstDay; i++) {
      week.push(<View key={`empty-${i}`} style={st.dayCell} />);
    }

    for (let i = 1; i <= days; i++) {
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
      const dateStr = d.toISOString().split('T')[0];
      const hasEvents = events.some(e => e.date === dateStr);
      const hasTimetable = !!timetableSlots[dateStr];
      const isSelected = selectedDate === dateStr;
      const isToday = new Date().toISOString().split('T')[0] === dateStr;

      week.push(
        <TouchableOpacity 
          key={i} 
          style={[st.dayCell, isSelected && { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
          onPress={() => setSelectedDate(dateStr)}
        >
          <View style={[st.dayCircle, isToday && { backgroundColor: colors.primary }]}>
            <Text style={[st.dayText, isToday && { color: colors.onPrimary }]}>{i}</Text>
          </View>
          <View style={st.dotRow}>
            {hasTimetable && <View style={[st.dot, { backgroundColor: '#34D399' }]} />}
            {hasEvents && <View style={[st.dot, { backgroundColor: '#F97316' }]} />}
          </View>
        </TouchableOpacity>
      );

      if (week.length === 7) {
        grid.push(<View key={`week-${i}`} style={st.weekRow}>{week}</View>);
        week = [];
      }
    }

    if (week.length > 0) {
      while (week.length < 7) week.push(<View key={`empty-end-${week.length}`} style={st.dayCell} />);
      grid.push(<View key={`week-end`} style={st.weekRow}>{week}</View>);
    }

    return grid;
  };

  const selectedEvents = events.filter(e => e.date === selectedDate);
  const selectedTimetable = selectedDate ? timetableSlots[selectedDate] || [] : [];

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={isDark ? ['#1E1B4B', '#0F0E1A'] : ['#E0E7FF', '#F9F9FF']} style={st.hero}>
        <View style={st.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={isDark ? '#FFF' : '#070235'} />
          </TouchableOpacity>
          <Text style={[st.heroTitle, { color: isDark ? '#FFF' : '#070235' }]}>Calendar</Text>
          <TouchableOpacity onPress={() => { if(selectedDate) setAddModal(true); }}>
            <Ionicons name="add" size={24} color={isDark ? '#FFF' : '#070235'} style={{ opacity: selectedDate ? 1 : 0.4 }} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }}>
        <View style={[st.calendarCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={st.monthHeader}>
            <TouchableOpacity onPress={handlePrevMonth}><Ionicons name="chevron-back" size={20} color={colors.textSecondary} /></TouchableOpacity>
            <Text style={[st.monthTitle, { color: colors.text }]}>{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</Text>
            <TouchableOpacity onPress={handleNextMonth}><Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /></TouchableOpacity>
          </View>
          
          <View style={st.weekRow}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <Text key={i} style={[st.dayHeaderCell, { color: colors.textTertiary }]}>{d}</Text>
            ))}
          </View>
          
          {renderGrid()}
        </View>

        {selectedDate && (
          <View style={st.detailsArea}>
            <Text style={[st.detailsTitle, { color: colors.text }]}>
              {new Date(selectedDate).toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>

            {selectedEvents.length === 0 && selectedTimetable.length === 0 ? (
              <Text style={{ color: colors.textTertiary, marginTop: 12 }}>No schedule for this day.</Text>
            ) : (
              <>
                {selectedEvents.length > 0 && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[st.sectionHeader, { color: colors.textSecondary }]}>EVENTS & REMINDERS</Text>
                    {selectedEvents.map(e => (
                      <View key={e.id} style={[st.eventCard, { backgroundColor: colors.surfaceContainer, borderLeftColor: e.type === 'reminder' ? '#F97316' : '#818CF8' }]}>
                        <Ionicons name={e.type === 'reminder' ? "notifications-outline" : "calendar-outline"} size={16} color={colors.text} />
                        <Text style={{ color: colors.text, fontWeight: '600', marginLeft: 8 }}>{e.title}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {selectedTimetable.length > 0 && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[st.sectionHeader, { color: colors.textSecondary }]}>TIMETABLE</Text>
                    {selectedTimetable.map((t, i) => (
                      <View key={i} style={[st.ttCard, { backgroundColor: colors.surfaceContainerLow }]}>
                        <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '600', width: 100 }}>{t.time_slot}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontWeight: '700' }}>{t.subject}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t.title}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Add Event Modal */}
      <Modal visible={addModal} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { backgroundColor: colors.surface }]}>
            <View style={st.modalHeader}>
              <Text style={[st.modalTitle, { color: colors.text }]}>Add to {selectedDate}</Text>
              <TouchableOpacity onPress={() => setAddModal(false)}>
                <Ionicons name="close" size={22} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
            
            <View style={st.typeRow}>
              <TouchableOpacity onPress={() => setNewEventType('event')} style={[st.typeBtn, { backgroundColor: newEventType === 'event' ? colors.primary : colors.surfaceContainer }]}>
                <Text style={{ color: newEventType === 'event' ? colors.onPrimary : colors.text }}>Event</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setNewEventType('reminder')} style={[st.typeBtn, { backgroundColor: newEventType === 'reminder' ? '#F97316' : colors.surfaceContainer }]}>
                <Text style={{ color: newEventType === 'reminder' ? '#FFF' : colors.text }}>Reminder</Text>
              </TouchableOpacity>
            </View>

            <TextInput 
              style={[st.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]}
              placeholder="e.g. Math Test, or Doctor's Appointment"
              placeholderTextColor={colors.textTertiary}
              value={newEventTitle}
              onChangeText={setNewEventTitle}
              autoFocus
            />
            
            <TouchableOpacity style={[st.saveBtn, { backgroundColor: colors.primary }]} onPress={handleAddEvent}>
              <Text style={{ color: colors.onPrimary, fontWeight: '600', fontSize: 15 }}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  hero: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroTitle: { fontSize: 20, fontWeight: '700' },
  calendarCard: { margin: 16, padding: 16, borderRadius: 16, borderWidth: 1 },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  monthTitle: { fontSize: 16, fontWeight: '700' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayHeaderCell: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  dayCell: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  dayCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 14, fontWeight: '500' },
  dotRow: { flexDirection: 'row', gap: 3, marginTop: 4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  detailsArea: { paddingHorizontal: 20, paddingBottom: 40 },
  detailsTitle: { fontSize: 18, fontWeight: '700' },
  sectionHeader: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  eventCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 8, borderLeftWidth: 4 },
  ttCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 20 },
  saveBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
});

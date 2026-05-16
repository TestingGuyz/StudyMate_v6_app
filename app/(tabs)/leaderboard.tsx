import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useTheme, useAuth } from '../../lib/context';
import { getGamificationStats, GamificationStats } from '../../lib/gamification';
import {
  getFriendsList, getLeaderboard, FriendProfile,
  sendFriendRequest, acceptFriendRequest,
} from '../../lib/social';
import { useT } from '../../lib/translations';
import { PremiumTokens } from '../../constants/colors';

const PODIUM_ICONS: Array<keyof typeof Ionicons.glyphMap> = ['trophy', 'medal', 'ribbon'];

export default function LeaderboardScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const tr = useT();
  const premium = isDark ? PremiumTokens.dark : PremiumTokens.light;

  const [activeTab, setActiveTab] = useState<'leaderboard' | 'friends'>('leaderboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<FriendProfile[]>([]);
  const [friends, setFriends] = useState<{
    accepted: FriendProfile[];
    pendingIn: FriendProfile[];
    pendingOut: FriendProfile[];
  }>({ accepted: [], pendingIn: [], pendingOut: [] });

  const [friendEmail, setFriendEmail] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!studentId) return;
    if (!silent) setLoading(true);
    try {
      const [gamification, friendsData, leaderboardData] = await Promise.all([
        getGamificationStats(studentId),
        getFriendsList(studentId),
        getLeaderboard(studentId),
      ]);
      setStats(gamification);
      setFriends(friendsData);
      setLeaderboard(leaderboardData);
    } catch (err) {
      console.error('Error fetching social stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId]);

  const isFirstFocus = React.useRef(true);
  useFocusEffect(
    useCallback(() => {
      fetchData(!isFirstFocus.current);
      isFirstFocus.current = false;
    }, [fetchData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(true);
  };

  const handleAddFriend = async () => {
    if (!friendEmail.trim() || !studentId) return;
    setAddingFriend(true);
    try {
      const res = await sendFriendRequest(studentId, friendEmail);
      if (res.success) {
        Alert.alert(tr('success'), res.message);
        setFriendEmail('');
        await fetchData(true);
      } else {
        Alert.alert(tr('notice'), res.message);
      }
    } catch {
      Alert.alert(tr('error'), tr('request_failed'));
    } finally {
      setAddingFriend(false);
    }
  };

  const handleAcceptRequest = async (fromId: string) => {
    if (!studentId) return;
    try {
      await acceptFriendRequest(studentId, fromId);
      await fetchData(true);
    } catch {
      Alert.alert(tr('error'), tr('accept_failed'));
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  const renderPendingOut = () =>
    friends.pendingOut.length > 0 ? (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {tr('sent_requests')}
        </Text>
        {friends.pendingOut.map(f => (
          <View
            key={`out-${f.id}`}
            style={[styles.glassCard, {
              backgroundColor: premium.glassBg,
              borderColor: premium.glassBorder,
            }]}
          >
            <View style={styles.friendInfo}>
              <Text style={[styles.friendName, { color: colors.text }]}>{f.name}</Text>
              <Text style={[styles.friendEmail, { color: colors.textSecondary }]}>{f.email}</Text>
            </View>
            <View style={[styles.pendingBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
              <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
              <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                {tr('pending')}
              </Text>
            </View>
          </View>
        ))}
      </View>
    ) : null;

  const renderPendingIn = () =>
    friends.pendingIn.length > 0 ? (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {tr('pending_requests')}
        </Text>
        {friends.pendingIn.map(f => (
          <View
            key={`in-${f.id}`}
            style={[styles.glassCard, {
              backgroundColor: premium.glassBg,
              borderColor: premium.glassBorder,
            }]}
          >
            <View style={styles.friendInfo}>
              <Text style={[styles.friendName, { color: colors.text }]}>{f.name}</Text>
              <Text style={[styles.friendEmail, { color: colors.textSecondary }]}>{f.email}</Text>
            </View>
            <TouchableOpacity
              style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
              onPress={() => handleAcceptRequest(f.id)}
            >
              <Text style={{ color: colors.onPrimary ?? '#fff', fontSize: 12, fontWeight: '700' }}>
                {tr('accept')}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    ) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={isDark
          ? [premium.gradientStart, colors.background]
          : [premium.gradientStart, colors.background]}
        style={styles.headerGradient}
      >
        <Text style={[styles.title, { color: colors.text }]}>{tr('competition')}</Text>

        <View style={[styles.statsHeader, {
          backgroundColor: premium.glassBg,
          borderColor: premium.glassBorder,
        }]}
        >
          <View style={styles.statItem}>
            <Ionicons name="star" size={18} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text }]}>{stats?.level || 1}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{tr('level')}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Ionicons name="flash" size={18} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text }]}>{stats?.xp || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>XP</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Ionicons name="flame" size={18} color={colors.warning} />
            <Text style={[styles.statValue, { color: colors.text }]}>{stats?.streak || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{tr('streak')}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(['leaderboard', 'friends'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>
              {tr(tab)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {activeTab === 'leaderboard' ? (
          <View>
            {renderPendingIn()}
            {renderPendingOut()}

            {leaderboard.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {tr('no_data')}
              </Text>
            ) : (
              <>
                {top3.length > 0 && (
                  <View style={styles.podiumRow}>
                    {[1, 0, 2].map(slotIdx => {
                      const user = top3[slotIdx];
                      if (!user) return <View key={slotIdx} style={styles.podiumSlot} />;
                      const rank = slotIdx + 1;
                      const isMe = user.id === studentId;
                      const heights = [72, 96, 56];
                      return (
                        <View key={user.id} style={styles.podiumSlot}>
                          <View style={[styles.podiumBar, {
                            height: heights[slotIdx],
                            backgroundColor: rank === 1 ? colors.primary : colors.surfaceContainerHigh,
                            borderColor: premium.glassBorder,
                          }]}
                          >
                            <Ionicons
                              name={PODIUM_ICONS[slotIdx]}
                              size={rank === 1 ? 28 : 22}
                              color={rank === 1 ? colors.onPrimary : colors.primary}
                            />
                          </View>
                          <Text style={[styles.podiumName, { color: colors.text }]} numberOfLines={1}>
                            {user.name.split(' ')[0]}{isMe ? ` (${tr('you')})` : ''}
                          </Text>
                          <Text style={[styles.podiumXp, { color: colors.primary }]}>{user.xp} {tr('xp')}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {rest.map((user, index) => {
                  const rank = index + 4;
                  const isMe = user.id === studentId;
                  return (
                    <View
                      key={user.id}
                      style={[styles.lbItem, {
                        backgroundColor: isMe ? colors.surfaceContainer : premium.glassBg,
                        borderColor: isMe ? colors.primary : premium.glassBorder,
                      }]}
                    >
                      <Text style={[styles.rankText, { color: colors.textSecondary }]}>#{rank}</Text>
                      <View style={styles.lbInfo}>
                        <Text style={[styles.lbName, { color: colors.text }]}>
                          {user.name} {isMe ? `(${tr('you')})` : ''}
                        </Text>
                        <Text style={[styles.lbLevel, { color: colors.textSecondary }]}>
                          {tr('level')} {user.level}
                        </Text>
                      </View>
                      <Text style={[styles.lbXp, { color: colors.primary }]}>{user.xp} {tr('xp')}</Text>
                    </View>
                  );
                })}
              </>
            )}

            {stats && stats.badges.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{tr('your_badges')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                  {stats.badges.map(b => (
                    <View
                      key={b.id}
                      style={[styles.badgeCard, {
                        backgroundColor: premium.glassBg,
                        borderColor: premium.glassBorder,
                      }]}
                    >
                      <Ionicons name={b.icon as keyof typeof Ionicons.glyphMap} size={28} color={colors.primary} />
                      <Text style={[styles.badgeName, { color: colors.text }]}>{b.name}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        ) : (
          <View>
            <View style={[styles.addFriendCard, {
              backgroundColor: premium.glassBg,
              borderColor: premium.glassBorder,
            }]}
            >
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 8 }]}>
                {tr('add_friend')}
              </Text>
              <View style={styles.addInputRow}>
                <TextInput
                  style={[styles.addInput, {
                    backgroundColor: colors.surface,
                    color: colors.text,
                    borderColor: colors.border,
                  }]}
                  placeholder={tr('friend_email')}
                  placeholderTextColor={colors.textTertiary}
                  value={friendEmail}
                  onChangeText={setFriendEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: colors.primary }]}
                  onPress={handleAddFriend}
                  disabled={addingFriend}
                >
                  {addingFriend
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Ionicons name="person-add" size={20} color="#fff" />}
                </TouchableOpacity>
              </View>
            </View>

            {renderPendingIn()}
            {renderPendingOut()}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{tr('friends')}</Text>
              {friends.accepted.length === 0 ? (
                <Text style={{ color: colors.textSecondary, marginTop: 8 }}>{tr('no_friends')}</Text>
              ) : (
                friends.accepted.map(f => (
                  <View
                    key={f.id}
                    style={[styles.glassCard, {
                      backgroundColor: premium.glassBg,
                      borderColor: premium.glassBorder,
                    }]}
                  >
                    <View style={styles.friendInfo}>
                      <Text style={[styles.friendName, { color: colors.text }]}>{f.name}</Text>
                      <Text style={[styles.friendEmail, { color: colors.textSecondary }]}>
                        {tr('level')} {f.level} • {f.xp} {tr('xp')}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}
        <View style={{ height: Platform.OS === 'ios' ? 32 : 16 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerGradient: { paddingTop: Platform.OS === 'ios' ? 60 : 48, paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 32, fontWeight: '800', marginBottom: 16, letterSpacing: -0.5 },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  statItem: { alignItems: 'center', gap: 4 },
  statDivider: { width: 1, alignSelf: 'stretch', marginVertical: 4 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '600' },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: 20 },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText: { fontSize: 15, fontWeight: '600' },
  content: { flex: 1, padding: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 15, lineHeight: 22 },
  podiumRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', marginBottom: 24, gap: 8 },
  podiumSlot: { flex: 1, alignItems: 'center', maxWidth: 110 },
  podiumBar: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  podiumName: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  podiumXp: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  lbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  rankText: { width: 36, fontSize: 15, fontWeight: '700' },
  lbInfo: { flex: 1, marginLeft: 8 },
  lbName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  lbLevel: { fontSize: 12 },
  lbXp: { fontSize: 15, fontWeight: '800' },
  badgesSection: { marginTop: 8 },
  badgeCard: { padding: 16, borderRadius: 16, borderWidth: 1, alignItems: 'center', width: 104 },
  badgeName: { fontSize: 11, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  addFriendCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 24 },
  addInputRow: { flexDirection: 'row', gap: 8 },
  addInput: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16 },
  addBtn: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  glassCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  friendEmail: { fontSize: 12 },
  acceptBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
});

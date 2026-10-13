import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTrails } from '../../hooks/useTrails';
import { getMyProfile, logoutUser } from '../../services/api';

const stats = [
  { value: '18', label: 'Hikes' },
  { value: '126', label: 'km' },
  { value: '8,420', label: 'Elev. Gain (m)' },
];

const recentHikes = [
  {
    name: 'Osmeña Peak',
    date: 'Oct 04, 2026',
    distance: '7.2 km',
    elevation: '+420 m',
    time: '2h 45m',
    difficulty: 'Moderate',
  },
  {
    name: 'Mt. Manunggal',
    trailId: 'manunggal',
    date: 'Sep 28, 2026',
    distance: '8.5 km',
    elevation: '+680 m',
    time: '4h 20m',
    difficulty: 'Difficult',
  },
  {
    name: 'Badian Ridge',
    date: 'Sep 20, 2026',
    distance: '5.6 km',
    elevation: '+280 m',
    time: '2h 10m',
    difficulty: 'Easy',
  },
];

export default function Profile() {
  const router = useRouter();
  const { trails = [], error: trailsError } = useTrails();

  const [user, setUser] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  // Load the currently authenticated user from the backend.
  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError('');

    try {
      const profile = await getMyProfile();
      setUser(profile);
    } catch (err) {
      setUser(null);
      setProfileError(
        err.message || 'Unable to load your profile.'
      );
    } finally {
      setProfileLoading(false);
    }
  }, []);

  // Refresh the profile whenever the Profile tab is opened.
  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleChangePassword = () => {
    Alert.alert(
      'Change Password',
      'The change password feature will be available in a future update.'
    );
  };

  const handleEditProfile = () => {
    Alert.alert(
      'Edit Profile',
      'Profile editing will be available in a future update.'
    );
  };

  const handleLogout = () => {
    if (loggingOut) return;

    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);

            try {
              await logoutUser();
              setUser(null);
              router.replace('/login');
            } catch (err) {
              Alert.alert(
                'Logout Error',
                err.message || 'Unable to log out.'
              );
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['bottom']}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            {profileLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.avatarText}>
                {(user?.username || 'H')
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            )}
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.name} numberOfLines={1}>
              {profileLoading
                ? 'Loading profile...'
                : user?.username || 'Hiker'}
            </Text>

            <Text style={styles.username} numberOfLines={1}>
              {user?.username
                ? `@${user.username}`
                : profileError
                  ? 'Profile unavailable'
                  : 'Your hiking account'}
            </Text>

            {user?.email ? (
              <Text
                style={styles.profileEmail}
                numberOfLines={1}
              >
                {user.email}
              </Text>
            ) : null}

            <View style={styles.memberRow}>
              <View
                style={[
                  styles.memberDot,
                  profileError && styles.memberDotError,
                ]}
              />

              <Text style={styles.memberText}>
                {profileLoading
                  ? 'Connecting...'
                  : profileError
                    ? 'Not connected'
                    : 'Trail Explorer'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.editButton}
            activeOpacity={0.8}
            onPress={handleEditProfile}
          >
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Profile Connection Error */}
        {profileError ? (
          <View style={styles.profileErrorCard}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={20}
              color="#B6473B"
            />

            <View style={styles.profileErrorInfo}>
              <Text style={styles.profileErrorTitle}>
                Unable to load profile
              </Text>

              <Text style={styles.profileErrorMessage}>
                {profileError}
              </Text>

              <TouchableOpacity
                onPress={loadProfile}
                disabled={profileLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.retryText}>
                  Try again
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Stats - Existing sample data */}
        <View style={styles.statsCard}>
          {stats.map((stat, index) => (
            <React.Fragment key={stat.label}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {stat.value}
                </Text>

                <Text style={styles.statLabel}>
                  {stat.label}
                </Text>
              </View>

              {index < stats.length - 1 && (
                <View style={styles.statDivider} />
              )}
            </React.Fragment>
          ))}
        </View>

        {/* Hiking Level */}
        <View style={styles.levelCard}>
          <View style={styles.levelHeader}>
            <View>
              <Text style={styles.sectionLabel}>
                HIKING LEVEL
              </Text>

              <Text style={styles.levelTitle}>
                Mountain Explorer
              </Text>
            </View>

            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>
                LEVEL 6
              </Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>

          <View style={styles.progressLabels}>
            <Text style={styles.progressText}>
              8,420 / 10,000 m elevation
            </Text>

            <Text style={styles.progressText}>84%</Text>
          </View>
        </View>

        {/* Achievements */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Achievements
            </Text>

            <Text style={styles.sectionSubtitle}>
              Your trail milestones
            </Text>
          </View>

          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                'Achievements',
                'More achievements will be available in a future update.'
              )
            }
          >
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.achievementRow}>
          <View style={styles.achievementCard}>
            <View style={styles.achievementIcon}>
              <Text>🏔️</Text>
            </View>

            <Text style={styles.achievementTitle}>
              Peak Hunter
            </Text>

            <Text style={styles.achievementText}>
              5 peaks
            </Text>
          </View>

          <View style={styles.achievementCard}>
            <View style={styles.achievementIcon}>
              <Text>🥾</Text>
            </View>

            <Text style={styles.achievementTitle}>
              Trail Walker
            </Text>

            <Text style={styles.achievementText}>
              100 km
            </Text>
          </View>

          <View style={styles.achievementCard}>
            <View style={styles.achievementIcon}>
              <Text>⛰️</Text>
            </View>

            <Text style={styles.achievementTitle}>
              High Ground
            </Text>

            <Text style={styles.achievementText}>
              2,500 m
            </Text>
          </View>
        </View>

        {/* Recent Hikes */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Recent Hikes
            </Text>

            <Text style={styles.sectionSubtitle}>
              {trailsError
                ? 'Trail details unavailable'
                : 'Your latest trail activity'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                'Hiking History',
                'Your complete hiking history will be available in a future update.'
              )
            }
          >
            <Text style={styles.seeAll}>History</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hikesList}>
          {recentHikes.map((hike) => {
            const trail = trails.find(
              (item) =>
                hike.trailId &&
                String(item.id) === String(hike.trailId)
            );

            return (
              <View
                key={hike.name}
                style={styles.hikeCard}
              >
                <View style={styles.hikeIcon}>
                  <Text style={styles.hikeEmoji}>🥾</Text>
                </View>

                <View style={styles.hikeInfo}>
                  <View style={styles.hikeTop}>
                    <Text
                      style={styles.hikeName}
                      numberOfLines={1}
                    >
                      {trail?.name ?? hike.name}
                    </Text>

                    <Text
                      style={[
                        styles.difficulty,
                        hike.difficulty === 'Difficult'
                          ? styles.difficult
                          : hike.difficulty === 'Easy'
                            ? styles.easy
                            : styles.moderate,
                      ]}
                    >
                      {hike.difficulty}
                    </Text>
                  </View>

                  <Text style={styles.hikeDate}>
                    {hike.date}
                  </Text>

                  <View style={styles.hikeStats}>
                    <Text style={styles.hikeStat}>
                      {hike.distance}
                    </Text>

                    <Text style={styles.separator}>•</Text>

                    <Text style={styles.hikeStat}>
                      {hike.elevation}
                    </Text>

                    <Text style={styles.separator}>•</Text>

                    <Text style={styles.hikeStat}>
                      {hike.time}
                    </Text>
                  </View>
                </View>

                <Text style={styles.chevron}>›</Text>
              </View>
            );
          })}
        </View>

        {/* Account Settings */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Account Settings
            </Text>

            <Text style={styles.sectionSubtitle}>
              Manage your account and security
            </Text>
          </View>
        </View>

        <View style={styles.settingsCard}>
          <TouchableOpacity
            style={styles.settingRow}
            activeOpacity={0.7}
            onPress={handleChangePassword}
          >
            <View style={styles.settingIcon}>
              <MaterialCommunityIcons
                name="lock-reset"
                size={21}
                color="#245C43"
              />
            </View>

            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>
                Change Password
              </Text>

              <Text style={styles.settingSubtitle}>
                Update your account password
              </Text>
            </View>

            <MaterialCommunityIcons
              name="chevron-right"
              size={22}
              color="#9AA59D"
            />
          </TouchableOpacity>

          <View style={styles.settingDivider} />

          <TouchableOpacity
            style={styles.settingRow}
            activeOpacity={0.7}
            onPress={handleLogout}
            disabled={loggingOut}
          >
            <View style={styles.logoutIcon}>
              {loggingOut ? (
                <ActivityIndicator color="#B6473B" />
              ) : (
                <MaterialCommunityIcons
                  name="logout"
                  size={21}
                  color="#B6473B"
                />
              )}
            </View>

            <View style={styles.settingInfo}>
              <Text style={styles.logoutTitle}>
                {loggingOut ? 'Logging Out...' : 'Log Out'}
              </Text>

              <Text style={styles.settingSubtitle}>
                Sign out of your account
              </Text>
            </View>

            {!loggingOut && (
              <MaterialCommunityIcons
                name="chevron-right"
                size={22}
                color="#9AA59D"
              />
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>
          VERDANT • v1.0.0
        </Text>

        <View style={{ height: 25 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F6F2',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E3E9EF',
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#145C3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '800',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: 17,
    fontWeight: '800',
    color: '#26372D',
  },
  username: {
    marginTop: 2,
    fontSize: 10,
    color: '#89938C',
  },
  profileEmail: {
    marginTop: 3,
    fontSize: 9,
    color: '#68756D',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },
  memberDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#2F9E62',
    marginRight: 5,
  },
  memberDotError: {
    backgroundColor: '#B6473B',
  },
  memberText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#5C6A61',
  },
  editButton: {
    backgroundColor: '#EAF2EC',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
  },
  editText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#245C43',
  },
  profileErrorCard: {
    backgroundColor: '#FBEAE7',
    borderRadius: 12,
    padding: 13,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  profileErrorInfo: {
    flex: 1,
    marginLeft: 9,
  },
  profileErrorTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#A33C32',
  },
  profileErrorMessage: {
    fontSize: 11,
    lineHeight: 16,
    color: '#80443D',
    marginTop: 4,
  },
  retryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#A33C32',
    marginTop: 8,
  },
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginTop: 12,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 19,
    fontWeight: '900',
    color: '#26372D',
  },
  statLabel: {
    marginTop: 3,
    fontSize: 9,
    color: '#89938C',
    textAlign: 'center',
  },
  statDivider: {
    height: 30,
    width: 1,
    backgroundColor: '#E5EAE6',
  },
  levelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginTop: 12,
    padding: 16,
    elevation: 1,
  },
  levelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#87928A',
    letterSpacing: 0.8,
  },
  levelTitle: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '900',
    color: '#26372D',
  },
  levelBadge: {
    backgroundColor: '#EAF2EC',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  levelBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#2F7D55',
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#E4E9E5',
    borderRadius: 5,
    marginTop: 15,
    overflow: 'hidden',
  },
  progressFill: {
    width: '84%',
    height: '100%',
    backgroundColor: '#2F7D55',
  },
  progressLabels: {
    marginTop: 7,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    fontSize: 9,
    color: '#7C8780',
  },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#26372D',
  },
  sectionSubtitle: {
    marginTop: 3,
    fontSize: 10,
    color: '#87918A',
  },
  seeAll: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2F7D55',
  },
  achievementRow: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  achievementCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 11,
    marginHorizontal: 4,
    elevation: 1,
  },
  achievementIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    backgroundColor: '#EAF2EC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  achievementTitle: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: '900',
    color: '#26372D',
  },
  achievementText: {
    marginTop: 3,
    fontSize: 9,
    color: '#89938C',
  },
  hikesList: {
    marginBottom: 12,
  },
  hikeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
  },
  hikeIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: '#EAF2EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hikeEmoji: {
    fontSize: 19,
  },
  hikeInfo: {
    flex: 1,
    marginLeft: 11,
  },
  hikeTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hikeName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#26372D',
  },
  difficulty: {
    fontSize: 8,
    fontWeight: '900',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  easy: {
    backgroundColor: '#E4F2E9',
    color: '#2F7D55',
  },
  moderate: {
    backgroundColor: '#FFF0DA',
    color: '#AA7026',
  },
  difficult: {
    backgroundColor: '#FBE6E2',
    color: '#A94C3D',
  },
  hikeDate: {
    marginTop: 3,
    fontSize: 9,
    color: '#89938C',
  },
  hikeStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    flexWrap: 'wrap',
  },
  hikeStat: {
    fontSize: 9,
    color: '#68756D',
  },
  separator: {
    marginHorizontal: 5,
    color: '#B2BAB5',
  },
  chevron: {
    fontSize: 24,
    color: '#A3ADA6',
    marginLeft: 6,
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    paddingHorizontal: 14,
    elevation: 1,
  },
  settingRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  settingIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EAF2EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FBEAE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingInfo: {
    flex: 1,
    marginLeft: 12,
  },
  settingTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#26372D',
  },
  logoutTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B6473B',
  },
  settingSubtitle: {
    marginTop: 4,
    fontSize: 10,
    color: '#89938C',
  },
  settingDivider: {
    height: 1,
    backgroundColor: '#EDF0ED',
  },
  version: {
    marginTop: 18,
    textAlign: 'center',
    fontSize: 9,
    color: '#9AA39D',
    fontWeight: '700',
  },
});
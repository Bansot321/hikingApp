import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTrails } from '../../hooks/useTrails';

const NEARBY_RADIUS_KM = 25;

const recentActivities = [
  {
    name: 'Osmeña Peak',
    date: 'Oct 04, 2026',
    distance: '7.2 km',
    time: '2h 45m',
  },
  {
    name: 'Mt. Manunggal',
    trailId: 'manunggal',
    date: 'Sep 28, 2026',
    distance: '8.5 km',
    time: '4h 20m',
  },
];

function getTrailCoordinates(trail) {
  const latitude = Number(trail.latitude ?? trail.lat);
  const longitude = Number(
    trail.longitude ?? trail.lng ?? trail.lon
  );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return (
    2 *
    earthRadiusKm *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

function formatDuration(duration) {
  if (!duration) return '—';

  return String(duration)
    .replace(/\s*\(route dependent\)/i, '')
    .replace(/\s+hrs?\b/i, 'h')
    .replace(/\s+hours?\b/i, 'h')
    .replace(/\s+minutes?\b/i, 'm');
}

export default function Home() {
  const router = useRouter();
  const { trails = [], error, loading } = useTrails();

  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState(false);

  const loadLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationError(false);

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        setUserLocation(null);
        setLocationError(true);
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      setUserLocation(location);
      return location;
    } catch (e) {
      setLocationError(true);
      setUserLocation(null);
      return null;
    } finally {
      setLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocation();
  }, [loadLocation]);

  const nearbyTrails = userLocation
    ? trails
        .map((trail) => {
          const coordinates = getTrailCoordinates(trail);
          if (!coordinates) return null;

          const distanceFromUserKm = getDistanceKm(
            userLocation.latitude,
            userLocation.longitude,
            coordinates.latitude,
            coordinates.longitude
          );

          return { ...trail, distanceFromUserKm };
        })
        .filter(
          (trail) =>
            trail !== null &&
            trail.distanceFromUserKm <= NEARBY_RADIUS_KM
        )
        .sort(
          (a, b) =>
            a.distanceFromUserKm - b.distanceFromUserKm
        )
    : [];

  const recommendedTrail =
    nearbyTrails[0] ?? trails[0] ?? null;

  const openTrailOnMap = (trail) => {
    if (!trail?.id) return;

    router.push({
      pathname: '/(tabs)/maps',
      params: {
        trailId: String(trail.id),
      },
    });
  };

  const openMap = () => {
    router.push('/(tabs)/maps');
  };

  const openNearbyMap = async () => {
    const location = await loadLocation();

    if (!location) {
      Alert.alert(
        'Location required',
        'Allow location permission so the app can find hiking trails near you.'
      );
      return;
    }

    router.push({
      pathname: '/(tabs)/maps',
      params: {
        nearbyOnly: 'true',
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        radiusKm: String(NEARBY_RADIUS_KM),
      },
    });
  };

  const getDifficultyStyle = (difficulty) => {
    const value = String(difficulty ?? '').toLowerCase();

    if (value === 'easy') return styles.easy;

    if (['hard', 'difficult'].includes(value)) {
      return styles.difficult;
    }

    return styles.moderate;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Welcome */}
        <View style={styles.welcomeRow}>
          <View>
            <Text style={styles.greeting}>Good morning,</Text>
            <Text style={styles.userName}>Trail Explorer 👋</Text>
          </View>
        </View>

        {/* Recommended Trail */}
        <Text style={styles.sectionLabel}>RECOMMENDED FOR YOU</Text>

        <View style={styles.heroCard}>
          <View style={styles.heroImage}>
            <Text style={styles.mountainEmoji}>⛰️</Text>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>TOP PICK</Text>
            </View>
          </View>

          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>
              {recommendedTrail?.name ??
                (loading ? 'Loading trails...' : 'No trail available')}
            </Text>

            <Text style={styles.heroLocation}>
              📍 {recommendedTrail?.region ?? 'Trail location unavailable'}
            </Text>

            <View style={styles.ratingRow}>
              <Text style={styles.rating}>
                {recommendedTrail?.difficulty ?? '—'}
              </Text>
              <Text style={styles.ratingText}>Difficulty</Text>
            </View>

            <View style={styles.heroStats}>
              <View>
                <Text style={styles.heroStatValue}>
                  {recommendedTrail?.distanceKm != null
                    ? `${recommendedTrail.distanceKm} km`
                    : '—'}
                </Text>
                <Text style={styles.heroStatLabel}>Distance</Text>
              </View>

              <View>
                <Text style={styles.heroStatValue}>
                  {recommendedTrail?.elevationM != null
                    ? `${recommendedTrail.elevationM} m`
                    : '—'}
                </Text>
                <Text style={styles.heroStatLabel}>Elevation</Text>
              </View>

              <View>
                <Text style={styles.heroStatValue}>
                  {formatDuration(recommendedTrail?.duration)}
                </Text>
                <Text style={styles.heroStatLabel}>Est. Time</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.viewTrailButton,
                !recommendedTrail && styles.disabledButton,
              ]}
              onPress={() => openTrailOnMap(recommendedTrail)}
              disabled={!recommendedTrail}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.viewTrailText}>View Trail</Text>
              <Text style={styles.buttonArrow}>→</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={openMap}
            activeOpacity={0.8}
          >
            <View style={styles.actionIcon}>
              <Text>🗺️</Text>
            </View>
            <Text style={styles.actionTitle}>Explore</Text>
            <Text style={styles.actionSubtitle}>Find trails</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => openTrailOnMap(recommendedTrail)}
            disabled={!recommendedTrail}
            activeOpacity={0.8}
          >
            <View style={styles.actionIcon}>
              <Text>🥾</Text>
            </View>
            <Text style={styles.actionTitle}>Start Hike</Text>
            <Text style={styles.actionSubtitle}>Track route</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={openNearbyMap}
            activeOpacity={0.8}
          >
            <View style={styles.actionIcon}>
              <Text>📍</Text>
            </View>
            <Text style={styles.actionTitle}>Nearby</Text>
            <Text style={styles.actionSubtitle}>Trails nearby</Text>
          </TouchableOpacity>
        </View>

        {/* Nearby Trails */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Nearby Trails</Text>
            <Text style={styles.sectionSubtitle}>
              Within {NEARBY_RADIUS_KM} km of your location
            </Text>
          </View>

          <TouchableOpacity
            onPress={openNearbyMap}
            activeOpacity={0.8}
          >
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {locationLoading && nearbyTrails.length === 0 ? (
          <View style={styles.locationMessage}>
            <ActivityIndicator color="#245C43" />
            <Text style={styles.sectionSubtitle}>
              Finding your location...
            </Text>
          </View>
        ) : nearbyTrails.length > 0 ? (
          nearbyTrails.map((trail) => (
            <TouchableOpacity
              key={trail.id}
              style={styles.trailCard}
              activeOpacity={0.8}
              onPress={() => openTrailOnMap(trail)}
              accessibilityRole="button"
              accessibilityLabel={`View ${trail.name} on map`}
            >
              <View style={styles.trailIcon}>
                <Text style={styles.trailEmoji}>🥾</Text>
              </View>

              <View style={styles.trailInfo}>
                <View style={styles.trailTitleRow}>
                  <Text style={styles.trailName}>{trail.name}</Text>
                  <Text
                    style={[
                      styles.difficulty,
                      getDifficultyStyle(trail.difficulty),
                    ]}
                  >
                    {trail.difficulty ?? 'Unknown'}
                  </Text>
                </View>

                <Text style={styles.trailLocation}>
                  {trail.region ?? 'Location unavailable'}
                </Text>

                <View style={styles.trailStats}>
                  <Text style={styles.trailStat}>
                    {trail.distanceKm != null
                      ? `${trail.distanceKm} km trail`
                      : 'Distance —'}
                  </Text>
                  <Text style={styles.separator}>•</Text>
                  <Text style={styles.trailStat}>
                    {trail.distanceFromUserKm.toFixed(1)} km away
                  </Text>
                </View>
              </View>

              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.sectionSubtitle}>
            {locationError
              ? 'Allow location access to find nearby trails.'
              : error
              ? "Couldn't load trails."
              : loading
              ? 'Loading trails...'
              : `No trails found within ${NEARBY_RADIUS_KM} km.`}
          </Text>
        )}

        {/* Hiking Progress */}
        <Text style={styles.sectionTitle}>Hiking Progress</Text>

        <View style={styles.progressCard}>
          <View style={styles.progressTop}>
            <View>
              <Text style={styles.progressLabel}>CURRENT LEVEL</Text>
              <Text style={styles.progressTitle}>Mountain Explorer</Text>
            </View>

            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>LEVEL 6</Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={styles.progressValue} />
          </View>

          <View style={styles.progressBottom}>
            <Text style={styles.progressSmall}>
              8,420 / 10,000 m elevation
            </Text>
            <Text style={styles.progressSmall}>84%</Text>
          </View>

          <View style={styles.homeStats}>
            <View style={styles.homeStat}>
              <Text style={styles.homeStatValue}>18</Text>
              <Text style={styles.homeStatLabel}>Hikes</Text>
            </View>
            <View style={styles.homeStat}>
              <Text style={styles.homeStatValue}>126</Text>
              <Text style={styles.homeStatLabel}>km</Text>
            </View>
            <View style={styles.homeStat}>
              <Text style={styles.homeStatValue}>8,420</Text>
              <Text style={styles.homeStatLabel}>Elev. Gain</Text>
            </View>
          </View>
        </View>

        {/* Recent Activity - intentionally not clickable */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <Text style={styles.sectionSubtitle}>Your latest hikes</Text>
          </View>
        </View>

        {recentActivities.map((activity) => {
          const trail = trails.find(
            (item) => String(item.id) === activity.trailId
          );

          return (
            <View key={activity.name} style={styles.activityCard}>
              <View style={styles.activityIcon}>
                <Text>🥾</Text>
              </View>

              <View style={styles.activityInfo}>
                <Text style={styles.activityName}>
                  {trail?.name ?? activity.name}
                </Text>
                <Text style={styles.activityDate}>{activity.date}</Text>
              </View>

              <View style={styles.activityRight}>
                <Text style={styles.activityDistance}>
                  {activity.distance}
                </Text>
                <Text style={styles.activityTime}>{activity.time}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F6F2' },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 30 },
  welcomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: { fontSize: 12, color: '#78837B' },
  userName: { marginTop: 3, fontSize: 22, fontWeight: '900', color: '#26372D' },
  notificationButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center', elevation: 2,
  },
  notificationIcon: { fontSize: 19 },
  notificationDot: {
    position: 'absolute', top: 9, right: 10, width: 7, height: 7,
    borderRadius: 4, backgroundColor: '#D56D42',
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1,
    color: '#6E7B72', marginBottom: 9,
  },
  heroCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden',
    elevation: 3, marginBottom: 22,
  },
  heroImage: {
    height: 145, backgroundColor: '#DDE8DF',
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  mountainEmoji: { fontSize: 65 },
  heroBadge: {
    position: 'absolute', top: 12, left: 12, backgroundColor: '#245C43',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
  },
  heroBadgeText: { fontSize: 9, fontWeight: '900', color: '#FFFFFF' },
  heroContent: { padding: 16 },
  heroTitle: { fontSize: 20, fontWeight: '900', color: '#26372D' },
  heroLocation: { marginTop: 5, fontSize: 11, color: '#77827B' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  rating: { fontSize: 12, fontWeight: '900', color: '#B87825' },
  ratingText: { marginLeft: 7, fontSize: 10, color: '#7B857F' },
  heroStats: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#EDF0ED',
  },
  heroStatValue: { fontSize: 13, fontWeight: '900', color: '#26372D' },
  heroStatLabel: { marginTop: 3, fontSize: 9, color: '#88928B' },
  viewTrailButton: {
    marginTop: 15, height: 44, borderRadius: 12, backgroundColor: '#245C43',
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
  },
  disabledButton: { opacity: 0.5 },
  viewTrailText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  buttonArrow: { marginLeft: 8, color: '#FFFFFF', fontSize: 17 },
  sectionTitle: {
    fontSize: 17, fontWeight: '900', color: '#26372D', marginBottom: 11,
  },
  quickActions: {
    flexDirection: 'row', marginHorizontal: -4, marginBottom: 22,
  },
  actionCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14,
    marginHorizontal: 4, padding: 10, elevation: 2,
  },
  actionIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#EAF2EC',
    justifyContent: 'center', alignItems: 'center',
  },
  actionTitle: { marginTop: 8, fontSize: 11, fontWeight: '800', color: '#26372D' },
  actionSubtitle: { marginTop: 2, fontSize: 8, color: '#8A948D' },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 2, marginBottom: 11,
  },
  sectionSubtitle: { marginTop: 3, fontSize: 10, color: '#849087' },
  seeAll: { fontSize: 11, fontWeight: '800', color: '#2F7D55' },
  locationMessage: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14,
  },
  trailCard: {
    backgroundColor: '#FFFFFF', borderRadius: 15, padding: 13,
    marginBottom: 9, flexDirection: 'row', alignItems: 'center', elevation: 1,
  },
  trailIcon: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: '#EAF2EC',
    justifyContent: 'center', alignItems: 'center',
  },
  trailEmoji: { fontSize: 21 },
  trailInfo: { flex: 1, marginLeft: 11 },
  trailTitleRow: { flexDirection: 'row', alignItems: 'center' },
  trailName: { flex: 1, fontSize: 13, fontWeight: '800', color: '#26372D' },
  difficulty: {
    fontSize: 8, fontWeight: '900', paddingHorizontal: 7,
    paddingVertical: 4, borderRadius: 8, overflow: 'hidden',
  },
  easy: { backgroundColor: '#E4F2E9', color: '#2F7D55' },
  moderate: { backgroundColor: '#FFF0DA', color: '#AA7026' },
  difficult: { backgroundColor: '#FBE6E2', color: '#A94C3D' },
  trailLocation: { marginTop: 3, fontSize: 9, color: '#89938C' },
  trailStats: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  trailStat: { fontSize: 9, color: '#68756D' },
  separator: { marginHorizontal: 5, color: '#B2BAB5' },
  chevron: { fontSize: 25, color: '#A3ADA6', marginLeft: 6 },
  progressCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    marginBottom: 22, elevation: 2,
  },
  progressTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  progressLabel: {
    fontSize: 8, fontWeight: '900', color: '#87928A', letterSpacing: 0.8,
  },
  progressTitle: { marginTop: 4, fontSize: 16, fontWeight: '900', color: '#26372D' },
  levelBadge: {
    backgroundColor: '#EAF2EC', paddingHorizontal: 9, paddingVertical: 6,
    borderRadius: 10,
  },
  levelText: { fontSize: 9, fontWeight: '900', color: '#2F7D55' },
  progressTrack: {
    height: 8, borderRadius: 5, backgroundColor: '#E4E9E5',
    marginTop: 15, overflow: 'hidden',
  },
  progressValue: { width: '84%', height: '100%', backgroundColor: '#2F7D55' },
  progressBottom: {
    marginTop: 7, flexDirection: 'row', justifyContent: 'space-between',
  },
  progressSmall: { fontSize: 9, color: '#7C8780' },
  homeStats: {
    flexDirection: 'row', marginTop: 16, paddingTop: 13,
    borderTopWidth: 1, borderTopColor: '#EDF0ED',
  },
  homeStat: { flex: 1, alignItems: 'center' },
  homeStatValue: { fontSize: 16, fontWeight: '900', color: '#26372D' },
  homeStatLabel: { marginTop: 3, fontSize: 9, color: '#89938C' },
  activityCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12,
    marginBottom: 8, flexDirection: 'row', alignItems: 'center',
  },
  activityIcon: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: '#EAF2EC',
    justifyContent: 'center', alignItems: 'center',
  },
  activityInfo: { flex: 1, marginLeft: 11 },
  activityName: { fontSize: 12, fontWeight: '800', color: '#26372D' },
  activityDate: { marginTop: 3, fontSize: 9, color: '#89938C' },
  activityRight: { alignItems: 'flex-end' },
  activityDistance: { fontSize: 11, fontWeight: '800', color: '#2F7D55' },
  activityTime: { marginTop: 3, fontSize: 9, color: '#89938C' },
});
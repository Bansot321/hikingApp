
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TrailMarker } from '../../components/TrailBubble';
import TrailSheet from '../../components/TrailSheet';
import { INITIAL_REGION } from '../../constants/trailConfig';
import { useTrails } from '../../hooks/useTrails';

const DIFFICULTY_FILTERS = [
  'All',
  'Easy',
  'Moderate',
  'Hard',
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

export default function MapsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const mapRef = useRef(null);

  const {
    trails = [],
    loading,
    error,
    refetch,
  } = useTrails();

  const nearbyOnly = params.nearbyOnly === 'true';

  const requestedTrailId = Array.isArray(params.trailId)
    ? params.trailId[0]
    : params.trailId;

  const parameterLatitude = Number(params.latitude);
  const parameterLongitude = Number(params.longitude);
  const parameterRadius = Number(params.radiusKm);

  const hasParameterLocation =
    Number.isFinite(parameterLatitude) &&
    Number.isFinite(parameterLongitude) &&
    parameterLatitude >= -90 &&
    parameterLatitude <= 90 &&
    parameterLongitude >= -180 &&
    parameterLongitude <= 180;

  const nearbyRadiusKm =
    Number.isFinite(parameterRadius) && parameterRadius > 0
      ? parameterRadius
      : 25;

  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [mapReady, setMapReady] = useState(false);

  const [userLocation, setUserLocation] = useState(
    hasParameterLocation
      ? {
          latitude: parameterLatitude,
          longitude: parameterLongitude,
        }
      : null
  );

  const [locationLoading, setLocationLoading] = useState(false);
  const [handledTrailId, setHandledTrailId] = useState(null);
  const [nearbyCentered, setNearbyCentered] = useState(false);

  const validTrails = useMemo(
    () =>
      trails.filter(
        (trail) => getTrailCoordinates(trail) !== null
      ),
    [trails]
  );

  // Calculate the distance of every trail from the user's location.
  const nearbyMapTrails = useMemo(() => {
    if (!nearbyOnly) return validTrails;
    if (!userLocation) return [];

    return validTrails
      .map((trail) => {
        const coordinates = getTrailCoordinates(trail);

        if (!coordinates) return null;

        const distanceFromUserKm = getDistanceKm(
          userLocation.latitude,
          userLocation.longitude,
          coordinates.latitude,
          coordinates.longitude
        );

        return {
          ...trail,
          distanceFromUserKm,
        };
      })
      .filter(
        (trail) =>
          trail !== null &&
          trail.distanceFromUserKm <= nearbyRadiusKm
      )
      .sort(
        (a, b) =>
          a.distanceFromUserKm - b.distanceFromUserKm
      );
  }, [
    validTrails,
    nearbyOnly,
    userLocation,
    nearbyRadiusKm,
  ]);

  // Apply search and difficulty filters.
  const visibleTrails = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return nearbyMapTrails.filter((trail) => {
      const difficulty = String(
        trail.difficulty ?? ''
      ).toLowerCase();

      const matchesDifficulty =
        filter === 'All' ||
        difficulty === filter.toLowerCase() ||
        (filter === 'Hard' && difficulty === 'difficult');

      const matchesSearch =
        !normalizedSearch ||
        String(trail.name ?? '')
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(trail.region ?? '')
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesDifficulty && matchesSearch;
    });
  }, [nearbyMapTrails, filter, search]);

  // Adjust the map to show the provided trails.
  const fitTrails = useCallback((items) => {
    if (!mapRef.current || items.length === 0) return;

    const coordinates = items
      .map((trail) => getTrailCoordinates(trail))
      .filter(Boolean);

    if (coordinates.length === 0) return;

    if (coordinates.length === 1) {
      mapRef.current.animateToRegion(
        {
          ...coordinates[0],
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        },
        650
      );
      return;
    }

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: {
        top: 100,
        right: 55,
        bottom: 220,
        left: 55,
      },
      animated: true,
    });
  }, []);

  // Request and retrieve the user's current GPS location.
  const getCurrentLocation = useCallback(async () => {
    try {
      setLocationLoading(true);

      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert(
          'Location permission required',
          'Allow location access to show your current position and nearby trails.'
        );
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
      Alert.alert(
        'Unable to get location',
        'Please check that your phone location services are enabled and try again.'
      );
      return null;
    } finally {
      setLocationLoading(false);
    }
  }, []);

  // Get GPS when Nearby mode is opened without location parameters.
  useEffect(() => {
    if (!nearbyOnly || hasParameterLocation || userLocation) {
      return;
    }

    getCurrentLocation();
  }, [
    nearbyOnly,
    hasParameterLocation,
    userLocation,
    getCurrentLocation,
  ]);

  // Center the map on the user's location in Nearby mode.
  useEffect(() => {
    if (
      !mapReady ||
      !nearbyOnly ||
      !userLocation ||
      nearbyCentered
    ) {
      return;
    }

    mapRef.current?.animateToRegion(
      {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      },
      650
    );

    setNearbyCentered(true);
  }, [
    mapReady,
    nearbyOnly,
    userLocation,
    nearbyCentered,
  ]);

  // Select and zoom to a trail requested from another screen.
  useEffect(() => {
    if (
      !mapReady ||
      !requestedTrailId ||
      validTrails.length === 0 ||
      handledTrailId === String(requestedTrailId)
    ) {
      return;
    }

    const targetTrail = validTrails.find(
      (trail) =>
        String(trail.id) === String(requestedTrailId)
    );

    if (!targetTrail) return;

    const coordinates = getTrailCoordinates(targetTrail);
    if (!coordinates) return;

    setFilter('All');
    setSearch('');
    setSelected(targetTrail);

    mapRef.current?.animateToRegion(
      {
        ...coordinates,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      },
      650
    );

    setHandledTrailId(String(requestedTrailId));
  }, [
    mapReady,
    requestedTrailId,
    validTrails,
    handledTrailId,
  ]);

  // Fit filtered trails in normal Maps mode.
  // Do not override Nearby or selected-trail positioning.
  useEffect(() => {
    if (!mapReady || visibleTrails.length === 0) return;
    if (nearbyOnly || requestedTrailId) return;

    fitTrails(visibleTrails);
  }, [
    mapReady,
    filter,
    fitTrails,
    nearbyOnly,
    requestedTrailId,
    visibleTrails.length,
  ]);

  const selectTrail = useCallback((trail) => {
    setSelected(trail);

    const coordinates = getTrailCoordinates(trail);

    if (coordinates) {
      mapRef.current?.animateToRegion(
        {
          ...coordinates,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        },
        500
      );
    }
  }, []);

  const resetMap = useCallback(async () => {
    const location = await getCurrentLocation();

    if (location) {
      mapRef.current?.animateToRegion(
        {
          ...location,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        },
        650
      );
    }
  }, [getCurrentLocation]);

  const showAll = useCallback(() => {
    setSelected(null);
    setSearch('');
    setFilter('All');

    if (nearbyOnly && userLocation) {
      mapRef.current?.animateToRegion(
        {
          ...userLocation,
          latitudeDelta: 0.12,
          longitudeDelta: 0.12,
        },
        650
      );
    } else {
      fitTrails(validTrails);
    }
  }, [
    nearbyOnly,
    userLocation,
    fitTrails,
    validTrails,
  ]);

  const retry = useCallback(() => {
    if (typeof refetch === 'function') {
      refetch();
    }
  }, [refetch]);

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top']}
    >
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={
            hasParameterLocation && nearbyOnly
              ? {
                  latitude: parameterLatitude,
                  longitude: parameterLongitude,
                  latitudeDelta: 0.12,
                  longitudeDelta: 0.12,
                }
              : INITIAL_REGION
          }
          onMapReady={() => setMapReady(true)}
          onPress={() => setSelected(null)}
          showsCompass
          showsUserLocation
          showsMyLocationButton={false}
          toolbarEnabled={false}
          moveOnMarkerPress={false}
          loadingEnabled
        >
          {visibleTrails.map((trail) => (
            <TrailMarker
              key={trail.id}
              trail={trail}
              selected={
                String(selected?.id) === String(trail.id)
              }
              onPress={() => selectTrail(trail)}
            />
          ))}
        </MapView>

        {/* Search, Nearby badge, difficulty filters, and trail count */}
        <View style={styles.topPanel}>
          <View style={styles.searchBox}>
            <MaterialCommunityIcons
              name="magnify"
              size={22}
              color="#66756A"
            />

            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={
                nearbyOnly
                  ? 'Search nearby trails...'
                  : 'Search hiking trails...'
              }
              placeholderTextColor="#89938C"
              returnKeyType="search"
            />

            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch('')}
              >
                <MaterialCommunityIcons
                  name="close-circle"
                  size={20}
                  color="#89938C"
                />
              </TouchableOpacity>
            )}
          </View>

          {nearbyOnly && (
            <View style={styles.nearbyBadge}>
              <MaterialCommunityIcons
                name="crosshairs-gps"
                size={15}
                color="#245C43"
              />
              <Text style={styles.nearbyBadgeText}>
                Nearby trails · {nearbyRadiusKm} km radius
              </Text>
            </View>
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersRow}
          >
            {DIFFICULTY_FILTERS.map((item) => {
              const active = filter === item;

              return (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.filterChip,
                    active && styles.filterChipActive,
                  ]}
                  onPress={() => setFilter(item)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.filterText,
                      active && styles.filterTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Trail count now sits directly below the filters */}
          <View style={styles.resultBadge}>
            <Text style={styles.resultText}>
              {visibleTrails.length}{' '}
              {visibleTrails.length === 1
                ? 'trail found'
                : 'trails found'}
            </Text>
          </View>
        </View>

        {/* Map controls */}
        <View style={styles.mapControls}>
          <TouchableOpacity
            style={styles.mapControlButton}
            onPress={resetMap}
            activeOpacity={0.8}
            accessibilityLabel="Center on my location"
          >
            {locationLoading ? (
              <ActivityIndicator
                size="small"
                color="#245C43"
              />
            ) : (
              <MaterialCommunityIcons
                name="crosshairs-gps"
                size={23}
                color="#245C43"
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mapControlButton}
            onPress={showAll}
            activeOpacity={0.8}
            accessibilityLabel="Show trails"
          >
            <MaterialCommunityIcons
              name="map-marker-multiple"
              size={23}
              color="#245C43"
            />
          </TouchableOpacity>
        </View>

        {/* Loading and error states */}
        {loading && trails.length === 0 && (
          <View style={styles.messageCard}>
            <ActivityIndicator color="#245C43" />
            <Text style={styles.messageText}>
              Loading trails...
            </Text>
          </View>
        )}

        {error && trails.length === 0 && (
          <View style={styles.messageCard}>
            <Text style={styles.messageText}>
              Couldn't load trails.
            </Text>
            <TouchableOpacity onPress={retry}>
              <Text style={styles.retryText}>
                Try again
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {nearbyOnly &&
          !userLocation &&
          !locationLoading && (
            <View style={styles.messageCard}>
              <Text style={styles.messageText}>
                Your location is required to find nearby trails.
              </Text>
              <TouchableOpacity
                onPress={getCurrentLocation}
              >
                <Text style={styles.retryText}>
                  Get my location
                </Text>
              </TouchableOpacity>
            </View>
          )}

        {!loading &&
          visibleTrails.length === 0 &&
          !(error && trails.length === 0) &&
          (!nearbyOnly || userLocation) && (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons
                name="map-search-outline"
                size={28}
                color="#77877B"
              />
              <Text style={styles.emptyTitle}>
                No trails found
              </Text>
              <Text style={styles.emptyText}>
                {nearbyOnly
                  ? `There are no trails within ${nearbyRadiusKm} km matching your filters.`
                  : 'Try changing your search or difficulty filter.'}
              </Text>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={showAll}
              >
                <Text style={styles.clearButtonText}>
                  Clear filters
                </Text>
              </TouchableOpacity>
            </View>
          )}

        {/* Selected trail details */}
        <TrailSheet
          trail={selected}
          onClose={() => setSelected(null)}
          onGetDirections={(trail) => {
            router.push({
              pathname: '/(tabs)/livetopo',
              params: {
                trailId: String(trail.id),
              },
            });
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F6F2',
  },
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  topPanel: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
  },
  searchBox: {
    minHeight: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOpacity: 0.12,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      },
    }),
  },
  searchInput: {
    flex: 1,
    marginLeft: 9,
    paddingVertical: 10,
    fontSize: 13,
    color: '#26372D',
  },
  nearbyBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    elevation: 2,
  },
  nearbyBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#245C43',
  },
  filtersRow: {
    paddingTop: 9,
    paddingBottom: 5,
    gap: 7,
  },
  filterChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    elevation: 2,
  },
  filterChipActive: {
    backgroundColor: '#245C43',
  },
  filterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#516057',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  resultBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 4,
    backgroundColor: '#245C43',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  resultText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  mapControls: {
    position: 'absolute',
    right: 14,
    bottom: 145,
    gap: 10,
  },
  mapControlButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  messageCard: {
    position: 'absolute',
    alignSelf: 'center',
    top: '44%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    maxWidth: '85%',
    elevation: 4,
    gap: 8,
  },
  messageText: {
    color: '#26372D',
    fontSize: 12,
    textAlign: 'center',
  },
  retryText: {
    color: '#2F7D55',
    fontSize: 12,
    fontWeight: '900',
    padding: 5,
  },
  emptyCard: {
    position: 'absolute',
    bottom: 35,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    elevation: 4,
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '900',
    color: '#26372D',
  },
  emptyText: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    color: '#78837B',
  },
  clearButton: {
    marginTop: 12,
    paddingHorizontal: 15,
    paddingVertical: 9,
    backgroundColor: '#EAF2EC',
    borderRadius: 10,
  },
  clearButtonText: {
    color: '#245C43',
    fontSize: 11,
    fontWeight: '900',
  },
});

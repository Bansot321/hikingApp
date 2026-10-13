import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Circle, Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTrails } from '../../hooks/useTrails';
import { saveTrack } from '../../services/trackService';

const DEFAULT_REGION = {
  latitude: 10.3157,
  longitude: 123.8854,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const ORANGE = '#FF8A00';
const GREEN = '#22C55E';
const BLUE = '#2563EB';
const DARK = '#17211B';
const MUTED = '#66736B';
const RED = '#DC2626';
const AMBER = '#F59E0B';
const DARK_GREEN = '#16A34A';

// ---------------------------------------------------------------------------
// Walking-route settings
//
// Free, key-less OpenStreetMap foot-routing server (OSRM hosted by FOSSGIS).
// No account, no API key and no request counter. Its fair-use rule is
// "max 1 request per second", so this screen requests a route only once per
// destination and re-requests at most once every 10 seconds, and only when
// you walk off the current route. If the server is unreachable, a saved local route is used when available;
// otherwise the screen falls back to a straight dashed guide line.
// ---------------------------------------------------------------------------
const ROUTING_BASE_URL =
  'https://routing.openstreetmap.de/routed-foot/route/v1/driving';
const ROUTING_USER_AGENT = 'HikingApp/1.0 (Expo React Native)';
const ROUTE_TIMEOUT_MS = 12000;
const MIN_REFETCH_MS = 10000;
const STRAIGHT_RETRY_MS = 30000;
const OFF_ROUTE_METERS = 40;
const ARRIVAL_METERS = 25;
const MAX_ACCEPTED_ACCURACY_M = 100;

// ---------------------------------------------------------------------------
// Track recording settings
// ---------------------------------------------------------------------------
const MAX_RECORD_ACCURACY_M = 30; // ignore fixes less accurate than this
const MIN_RECORD_STEP_M = 4; // ignore GPS jitter smaller than this
const MAX_RECORD_SPEED_MPS = 15; // ignore impossible GPS jumps
const ALTITUDE_THRESHOLD_M = 3; // smooths noisy GPS altitude for ascent

const EARTH_RADIUS_M = 6371000;
const toRad = (degrees) => (degrees * Math.PI) / 180;

// Great-circle distance between two coordinates, in meters.
function distanceMeters(a, b) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Distance from point p to the segment a-b, in meters.
// Uses a local flat projection, which is accurate over hiking distances.
function distanceToSegmentMeters(p, a, b) {
  const metersPerDegLat = (EARTH_RADIUS_M * Math.PI) / 180;
  const metersPerDegLng = metersPerDegLat * Math.cos(toRad(p.latitude));

  const ax = (a.longitude - p.longitude) * metersPerDegLng;
  const ay = (a.latitude - p.latitude) * metersPerDegLat;
  const bx = (b.longitude - p.longitude) * metersPerDegLng;
  const by = (b.latitude - p.latitude) * metersPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  let t = lengthSquared === 0 ? 0 : -(ax * dx + ay * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * dx;
  const cy = ay + t * dy;

  return Math.sqrt(cx * cx + cy * cy);
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '--';
  if (meters < 1000) return `${Math.round(meters)} m`;

  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '--';

  const totalMinutes = Math.max(1, Math.round(seconds / 60));

  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

// Request a walking route from the free OSM foot-routing server.
async function fetchFootRoute(from, to, signal) {
  const url =
    `${ROUTING_BASE_URL}/` +
    `${from.longitude.toFixed(6)},${from.latitude.toFixed(6)};` +
    `${to.longitude.toFixed(6)},${to.latitude.toFixed(6)}` +
    `?overview=full&geometries=geojson&steps=false&alternatives=false`;

  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': ROUTING_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Routing HTTP ${response.status}`);
  }

  const json = await response.json();
  const route = json?.routes?.[0];
  const rawCoordinates = route?.geometry?.coordinates;

  if (
    json?.code !== 'Ok' ||
    !Array.isArray(rawCoordinates) ||
    rawCoordinates.length < 2
  ) {
    throw new Error(json?.code || 'NoRoute');
  }

  // GeoJSON is [longitude, latitude]; react-native-maps needs objects.
  const coordinates = rawCoordinates.map(([longitude, latitude]) => ({
    latitude,
    longitude,
  }));

  // The router snaps the destination to the nearest mapped path.
  // Finish the line exactly on the trail's real coordinate.
  const last = coordinates[coordinates.length - 1];

  if (distanceMeters(last, to) > 8) {
    coordinates.push({ latitude: to.latitude, longitude: to.longitude });
  }

  // Cumulative distance along the route, used for live "remaining" values.
  const cumulative = [0];

  for (let i = 1; i < coordinates.length; i += 1) {
    cumulative.push(
      cumulative[i - 1] +
        distanceMeters(coordinates[i - 1], coordinates[i])
    );
  }

  return {
    coordinates,
    cumulative,
    totalM: cumulative[cumulative.length - 1],
    durationS: Number(route.duration) || 0,
  };
}

// Validate saved offline trail coordinates and calculate route metrics.
function buildRouteMetrics(inputCoordinates, durationS = 0) {
  if (!Array.isArray(inputCoordinates)) return null;

  const coordinates = inputCoordinates
    .map((point) => ({
      latitude: Number(point?.latitude),
      longitude: Number(point?.longitude),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.latitude) &&
        Number.isFinite(point.longitude) &&
        Math.abs(point.latitude) <= 90 &&
        Math.abs(point.longitude) <= 180
    );

  if (coordinates.length < 2) return null;

  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i += 1) {
    cumulative.push(
      cumulative[i - 1] + distanceMeters(coordinates[i - 1], coordinates[i])
    );
  }

  const totalM = cumulative[cumulative.length - 1];
  if (!Number.isFinite(totalM) || totalM <= 0) return null;

  return {
    coordinates,
    cumulative,
    totalM,
    durationS: Number(durationS) > 0 ? Number(durationS) : totalM / 0.8,
  };
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// One value + label cell used in the recording stats row.
function Stat({ label, value, divider = false }) {
  return (
    <View style={[styles.stat, divider && styles.statDivider]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Current-position marker. Tracks view changes briefly so it always
// renders on Android, then stops tracking to save battery.
function UserMarker({ coordinate }) {
  const [track, setTrack] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setTrack(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Marker
      coordinate={coordinate}
      title="Your current location"
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={track}
      zIndex={20}
    >
      <View style={styles.currentLocationMarker}>
        <View style={styles.currentLocationDot} />
      </View>
    </Marker>
  );
}

export default function LiveTopoScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const mapRef = useRef(null);
  const lastFramedTrailRef = useRef(null);
  const locationSubscriptionRef = useRef(null);
  const hasFixRef = useRef(false);

  // Routing bookkeeping (refs so they never cause re-renders).
  const fetchRef = useRef({ inFlight: false, lastAt: 0, destKey: null });
  const abortRef = useRef(null);
  const retryTimerRef = useRef(null);
  const unmountedRef = useRef(false);
  const progressRef = useRef(0);

  // GPS tracking bookkeeping.
  const wantTrackingRef = useRef(false);
  const startingRef = useRef(false);
  const latestFixRef = useRef(null);

  // Track recording bookkeeping (refs so GPS callbacks always see the
  // latest values without being re-created).
  const recStatusRef = useRef('idle'); // idle | recording | paused | finished
  const recMetaRef = useRef(null);
  const recStatsRef = useRef({ distanceM: 0, ascentM: 0, refAlt: null });
  const lastRecordedRef = useRef(null);
  const accumulatedMsRef = useRef(0);
  const segmentStartRef = useRef(0);

  // Load trail data.
  const trailsResult = useTrails();

  const trails = Array.isArray(trailsResult)
    ? trailsResult
    : Array.isArray(trailsResult?.trails)
      ? trailsResult.trails
      : [];

  // Read the trail ID passed from Maps.
  const trailId = Array.isArray(params.trailId)
    ? params.trailId[0]
    : params.trailId;

  // Find the selected trail.
  const trail = useMemo(
    () =>
      trails.find(
        (item) => String(item.id) === String(trailId)
      ),
    [trails, trailId]
  );

  const [location, setLocation] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [isTrailPanelVisible, setIsTrailPanelVisible] = useState(true);

  // Swipe down on the panel handle to hide the panel and expand the map.
  const panelPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 8 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 35) setIsTrailPanelVisible(false);
        if (gestureState.dy < -35) setIsTrailPanelVisible(true);
      },
    })
  ).current;

  const [guide, setGuide] = useState(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // Track recording state.
  const [recStatus, setRecStatus] = useState('idle');
  const [recPoints, setRecPoints] = useState([]);
  const [recStats, setRecStats] = useState({ distanceM: 0, ascentM: null });
  const [nowMs, setNowMs] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Validate the trail's destination coordinates.
  const destination = useMemo(() => {
    if (!trail) return null;

    const latitude = Number(trail.latitude);
    const longitude = Number(trail.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return null;
    }

    return { latitude, longitude };
  }, [trail]);

  // ---------------------------------------------------------------------
  // GPS tracking and track recording
  // ---------------------------------------------------------------------

  // Add a GPS fix to the track being recorded.
  const appendRecordedPoint = useCallback((fix) => {
    if (
      Number.isFinite(fix.accuracy) &&
      fix.accuracy > MAX_RECORD_ACCURACY_M
    ) {
      return;
    }

    const last = lastRecordedRef.current;
    let step = 0;

    if (last) {
      step = distanceMeters(last, fix);

      // Ignore GPS jitter while standing still.
      const minStep = Math.max(
        MIN_RECORD_STEP_M,
        Math.min(fix.accuracy ?? 0, 20) * 0.5
      );

      if (step < minStep) return;

      // Ignore impossible jumps.
      const seconds = (fix.timestamp - last.timestamp) / 1000;

      if (seconds > 0 && step / seconds > MAX_RECORD_SPEED_MPS) return;
    }

    lastRecordedRef.current = fix;

    const stats = recStatsRef.current;
    stats.distanceM += step;

    // Ascent with a small threshold so GPS altitude noise doesn't add up.
    if (Number.isFinite(fix.altitude)) {
      if (stats.refAlt === null) {
        stats.refAlt = fix.altitude;
      } else {
        const diff = fix.altitude - stats.refAlt;

        if (Math.abs(diff) >= ALTITUDE_THRESHOLD_M) {
          if (diff > 0) stats.ascentM += diff;
          stats.refAlt = fix.altitude;
        }
      }
    }

    setRecPoints((previous) => [...previous, fix]);
    setRecStats({
      distanceM: stats.distanceM,
      ascentM: stats.refAlt === null ? null : stats.ascentM,
    });
  }, []);

  const handlePosition = useCallback(
    (position) => {
      if (unmountedRef.current) return;

      const coords = position?.coords ?? {};
      const {
        latitude,
        longitude,
        accuracy: fixAccuracy,
        altitude,
      } = coords;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return;
      }

      // Once we have a fix, ignore very poor ones (GPS jumps).
      if (
        hasFixRef.current &&
        Number.isFinite(fixAccuracy) &&
        fixAccuracy > MAX_ACCEPTED_ACCURACY_M
      ) {
        return;
      }

      hasFixRef.current = true;

      const fix = {
        latitude,
        longitude,
        altitude: Number.isFinite(altitude) ? altitude : null,
        accuracy: Number.isFinite(fixAccuracy) ? fixAccuracy : null,
        timestamp: Number.isFinite(position?.timestamp)
          ? position.timestamp
          : Date.now(),
      };

      latestFixRef.current = fix;

      setLocation({ latitude, longitude });
      setAccuracy(fix.accuracy);
      setLocationLoading(false);

      if (recStatusRef.current === 'recording') {
        appendRecordedPoint(fix);
      }
    },
    [appendRecordedPoint]
  );

  const stopLocationTracking = useCallback(() => {
    wantTrackingRef.current = false;
    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;
  }, []);

  const startLocationTracking = useCallback(async () => {
    wantTrackingRef.current = true;

    // Already running (for example while recording on another tab).
    if (locationSubscriptionRef.current || startingRef.current) return;

    startingRef.current = true;

    try {
      if (!hasFixRef.current) setLocationLoading(true);
      setLocationError('');

      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (!wantTrackingRef.current || unmountedRef.current) return;

      if (permission.status !== 'granted') {
        setLocationError(
          'Location permission is required to show your current position.'
        );
        setLocationLoading(false);
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();

      if (!wantTrackingRef.current || unmountedRef.current) return;

      if (!servicesEnabled) {
        setLocationError(
          'Location services are turned off. Turn on GPS in your device settings.'
        );
        setLocationLoading(false);
        return;
      }

      // Show a recent position immediately while GPS locks on.
      if (!hasFixRef.current) {
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: 60000,
          requiredAccuracy: MAX_ACCEPTED_ACCURACY_M,
        }).catch(() => null);

        if (!wantTrackingRef.current || unmountedRef.current) return;
        if (lastKnown) handlePosition(lastKnown);
      }

      // Best available accuracy, refreshed every ~1.5 s or 2 m.
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1500,
          distanceInterval: 2,
        },
        handlePosition
      );

      if (wantTrackingRef.current && !unmountedRef.current) {
        locationSubscriptionRef.current = subscription;
      } else {
        subscription.remove();
      }
    } catch (error) {
      if (!wantTrackingRef.current || unmountedRef.current) return;

      setLocationError(
        'Unable to get your location. Check your device location settings.'
      );
      setLocationLoading(false);
    } finally {
      startingRef.current = false;
    }
  }, [handlePosition]);

  // Track GPS while this tab is focused. Leaving the tab stops tracking to
  // save battery, except while a recording is running.
  useFocusEffect(
    useCallback(() => {
      startLocationTracking();

      return () => {
        if (recStatusRef.current !== 'recording') {
          stopLocationTracking();
        }
      };
    }, [startLocationTracking, stopLocationTracking])
  );

  // Cancel any pending GPS / routing work when the screen is destroyed.
  useEffect(() => {
    unmountedRef.current = false;

    return () => {
      unmountedRef.current = true;
      stopLocationTracking();
      abortRef.current?.abort();
      clearTimeout(retryTimerRef.current);
    };
  }, [stopLocationTracking]);

  // Update the recording timer once per second while recording.
  useEffect(() => {
    if (recStatus !== 'recording') return undefined;

    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [recStatus]);

  const resetRecording = useCallback(() => {
    recStatusRef.current = 'idle';
    recMetaRef.current = null;
    recStatsRef.current = { distanceM: 0, ascentM: 0, refAlt: null };
    lastRecordedRef.current = null;
    accumulatedMsRef.current = 0;
    segmentStartRef.current = 0;

    setRecStatus('idle');
    setRecPoints([]);
    setRecStats({ distanceM: 0, ascentM: null });
    setSaveError('');
    setSaving(false);
  }, []);

  const startRecording = useCallback(() => {
    const fix = latestFixRef.current;

    if (!fix || recStatusRef.current !== 'idle') return;

    const startedAt = Date.now();

    recMetaRef.current = {
      startedAt,
      endedAt: null,
      trailId: trailId ? String(trailId) : null,
      trailName: trail?.name || trail?.title || null,
    };

    accumulatedMsRef.current = 0;
    segmentStartRef.current = startedAt;
    lastRecordedRef.current = fix;

    recStatsRef.current = {
      distanceM: 0,
      ascentM: 0,
      refAlt: Number.isFinite(fix.altitude) ? fix.altitude : null,
    };

    recStatusRef.current = 'recording';

    setSaveError('');
    setRecPoints([fix]);
    setRecStats({
      distanceM: 0,
      ascentM: recStatsRef.current.refAlt === null ? null : 0,
    });
    setNowMs(startedAt);
    setRecStatus('recording');
  }, [trailId, trail]);

  const pauseRecording = useCallback(() => {
    if (recStatusRef.current !== 'recording') return;

    accumulatedMsRef.current += Date.now() - segmentStartRef.current;
    recStatusRef.current = 'paused';
    setRecStatus('paused');
  }, []);

  const resumeRecording = useCallback(() => {
    if (recStatusRef.current !== 'paused') return;

    segmentStartRef.current = Date.now();

    // Don't count distance moved while paused.
    lastRecordedRef.current = null;

    recStatusRef.current = 'recording';
    setNowMs(Date.now());
    setRecStatus('recording');
  }, []);

  const stopRecording = useCallback(() => {
    const status = recStatusRef.current;

    if (status !== 'recording' && status !== 'paused') return;

    if (recPoints.length < 2) {
      Alert.alert(
        'Track too short',
        'Not enough movement has been recorded to save a track.',
        [
          { text: 'Keep recording', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: resetRecording,
          },
        ]
      );
      return;
    }

    const endedAt = Date.now();

    if (status === 'recording') {
      accumulatedMsRef.current += endedAt - segmentStartRef.current;
    }

    recMetaRef.current = { ...recMetaRef.current, endedAt };
    recStatusRef.current = 'finished';
    setRecStatus('finished');

    // Show the whole recorded track.
    mapRef.current?.fitToCoordinates(recPoints, {
      edgePadding: { top: 90, right: 55, bottom: 230, left: 55 },
      animated: true,
    });
  }, [recPoints, resetRecording]);

  const discardRecording = useCallback(() => {
    Alert.alert(
      'Discard this track?',
      'The recorded path will be deleted and cannot be recovered.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: resetRecording,
        },
      ]
    );
  }, [resetRecording]);

  const saveRecording = useCallback(async () => {
    const meta = recMetaRef.current;

    if (recStatusRef.current !== 'finished' || !meta || saving) return;

    setSaving(true);
    setSaveError('');

    try {
      await saveTrack({
        trailId: meta.trailId,
        trailName: meta.trailName,
        startedAt: new Date(meta.startedAt).toISOString(),
        endedAt: new Date(meta.endedAt).toISOString(),
        durationS: Math.round(accumulatedMsRef.current / 1000),
        distanceM: Math.round(recStats.distanceM),
        ascentM:
          recStats.ascentM === null ? null : Math.round(recStats.ascentM),
        points: recPoints,
      });

      resetRecording();
      Alert.alert('Track saved', 'Your track has been saved.');
    } catch (error) {
      setSaveError('Could not save the track. Please try again.');
      setSaving(false);
    }
  }, [saving, recStats, recPoints, resetRecording]);

  // ---------------------------------------------------------------------
  // Guide line: user's live position -> destination
  // ---------------------------------------------------------------------
  const destKey = destination
    ? `${trailId}:${destination.latitude},${destination.longitude}`
    : null;

  // Ignore a route that was requested for a previously selected trail.
  const activeGuide =
    guide && guide.destKey === destKey ? guide : null;

  const arrived = useMemo(
    () =>
      !!location &&
      !!destination &&
      distanceMeters(location, destination) <= ARRIVAL_METERS,
    [location, destination]
  );

  // The visible guide line always starts at the user's current position
  // and shrinks as they walk along it.
  const guideInfo = useMemo(() => {
    if (!location || !destination || !activeGuide) return null;

    if (activeGuide.source === 'straight') {
      return {
        line: [location, destination],
        remainingM: distanceMeters(location, destination),
        etaS: null,
        offRouteM: 0,
      };
    }

    const points = activeGuide.coordinates;
    const lastSegment = points.length - 2;

    let bestIndex = Math.min(progressRef.current, lastSegment);
    let bestDistance = Infinity;

    for (let i = bestIndex; i <= lastSegment; i += 1) {
      const d = distanceToSegmentMeters(location, points[i], points[i + 1]);

      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }

    progressRef.current = bestIndex;

    const next = points[bestIndex + 1];

    const remainingM =
      distanceMeters(location, next) +
      (activeGuide.totalM - activeGuide.cumulative[bestIndex + 1]);

    const etaS =
      activeGuide.durationS *
      Math.min(1, remainingM / Math.max(activeGuide.totalM, 1));

    return {
      line: [location, ...points.slice(bestIndex + 1)],
      remainingM,
      etaS,
      offRouteM: bestDistance,
    };
  }, [location, destination, activeGuide]);

  // Request (or refresh) the walking route.
  useEffect(() => {
    if (!location || !destination || !destKey || arrived) return;

    const state = fetchRef.current;

    if (state.inFlight) return;

    const now = Date.now();
    const sinceLast = now - state.lastAt;

    let shouldFetch = false;

    if (!activeGuide) {
      // First request for this destination.
      shouldFetch =
        state.destKey !== destKey || sinceLast >= MIN_REFETCH_MS;
    } else if (
      activeGuide.source === 'straight' ||
      activeGuide.source === 'gpx'
    ) {
      // Retry online routing periodically while using an offline fallback.
      shouldFetch = sinceLast >= STRAIGHT_RETRY_MS;
    } else {
      // Re-route only if the user has clearly left the current online route.
      const offRoute = guideInfo?.offRouteM ?? 0;

      shouldFetch =
        sinceLast >= MIN_REFETCH_MS &&
        offRoute > Math.max(OFF_ROUTE_METERS, (accuracy ?? 0) * 1.5);
    }

    if (!shouldFetch) return;

    state.inFlight = true;
    state.lastAt = now;
    state.destKey = destKey;

    setGuideLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const timeout = setTimeout(
      () => controller.abort(),
      ROUTE_TIMEOUT_MS
    );

    (async () => {
      try {
        const route = await fetchFootRoute(
          location,
          destination,
          controller.signal
        );

        if (unmountedRef.current) return;

        progressRef.current = 0;
        setGuide({ destKey, source: 'route', ...route });
      } catch (error) {
        if (unmountedRef.current) return;

        // Online routing failed. Prefer this trail's saved local GPX/GeoJSON
        // coordinates when at least two valid points are available.
        const offlineRoute = buildRouteMetrics(trail?.routeCoordinates);

        setGuide((previous) => {
          if (
            previous &&
            previous.destKey === destKey &&
            previous.source === 'route'
          ) {
            return previous;
          }

          if (offlineRoute) {
            progressRef.current = 0;
            return { destKey, source: 'gpx', ...offlineRoute };
          }

          return {
            destKey,
            source: 'straight',
            coordinates: [],
            cumulative: [],
            totalM: 0,
            durationS: 0,
          };
        });

        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(
          () => setRetryTick((tick) => tick + 1),
          STRAIGHT_RETRY_MS + 200
        );
      } finally {
        clearTimeout(timeout);
        state.inFlight = false;

        if (!unmountedRef.current) {
          setGuideLoading(false);
          // Re-evaluate in case the selected trail changed meanwhile.
          setRetryTick((tick) => tick + 1);
        }
      }
    })();
  }, [
    location,
    destination,
    destKey,
    trail,
    activeGuide,
    guideInfo,
    accuracy,
    arrived,
    retryTick,
  ]);

  // Points used to frame the map: destination, user and guide line.
  const collectFramePoints = useCallback(() => {
    const points = [];

    if (destination) points.push(destination);
    if (location) points.push(location);

    if (guideInfo && !arrived && guideInfo.line.length >= 2) {
      points.push(...guideInfo.line);
    }

    return points;
  }, [destination, location, guideInfo, arrived]);

  // Frame the user + destination without refitting on every GPS update.
  // Re-frames only when the first GPS fix or the guide route arrives.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !trailId) return;

    // Wait for the first GPS fix (or a failure) before framing.
    if (!location && !locationError) return;

    const frameKey = `${trailId}|${location ? 'gps' : 'nogps'}|${
      activeGuide ? activeGuide.source : 'none'
    }`;

    if (lastFramedTrailRef.current === frameKey) return;

    const points = collectFramePoints();

    if (points.length >= 2) {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: {
          top: 90,
          right: 55,
          bottom: 170,
          left: 55,
        },
        animated: true,
      });
    } else if (points.length === 1) {
      mapRef.current.animateToRegion(
        {
          ...points[0],
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500
      );
    } else {
      return;
    }

    lastFramedTrailRef.current = frameKey;
  }, [
    mapReady,
    trailId,
    location,
    locationError,
    activeGuide,
    collectFramePoints,
  ]);

  // Center the map on the user's current location.
  const centerOnCurrentLocation = useCallback(() => {
    if (!location || !mapRef.current) return;

    mapRef.current.animateToRegion(
      {
        ...location,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      500
    );
  }, [location]);

  // Show the user, the guide line and the selected trail on the map.
  const frameSelectedTrail = useCallback(() => {
    if (!mapRef.current) return;

    const points = collectFramePoints();

    if (points.length >= 2) {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: {
          top: 90,
          right: 55,
          bottom: 170,
          left: 55,
        },
        animated: true,
      });
    } else if (destination) {
      mapRef.current.animateToRegion(
        {
          ...destination,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500
      );
    } else if (location) {
      mapRef.current.animateToRegion(
        {
          ...location,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500
      );
    }
  }, [collectFramePoints, destination, location]);

  // No trail was selected in Maps.
  if (!trailId) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="map-marker-path"
          size={54}
          color={ORANGE}
        />

        <Text style={styles.emptyTitle}>No trail selected</Text>

        <Text style={styles.emptyDescription}>
          Open Maps and select a trail to view it here.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/maps')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Go to Maps</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Wait for trail data to load.
  if (!trail && trails.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <ActivityIndicator size="large" color={ORANGE} />

        <Text style={styles.emptyDescription}>
          Loading trail information…
        </Text>
      </SafeAreaView>
    );
  }

  // The requested trail ID wasn't found.
  if (!trail) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="map-marker-question-outline"
          size={50}
          color={MUTED}
        />

        <Text style={styles.emptyTitle}>Trail not found</Text>

        <Text style={styles.emptyDescription}>
          The selected trail could not be found in your trail data.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/maps')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            Choose Another Trail
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const guideIsRoute = ['route', 'gpx'].includes(activeGuide?.source);
  const guideIsGpx = activeGuide?.source === 'gpx';
  const guideIsStraight = activeGuide?.source === 'straight';

  const elapsedMs =
    recStatus === 'idle'
      ? 0
      : accumulatedMsRef.current +
        (recStatus === 'recording'
          ? Math.max(0, nowMs - segmentStartRef.current)
          : 0);

  const badge =
    recStatus === 'recording'
      ? { color: RED, label: `RECORDING · ${formatClock(elapsedMs)}` }
      : recStatus === 'paused'
        ? { color: AMBER, label: `PAUSED · ${formatClock(elapsedMs)}` }
        : recStatus === 'finished'
          ? { color: DARK_GREEN, label: 'TRACK READY TO SAVE' }
          : { color: ORANGE, label: 'LIVE TOPO GUIDE' };

  const ascentLabel =
    recStats.ascentM === null ? '--' : `${Math.round(recStats.ascentM)} m`;

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'left', 'right']}
    >
      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={
            destination
              ? {
                  ...destination,
                  latitudeDelta: 0.025,
                  longitudeDelta: 0.025,
                }
              : DEFAULT_REGION
          }
          onMapReady={() => setMapReady(true)}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass
          toolbarEnabled={false}
          loadingEnabled
        >
          {/* Guide line: your position -> destination */}
          {guideInfo && !arrived && guideInfo.line.length >= 2 && (
            guideIsRoute ? (
              <>
                <Polyline
                  coordinates={guideInfo.line}
                  strokeColor="#FFFFFF"
                  strokeWidth={9}
                  lineCap="round"
                  lineJoin="round"
                  zIndex={3}
                />

                <Polyline
                  coordinates={guideInfo.line}
                  strokeColor={BLUE}
                  strokeWidth={5}
                  lineCap="round"
                  lineJoin="round"
                  zIndex={4}
                />
              </>
            ) : (
              <Polyline
                coordinates={guideInfo.line}
                strokeColor={BLUE}
                strokeWidth={4}
                lineDashPattern={[14, 10]}
                zIndex={4}
              />
            )
          )}

          {/* Recorded track */}
          {recPoints.length >= 2 && (
            <>
              <Polyline
                coordinates={recPoints}
                strokeColor="#FFFFFF"
                strokeWidth={9}
                lineCap="round"
                lineJoin="round"
                zIndex={5}
              />

              <Polyline
                coordinates={recPoints}
                strokeColor={RED}
                strokeWidth={5}
                lineCap="round"
                lineJoin="round"
                zIndex={6}
              />
            </>
          )}

          {/* Selected trail destination */}
          {destination && (
            <Marker
              coordinate={destination}
              title={trail.name || trail.title || 'Selected trail'}
              description="Selected hiking destination"
              pinColor={ORANGE}
            />
          )}

          {/* Current GPS position */}
          {location && (
            <>
              <Circle
                center={location}
                radius={Math.min(Math.max(accuracy ?? 8, 5), 100)}
                fillColor="rgba(34, 197, 94, 0.18)"
                strokeColor="rgba(34, 197, 94, 0.65)"
                strokeWidth={1}
              />

              <UserMarker coordinate={location} />
            </>
          )}
        </MapView>

        {/* Map buttons */}
        <View style={styles.mapButtons}>
          <TouchableOpacity
            style={styles.mapButton}
            onPress={centerOnCurrentLocation}
            activeOpacity={0.8}
            accessibilityLabel="Center on my location"
          >
            <MaterialCommunityIcons
              name="crosshairs-gps"
              size={23}
              color={GREEN}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mapButton}
            onPress={frameSelectedTrail}
            activeOpacity={0.8}
            accessibilityLabel="Show the selected trail route"
          >
            <MaterialCommunityIcons
              name="map-marker-path"
              size={23}
              color={ORANGE}
            />
          </TouchableOpacity>
        </View>

        {/* Trail label */}
        <View style={styles.trailBadge}>
          <View
            style={[styles.badgeDot, { backgroundColor: badge.color }]}
          />

          <View style={styles.trailBadgeTextContainer}>
            <Text style={styles.trailBadgeTitle} numberOfLines={1}>
              {trail.name || trail.title || 'Selected Trail'}
            </Text>

            <Text style={styles.trailBadgeSubtitle}>
              {badge.label}
            </Text>
          </View>
        </View>

        {/* Map legend */}
        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <View style={styles.legendBlueLine} />
            <Text style={styles.legendText}>Walking route</Text>
          </View>

          {recPoints.length > 0 && (
            <View style={styles.legendRow}>
              <View style={styles.legendRedLine} />
              <Text style={styles.legendText}>Recorded track</Text>
            </View>
          )}

          <View style={styles.legendRow}>
            <View style={styles.legendGreenDot} />
            <Text style={styles.legendText}>Your GPS location</Text>
          </View>
        </View>
      </View>

      {/* Bottom information panel */}
      {isTrailPanelVisible ? (
      <View style={styles.bottomPanel}>
        <View
          style={styles.panelHandleTouchArea}
          {...panelPanResponder.panHandlers}
          accessibilityRole="button"
          accessibilityLabel="Swipe down to hide Trail Guide"
        >
          <View style={styles.panelHandle} />
        </View>

        <View style={styles.panelHeadingRow}>
          <View style={styles.panelIcon}>
            <MaterialCommunityIcons
              name="terrain"
              size={24}
              color={ORANGE}
            />
          </View>

          <View style={styles.panelTitleContainer}>
            <Text style={styles.panelTitle}>Trail Guide</Text>

            <Text style={styles.panelSubtitle} numberOfLines={1}>
              {trail.name || trail.title || 'Selected hiking trail'}
            </Text>
          </View>

          <View
            style={[
              styles.statusPill,
              location
                ? styles.statusPillActive
                : styles.statusPillInactive,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: location ? GREEN : '#9CA3AF' },
              ]}
            />

            <Text style={styles.statusText}>
              {location
                ? accuracy != null
                  ? `GPS Active · ±${Math.round(accuracy)} m`
                  : 'GPS Active'
                : 'GPS Waiting'}
            </Text>
          </View>
        </View>

        {locationLoading && (
          <View style={styles.messageRow}>
            <ActivityIndicator size="small" color={ORANGE} />

            <Text style={styles.messageText}>
              Getting your current location…
            </Text>
          </View>
        )}

        {!!locationError && (
          <View style={styles.warningBox}>
            <MaterialCommunityIcons
              name="map-marker-alert-outline"
              size={20}
              color="#B45309"
            />

            <Text style={styles.warningText}>
              {locationError}
            </Text>
          </View>
        )}

        {/* Live guide status */}
        {arrived ? (
          <View style={[styles.guideCard, styles.guideCardArrived]}>
            <View style={[styles.guideCardIcon, styles.guideCardIconArrived]}>
              <MaterialCommunityIcons
                name="flag-checkered"
                size={22}
                color={DARK_GREEN}
              />
            </View>

            <View style={styles.guideCardText}>
              <Text style={styles.guideCardTitle}>You have arrived</Text>
              <Text style={styles.guideCardSub}>
                You are at the destination.
              </Text>
            </View>
          </View>
        ) : guideInfo && guideIsRoute ? (
          <View style={styles.guideCard}>
            <View style={styles.guideCardIcon}>
              <MaterialCommunityIcons
                name="navigation-variant-outline"
                size={22}
                color={BLUE}
              />
            </View>

            <View style={styles.guideCardText}>
              <Text style={styles.guideCardTitle}>
                {formatDistance(guideInfo.remainingM)} to go
              </Text>
              <Text style={styles.guideCardSub}>
                {guideIsGpx
                  ? 'Offline saved trail track · follow with care'
                  : `About ${formatDuration(guideInfo.etaS)} on foot`}
              </Text>
            </View>
          </View>
        ) : guideInfo && guideIsStraight ? (
          <View style={styles.warningBox}>
            <MaterialCommunityIcons
              name="vector-line"
              size={20}
              color="#B45309"
            />

            <Text style={styles.warningText}>
              Walking route unavailable right now. Showing a straight
              line, {formatDistance(guideInfo.remainingM)} away. Retrying
              automatically.
            </Text>
          </View>
        ) : location && guideLoading ? (
          <View style={styles.messageRow}>
            <ActivityIndicator size="small" color={BLUE} />

            <Text style={styles.messageText}>
              Finding the walking route…
            </Text>
          </View>
        ) : null}

        {/* Track recording */}
        {recStatus === 'idle' && (
          <>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                !location && styles.buttonDisabled,
              ]}
              onPress={startRecording}
              disabled={!location}
              activeOpacity={0.85}
              accessibilityLabel="Start recording your track"
            >
              <MaterialCommunityIcons
                name="record-circle-outline"
                size={22}
                color="#F87171"
              />

              <Text style={styles.primaryButtonText}>
                Start Recording
              </Text>
            </TouchableOpacity>

            <Text style={styles.helperText}>
              {location
                ? 'Record your hike, then save or discard it when you finish.'
                : 'Waiting for GPS before you can record.'}
            </Text>
          </>
        )}

        {(recStatus === 'recording' || recStatus === 'paused') && (
          <>
            <View style={styles.statsRow}>
              <Stat
                label="Distance"
                value={formatDistance(recStats.distanceM)}
              />

              <Stat label="Time" value={formatClock(elapsedMs)} divider />

              <Stat label="Ascent" value={ascentLabel} divider />
            </View>

            <View style={styles.buttonRow}>
              {recStatus === 'recording' ? (
                <TouchableOpacity
                  style={[styles.actionButton, styles.outlineButton]}
                  onPress={pauseRecording}
                  activeOpacity={0.85}
                  accessibilityLabel="Pause recording"
                >
                  <MaterialCommunityIcons
                    name="pause"
                    size={21}
                    color={DARK}
                  />

                  <Text style={styles.outlineButtonText}>Pause</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.actionButton, styles.greenButton]}
                  onPress={resumeRecording}
                  activeOpacity={0.85}
                  accessibilityLabel="Resume recording"
                >
                  <MaterialCommunityIcons
                    name="play"
                    size={21}
                    color="#FFFFFF"
                  />

                  <Text style={styles.primaryButtonText}>Resume</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.actionButton, styles.redButton]}
                onPress={stopRecording}
                activeOpacity={0.85}
                accessibilityLabel="Stop recording"
              >
                <MaterialCommunityIcons
                  name="stop"
                  size={21}
                  color="#FFFFFF"
                />

                <Text style={styles.primaryButtonText}>Stop</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {recStatus === 'finished' && (
          <>
            <View style={styles.summaryHeader}>
              <MaterialCommunityIcons
                name="flag-checkered"
                size={18}
                color={DARK_GREEN}
              />

              <Text style={styles.summaryTitle}>Recording finished</Text>

              <Text style={styles.summarySub}>
                {recPoints.length} GPS points
              </Text>
            </View>

            <View style={styles.statsRow}>
              <Stat
                label="Distance"
                value={formatDistance(recStats.distanceM)}
              />

              <Stat label="Time" value={formatClock(elapsedMs)} divider />

              <Stat label="Ascent" value={ascentLabel} divider />
            </View>

            {!!saveError && (
              <View style={styles.warningBox}>
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={20}
                  color="#B45309"
                />

                <Text style={styles.warningText}>{saveError}</Text>
              </View>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.greenButton,
                  saving && styles.buttonDisabled,
                ]}
                onPress={saveRecording}
                disabled={saving}
                activeOpacity={0.85}
                accessibilityLabel="Save this track"
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="content-save-outline"
                      size={20}
                      color="#FFFFFF"
                    />

                    <Text style={styles.primaryButtonText}>
                      Save Track
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.discardButton,
                  saving && styles.buttonDisabled,
                ]}
                onPress={discardRecording}
                disabled={saving}
                activeOpacity={0.85}
                accessibilityLabel="Discard this track"
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={20}
                  color={RED}
                />

                <Text style={styles.discardButtonText}>Discard</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {guideIsRoute && !guideIsGpx && (
          <Text style={styles.attribution}>
            Route data © OpenStreetMap contributors · Routing by OSRM
          </Text>
        )}
        {guideIsGpx && (
          <Text style={styles.attribution}>
            Offline saved route · verify the track before hiking
          </Text>
        )}
      </View>
      ) : (
        <TouchableOpacity
          style={styles.showPanelButton}
          onPress={() => setIsTrailPanelVisible(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Show Trail Guide"
        >
          <MaterialCommunityIcons name="chevron-up" size={22} color={DARK} />
          <Text style={styles.showPanelButtonText}>Trail Guide</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F3',
  },

  mapContainer: {
    flex: 1,
    minHeight: 280,
    overflow: 'hidden',
    backgroundColor: '#E6EBE7',
  },

  map: {
    ...StyleSheet.absoluteFillObject,
  },

  mapButtons: {
    position: 'absolute',
    right: 16,
    top: 18,
    gap: 10,
  },

  mapButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
  },

  trailBadge: {
    position: 'absolute',
    top: 18,
    left: 16,
    right: 78,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 13,
    elevation: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },

  badgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ORANGE,
    marginRight: 10,
  },

  trailBadgeTextContainer: {
    flex: 1,
  },

  trailBadgeTitle: {
    color: DARK,
    fontSize: 14,
    fontWeight: '800',
  },

  trailBadgeSubtitle: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 3,
  },

  legend: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    elevation: 3,
  },

  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  legendBlueLine: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: BLUE,
  },

  legendRedLine: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: RED,
  },

  legendGreenDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GREEN,
  },

  legendText: {
    fontSize: 11,
    color: DARK,
    fontWeight: '600',
  },

  currentLocationMarker: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.6)',
  },

  currentLocationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GREEN,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  bottomPanel: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -12,
  },

  panelHandleTouchArea: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
    marginTop: -4,
    marginBottom: 5,
  },

  panelHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D9DFDA',
    marginBottom: 17,
  },

  showPanelButton: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 11,
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },

  showPanelButtonText: {
    color: DARK,
    fontSize: 13,
    fontWeight: '800',
  },

  panelHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  panelIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFF2E3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  panelTitleContainer: {
    flex: 1,
  },

  panelTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: DARK,
  },

  panelSubtitle: {
    fontSize: 12,
    color: MUTED,
    marginTop: 3,
  },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 5,
  },

  statusPillActive: {
    backgroundColor: '#E8F8ED',
  },

  statusPillInactive: {
    backgroundColor: '#F0F1F2',
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  statusText: {
    fontSize: 10,
    color: DARK,
    fontWeight: '700',
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },

  messageText: {
    color: MUTED,
    fontSize: 12,
    flex: 1,
  },

  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 11,
    borderRadius: 12,
    backgroundColor: '#FFF7E6',
    marginBottom: 12,
  },

  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: '#92400E',
  },

  guideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 12,
  },

  guideCardArrived: {
    backgroundColor: '#E8F8ED',
  },

  guideCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  guideCardIconArrived: {
    backgroundColor: '#FFFFFF',
  },

  guideCardText: {
    flex: 1,
  },

  guideCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: DARK,
  },

  guideCardSub: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#F4F6F3',
    borderRadius: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },

  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: '#E1E7E2',
  },

  statValue: {
    fontSize: 17,
    fontWeight: '800',
    color: DARK,
  },

  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: MUTED,
    marginTop: 3,
    textTransform: 'uppercase',
  },

  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 10,
  },

  summaryTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: DARK,
  },

  summarySub: {
    fontSize: 11,
    color: MUTED,
    fontWeight: '600',
  },

  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },

  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
  },

  greenButton: {
    backgroundColor: DARK_GREEN,
  },

  redButton: {
    backgroundColor: RED,
  },

  outlineButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D9DFDA',
  },

  outlineButtonText: {
    color: DARK,
    fontSize: 14,
    fontWeight: '800',
  },

  discardButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },

  discardButtonText: {
    color: RED,
    fontSize: 14,
    fontWeight: '800',
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  helperText: {
    fontSize: 11,
    lineHeight: 16,
    color: MUTED,
    textAlign: 'center',
    marginTop: 9,
  },

  attribution: {
    fontSize: 10,
    color: MUTED,
    textAlign: 'center',
    marginTop: 12,
  },

  primaryButton: {
    minHeight: 48,
    backgroundColor: DARK,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  emptyContainer: {
    flex: 1,
    backgroundColor: '#F4F6F3',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: DARK,
    marginTop: 16,
    textAlign: 'center',
  },

  emptyDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: MUTED,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
});
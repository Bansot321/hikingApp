
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { DIFFICULTY_COLORS } from '../constants/trailConfig';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_H * 0.62;

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Stars({ rating, onSelect, size = 25 }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => onSelect?.(star)}
          disabled={!onSelect}
          activeOpacity={0.7}
          accessibilityRole={onSelect ? 'button' : undefined}
          accessibilityLabel={`${star} star${star > 1 ? 's' : ''}`}
        >
          <Text
            style={{
              fontSize: size,
              color: star <= rating ? '#F59E0B' : '#D1D5DB',
            }}
          >
            ★
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function TrailSheet({
  trail,
  onClose,
  onGetDirections,
}) {
  const translateY = useRef(
    new Animated.Value(SHEET_HEIGHT)
  ).current;

  const [photoIndex, setPhotoIndex] = useState(0);

  // Review form state
  const [reviewName, setReviewName] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewRating, setReviewRating] = useState(5);

  // Keep reviews separate for each trail.
  // This is local state, not a shared database.
  const [reviewsByTrail, setReviewsByTrail] = useState({});

  const trailKey = trail?.id != null
    ? String(trail.id)
    : trail?.name ?? '';

  const reviews = reviewsByTrail[trailKey] ?? [];

  useEffect(() => {
    if (trail) {
      setPhotoIndex(0);
      setReviewName('');
      setReviewComment('');
      setReviewRating(5);

      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [trail, translateY]);

  const openDirections = () => {
    if (!trail) return;

    if (typeof onGetDirections === 'function') {
      onGetDirections(trail);
      return;
    }

    const latitude = Number(trail.latitude);
    const longitude = Number(trail.longitude);
    const name = trail.name ?? 'Hiking Trail';

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return;
    }

    const label = encodeURIComponent(name);

    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${latitude},${longitude}&q=${label}`,
      android: `geo:0,0?q=${latitude},${longitude}(${label})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    });

    if (url) {
      Linking.openURL(url).catch(() => {});
    }
  };

  const submitReview = () => {
    const comment = reviewComment.trim();
    const name = reviewName.trim() || 'Hiker';

    if (!comment) {
      Alert.alert(
        'Write a comment',
        'Please share your experience before submitting.'
      );
      return;
    }

    const newReview = {
      id: `${Date.now()}-${Math.random()}`,
      name,
      comment,
      rating: reviewRating,
      date: new Date().toLocaleDateString(),
    };

    setReviewsByTrail((previous) => ({
      ...previous,
      [trailKey]: [
        newReview,
        ...(previous[trailKey] ?? []),
      ],
    }));

    setReviewName('');
    setReviewComment('');
    setReviewRating(5);
    Keyboard.dismiss();
  };

  const averageRating = reviews.length
    ? (
        reviews.reduce((total, review) => total + review.rating, 0) /
        reviews.length
      ).toFixed(1)
    : null;

  return (
    <Animated.View
      pointerEvents={trail ? 'auto' : 'none'}
      style={[
        styles.sheet,
        { transform: [{ translateY }] },
      ]}
    >
      {trail && (
        <>
          <View style={styles.handle} />

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close trail details"
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) =>
                setPhotoIndex(
                  Math.round(
                    e.nativeEvent.contentOffset.x / SCREEN_W
                  )
                )
              }
            >
              {(trail.photos ?? []).map((uri, index) => (
                <Image
                  key={`${uri}-${index}`}
                  source={{ uri }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>

            <View style={styles.dots}>
              {(trail.photos ?? []).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === photoIndex && styles.dotActive,
                  ]}
                />
              ))}
            </View>

            <View style={styles.body}>
              <View style={styles.titleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>
                    {trail.name}
                  </Text>

                  <Text style={styles.region}>
                    📍 {trail.region}
                  </Text>
                </View>

                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        DIFFICULTY_COLORS[trail.difficulty] ??
                        '#64748b',
                    },
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {trail.difficulty}
                  </Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <Stat
                  label="Distance"
                  value={`${trail.distanceKm} km`}
                />

                <Stat
                  label="Elevation"
                  value={`${trail.elevationM} m`}
                />

                <Stat
                  label="Duration"
                  value={trail.duration}
                />
              </View>

              <Text style={styles.sectionTitle}>About</Text>

              <Text style={styles.paragraph}>
                {trail.description}
              </Text>

              <Text style={styles.sectionTitle}>Highlights</Text>

              <View style={styles.chipRow}>
                {(trail.highlights ?? []).map((h) => (
                  <View key={h} style={styles.chip}>
                    <Text style={styles.chipText}>{h}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Best season</Text>

              <Text style={styles.paragraph}>
                {trail.bestSeason}
              </Text>

              {/* Existing directions button */}
              <TouchableOpacity
                style={styles.button}
                onPress={openDirections}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>
                  Get Directions
                </Text>
              </TouchableOpacity>

              {/* Reviews and comments */}
              <View style={styles.reviewsSection}>
                <View style={styles.reviewsHeading}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>
                      Reviews & Comments
                    </Text>

                    <Text style={styles.reviewSubtitle}>
                      Share your experience on this trail.
                    </Text>
                  </View>

                  <View style={styles.reviewCountBadge}>
                    <Text style={styles.reviewCountText}>
                      {reviews.length}
                    </Text>
                  </View>
                </View>

                {/* Overall rating */}
                <View style={styles.ratingSummary}>
                  <View style={styles.ratingNumberContainer}>
                    <Text style={styles.ratingNumber}>
                      {averageRating ?? '—'}
                    </Text>

                    <Text style={styles.ratingOutOf}>
                      {reviews.length
                        ? `out of 5 · ${reviews.length} ${
                            reviews.length === 1 ? 'review' : 'reviews'
                          }`
                        : 'No ratings yet'}
                    </Text>
                  </View>

                  <Stars
                    rating={Math.round(Number(averageRating) || 0)}
                    size={21}
                  />
                </View>

                {/* Write a review */}
                <View style={styles.reviewForm}>
                  <Text style={styles.formTitle}>
                    Write a review
                  </Text>

                  <Text style={styles.inputLabel}>
                    Your name (optional)
                  </Text>

                  <TextInput
                    value={reviewName}
                    onChangeText={setReviewName}
                    placeholder="Enter your name"
                    placeholderTextColor="#9CA3AF"
                    style={styles.reviewInput}
                    maxLength={50}
                    returnKeyType="next"
                  />

                  <Text style={styles.inputLabel}>
                    Your rating
                  </Text>

                  <Stars
                    rating={reviewRating}
                    onSelect={setReviewRating}
                    size={32}
                  />

                  <Text style={styles.inputLabel}>
                    Your experience
                  </Text>

                  <TextInput
                    value={reviewComment}
                    onChangeText={setReviewComment}
                    placeholder="How was the trail? Share tips, conditions, or your experience..."
                    placeholderTextColor="#9CA3AF"
                    style={styles.commentInput}
                    multiline
                    textAlignVertical="top"
                    maxLength={1000}
                  />

                  <Text style={styles.characterCount}>
                    {reviewComment.length}/1000
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.submitReviewButton,
                      !reviewComment.trim() &&
                        styles.submitReviewDisabled,
                    ]}
                    onPress={submitReview}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Submit trail review"
                  >
                    <Text style={styles.submitReviewText}>
                      Post Review
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Review list */}
                <Text style={styles.recentReviewsTitle}>
                  Hiker experiences
                </Text>

                {reviews.length === 0 ? (
                  <View style={styles.emptyReviews}>
                    <Text style={styles.emptyReviewIcon}>💬</Text>

                    <Text style={styles.emptyReviewTitle}>
                      No reviews yet
                    </Text>

                    <Text style={styles.emptyReviewText}>
                      Be the first to share your experience on{' '}
                      {trail.name}.
                    </Text>
                  </View>
                ) : (
                  reviews.map((review) => (
                    <View
                      key={review.id}
                      style={styles.reviewCard}
                    >
                      <View style={styles.reviewerHeader}>
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>
                            {review.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>

                        <View style={styles.reviewerInfo}>
                          <Text style={styles.reviewerName}>
                            {review.name}
                          </Text>

                          <Text style={styles.reviewDate}>
                            {review.date}
                          </Text>
                        </View>
                      </View>

                      <Stars
                        rating={review.rating}
                        size={17}
                      />

                      <Text style={styles.reviewComment}>
                        {review.comment}
                      </Text>
                    </View>
                  ))
                )}

                <Text style={styles.localStorageNotice}>
                  Reviews currently stay on this screen and are not
                  shared with other users.
                </Text>
              </View>
            </View>
          </ScrollView>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#ccc',
    marginTop: 8,
    marginBottom: 8,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 5,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  photo: {
    width: SCREEN_W,
    height: 200,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#d1d5db',
    marginHorizontal: 3,
  },
  dotActive: {
    backgroundColor: '#2563eb',
    width: 18,
  },
  body: {
    padding: 18,
    paddingBottom: 40,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111',
  },
  region: {
    marginTop: 3,
    fontSize: 14,
    color: '#666',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  badgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingVertical: 12,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#777',
    marginTop: 2,
  },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 6,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#222',
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 21,
    color: '#444',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: '#e0ecff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '500',
  },
  button: {
    marginTop: 22,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },

  // Reviews section
  reviewsSection: {
    marginTop: 8,
  },
  reviewsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
  },
  reviewCountBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  reviewCountText: {
    color: '#1D4ED8',
    fontWeight: '800',
    fontSize: 13,
  },
  ratingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  ratingNumberContainer: {
    flex: 1,
  },
  ratingNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
  },
  ratingOutOf: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  reviewForm: {
    marginTop: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
    marginBottom: 7,
  },
  reviewInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  commentInput: {
    minHeight: 105,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  characterCount: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'right',
    marginTop: 5,
  },
  submitReviewButton: {
    marginTop: 12,
    minHeight: 45,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitReviewDisabled: {
    backgroundColor: '#93B4F5',
  },
  submitReviewText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  recentReviewsTitle: {
    marginTop: 22,
    marginBottom: 10,
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptyReviews: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyReviewIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  emptyReviewTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
  },
  emptyReviewText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 19,
    color: '#64748B',
    textAlign: 'center',
  },
  reviewCard: {
    padding: 14,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  reviewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#1D4ED8',
    fontSize: 15,
    fontWeight: '800',
  },
  reviewerInfo: {
    flex: 1,
  },
  reviewerName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  reviewDate: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
  },
  reviewComment: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
  },
  localStorageNotice: {
    marginTop: 12,
    marginBottom: 10,
    fontSize: 11,
    lineHeight: 17,
    color: '#94A3B8',
    textAlign: 'center',
  },
});

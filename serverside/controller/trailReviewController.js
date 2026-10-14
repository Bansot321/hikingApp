
const db = require("../config/tursoConfig");

// GET /api/trails/:trailId/reviews
async function getTrailReviews(req, res) {
  try {
    const trailId = req.params.trailId;

    if (!trailId || !trailId.trim()) {
      return res.status(400).json({
        message: "A valid trail ID is required.",
      });
    }

    const trailResult = await db.execute({
      sql: `SELECT id, name
            FROM trails
            WHERE id = ? AND is_active = 1
            LIMIT 1`,
      args: [trailId],
    });

    if (trailResult.rows.length === 0) {
      return res.status(404).json({
        message: "Trail not found.",
      });
    }

    const [reviewsResult, summaryResult] = await Promise.all([
      db.execute({
        sql: `SELECT
                r.id,
                r.user_id,
                r.trail_id,
                r.rating,
                r.comment,
                r.created_at,
                r.updated_at,
                u.username
              FROM trail_reviews r
              JOIN users u ON u.id = r.user_id
              WHERE r.trail_id = ?
              ORDER BY r.created_at DESC, r.id DESC`,
        args: [trailId],
      }),

      db.execute({
        sql: `SELECT
                COUNT(*) AS total_reviews,
                COALESCE(AVG(rating), 0) AS average_rating
              FROM trail_reviews
              WHERE trail_id = ?`,
        args: [trailId],
      }),
    ]);

    const summary = summaryResult.rows[0];

    return res.status(200).json({
      trail: {
        id: trailResult.rows[0].id,
        name: trailResult.rows[0].name,
      },
      summary: {
        totalReviews: Number(summary.total_reviews),
        averageRating: Number(
          Number(summary.average_rating).toFixed(2)
        ),
      },
      reviews: reviewsResult.rows.map((review) => ({
        id: Number(review.id),
        userId: Number(review.user_id),
        trailId: review.trail_id,
        username: review.username,
        rating: Number(review.rating),
        comment: review.comment,
        createdAt: review.created_at,
        updatedAt: review.updated_at,
      })),
    });
  } catch (error) {
    console.error("Get trail reviews error:", error.message);

    return res.status(500).json({
      message: "Unable to load trail reviews.",
    });
  }
}

 // POST /api/trails/:trailId/reviews
async function createTrailReview(req, res) {
  const trailId = req.params.trailId;
  const userId = req.user?.id;
  const body = req.body || {};

  let clientReviewId = null;

  try {
    const { rating, comment } = body;

    // Validate trail and authenticated user.
    if (!trailId || !trailId.trim()) {
      return res.status(400).json({
        message: "A valid trail ID is required.",
      });
    }

    if (userId == null) {
      return res.status(401).json({
        message: "Authentication is required.",
      });
    }

    // Validate the stable ID used for safe retries.
    if (body.clientReviewId !== undefined) {
      if (
        typeof body.clientReviewId !== "string" ||
        !body.clientReviewId.trim() ||
        body.clientReviewId.trim().length > 100
      ) {
        return res.status(400).json({
          message: "A valid client review ID is required.",
        });
      }

      clientReviewId = body.clientReviewId.trim();
    }

    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return res.status(400).json({
        message: "Rating must be an integer from 1 to 5.",
      });
    }

    if (typeof comment !== "string") {
      return res.status(400).json({
        message: "Review comment must be text.",
      });
    }

    const cleanComment = comment.trim();

    if (cleanComment.length > 2000) {
      return res.status(400).json({
        message: "Review comment cannot exceed 2000 characters.",
      });
    }

    // Confirm the trail exists and is active.
    const trailResult = await db.execute({
      sql: `SELECT id
            FROM trails
            WHERE id = ? AND is_active = 1
            LIMIT 1`,
      args: [trailId],
    });

    if (trailResult.rows.length === 0) {
      return res.status(404).json({
        message: "Trail not found.",
      });
    }

    // Return a consistent response for an existing review.
    async function getReviewByClientId(clientId) {
      return db.execute({
        sql: `SELECT
                r.id,
                r.user_id,
                r.trail_id,
                r.rating,
                r.comment,
                r.created_at,
                r.updated_at,
                u.username
              FROM trail_reviews r
              JOIN users u ON u.id = r.user_id
              WHERE r.client_review_id = ?
              LIMIT 1`,
        args: [clientId],
      });
    }

    function sendExistingReview(review) {
      return res.status(200).json({
        message: "Review was already submitted.",
        review: {
          id: Number(review.id),
          userId: Number(review.user_id),
          trailId: review.trail_id,
          username: review.username,
          rating: Number(review.rating),
          comment: review.comment,
          createdAt: review.created_at,
          updatedAt: review.updated_at,
        },
      });
    }

    // IDEMPOTENCY: a retry with the same ID must not insert again.
    if (clientReviewId) {
      const previous = await getReviewByClientId(clientReviewId);

      if (previous.rows.length > 0) {
        const review = previous.rows[0];

        // Never expose another user's review through a reused ID.
        if (
          String(review.user_id) !== String(userId) ||
          String(review.trail_id) !== String(trailId)
        ) {
          return res.status(409).json({
            message: "This review ID has already been used.",
          });
        }

        return sendExistingReview(review);
      }
    }

    // Preserve the existing rule: one review per user per trail.
    const existing = await db.execute({
      sql: `SELECT id
            FROM trail_reviews
            WHERE user_id = ? AND trail_id = ?
            LIMIT 1`,
      args: [userId, trailId],
    });

    if (existing.rows.length > 0) {
      return res.status(409).json({
        message:
          "You have already reviewed this trail. Edit your existing review instead.",
      });
    }

    // Insert the stable client ID when supplied.
    const result = await db.execute({
      sql: `INSERT INTO trail_reviews
              (user_id, trail_id, rating, comment, client_review_id)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        userId,
        trailId,
        rating,
        cleanComment,
        clientReviewId,
      ],
    });

    const reviewResult = await db.execute({
      sql: `SELECT
              r.id,
              r.user_id,
              r.trail_id,
              r.rating,
              r.comment,
              r.created_at,
              r.updated_at,
              u.username
            FROM trail_reviews r
            JOIN users u ON u.id = r.user_id
            WHERE r.id = ?`,
      args: [Number(result.lastInsertRowid)],
    });

    const review = reviewResult.rows[0];

    if (!review) {
      return res.status(500).json({
        message: "Review was saved but could not be retrieved.",
      });
    }

    return res.status(201).json({
      message: "Review submitted successfully.",
      review: {
        id: Number(review.id),
        userId: Number(review.user_id),
        trailId: review.trail_id,
        username: review.username,
        rating: Number(review.rating),
        comment: review.comment,
        createdAt: review.created_at,
        updatedAt: review.updated_at,
      },
    });
  } catch (error) {
    // A concurrent retry may hit the unique index after the first
    // request inserts the review. Recover by looking up the same ID.
    if (
      clientReviewId &&
      String(error.message || "").includes("UNIQUE constraint failed")
    ) {
      try {
        const previous = await db.execute({
          sql: `SELECT
                  r.id,
                  r.user_id,
                  r.trail_id,
                  r.rating,
                  r.comment,
                  r.created_at,
                  r.updated_at,
                  u.username
                FROM trail_reviews r
                JOIN users u ON u.id = r.user_id
                WHERE r.client_review_id = ?
                LIMIT 1`,
          args: [clientReviewId],
        });

        if (previous.rows.length > 0) {
          const review = previous.rows[0];

          if (
            String(review.user_id) === String(userId) &&
            String(review.trail_id) === String(trailId)
          ) {
            return res.status(200).json({
              message: "Review was already submitted.",
              review: {
                id: Number(review.id),
                userId: Number(review.user_id),
                trailId: review.trail_id,
                username: review.username,
                rating: Number(review.rating),
                comment: review.comment,
                createdAt: review.created_at,
                updatedAt: review.updated_at,
              },
            });
          }
        }
      } catch (lookupError) {
        console.error(
          "Could not recover retried review:",
          lookupError.message
        );
      }

      return res.status(409).json({
        message:
          "A review already exists or this review ID has already been used.",
      });
    }

    console.error("Create trail review error:", error.message);

    return res.status(500).json({
      message: "Unable to submit review.",
    });
  }
}


// PUT /api/trails/:trailId/reviews/:reviewId
async function updateTrailReview(req, res) {
  try {
    const trailId = req.params.trailId;
    const reviewId = Number(req.params.reviewId);
    const userId = req.user.id;
    const { rating, comment } = req.body || {};

    if (
      !Number.isSafeInteger(reviewId) ||
      reviewId <= 0
    ) {
      return res.status(400).json({
        message: "Invalid review ID.",
      });
    }

    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return res.status(400).json({
        message: "Rating must be an integer from 1 to 5.",
      });
    }

    if (typeof comment !== "string") {
      return res.status(400).json({
        message: "Review comment must be text.",
      });
    }

    const cleanComment = comment.trim();

    if (cleanComment.length > 2000) {
      return res.status(400).json({
        message: "Review comment cannot exceed 2000 characters.",
      });
    }

    const result = await db.execute({
      sql: `UPDATE trail_reviews
            SET rating = ?,
                comment = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND trail_id = ?
              AND user_id = ?`,
      args: [rating, cleanComment, reviewId, trailId, userId],
    });

    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({
        message: "Review not found or you do not have permission to edit it.",
      });
    }

    const updated = await db.execute({
      sql: `SELECT
              r.id,
              r.user_id,
              r.trail_id,
              r.rating,
              r.comment,
              r.created_at,
              r.updated_at,
              u.username
            FROM trail_reviews r
            JOIN users u ON u.id = r.user_id
            WHERE r.id = ?`,
      args: [reviewId],
    });

    const review = updated.rows[0];

    return res.status(200).json({
      message: "Review updated successfully.",
      review: {
        id: Number(review.id),
        userId: Number(review.user_id),
        trailId: review.trail_id,
        username: review.username,
        rating: Number(review.rating),
        comment: review.comment,
        createdAt: review.created_at,
        updatedAt: review.updated_at,
      },
    });
  } catch (error) {
    console.error("Update trail review error:", error.message);

    return res.status(500).json({
      message: "Unable to update review.",
    });
  }
}

// DELETE /api/trails/:trailId/reviews/:reviewId
async function deleteTrailReview(req, res) {
  try {
    const trailId = req.params.trailId;
    const reviewId = Number(req.params.reviewId);
    const userId = req.user.id;

    if (
      !Number.isSafeInteger(reviewId) ||
      reviewId <= 0
    ) {
      return res.status(400).json({
        message: "Invalid review ID.",
      });
    }

    const result = await db.execute({
      sql: `DELETE FROM trail_reviews
            WHERE id = ?
              AND trail_id = ?
              AND user_id = ?`,
      args: [reviewId, trailId, userId],
    });

    if (Number(result.rowsAffected) === 0) {
      return res.status(404).json({
        message: "Review not found or you do not have permission to delete it.",
      });
    }

    return res.status(200).json({
      message: "Review deleted successfully.",
    });
  } catch (error) {
    console.error("Delete trail review error:", error.message);

    return res.status(500).json({
      message: "Unable to delete review.",
    });
  }
}

module.exports = {
  getTrailReviews,
  createTrailReview,
  updateTrailReview,
  deleteTrailReview,
};

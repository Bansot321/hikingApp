
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
  try {
    const trailId = req.params.trailId;
    const { rating, comment } = req.body || {};
    const userId = req.user.id;

    if (!trailId || !trailId.trim()) {
      return res.status(400).json({
        message: "A valid trail ID is required.",
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

    const existing = await db.execute({
      sql: `SELECT id
            FROM trail_reviews
            WHERE user_id = ? AND trail_id = ?
            LIMIT 1`,
      args: [userId, trailId],
    });

    if (existing.rows.length > 0) {
      return res.status(409).json({
        message: "You have already reviewed this trail. Edit your existing review instead.",
      });
    }

    const result = await db.execute({
      sql: `INSERT INTO trail_reviews
              (user_id, trail_id, rating, comment)
            VALUES (?, ?, ?, ?)`,
      args: [userId, trailId, rating, cleanComment],
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
    if (
      String(error.message || "").includes("UNIQUE constraint failed")
    ) {
      return res.status(409).json({
        message: "You have already reviewed this trail.",
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

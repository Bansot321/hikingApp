
const express = require("express");

const { authenticate } = require("../controller/userController");

const {
  getTrails,
} = require("../controller/trailController");

const {
  getTrailReviews,
  createTrailReview,
  updateTrailReview,
  deleteTrailReview,
} = require("../controller/trailReviewController");

const router = express.Router();

// Existing endpoint: GET /api/trails
router.get("/", getTrails);

// Public endpoint: GET /api/trails/:trailId/reviews
router.get("/:trailId/reviews", getTrailReviews);

// Authenticated endpoint: POST /api/trails/:trailId/reviews
router.post(
  "/:trailId/reviews",
  authenticate,
  createTrailReview
);

// Authenticated endpoint: PUT /api/trails/:trailId/reviews/:reviewId
router.put(
  "/:trailId/reviews/:reviewId",
  authenticate,
  updateTrailReview
);

// Authenticated endpoint: DELETE /api/trails/:trailId/reviews/:reviewId
router.delete(
  "/:trailId/reviews/:reviewId",
  authenticate,
  deleteTrailReview
);

module.exports = router;

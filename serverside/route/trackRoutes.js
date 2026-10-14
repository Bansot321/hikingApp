
const express = require("express");

const { authenticate } = require("../controller/userController");

const {
  uploadTrack,
  getMyTracks,
  getMyTrackById,
  deleteMyTrack,
} = require("../controller/trackController");

const router = express.Router();

// Every hike endpoint requires a valid logged-in session.
router.use(authenticate);

router.post("/", uploadTrack);
router.get("/", getMyTracks);

// Delete using the frontend's client_track_id.
router.delete("/client/:clientTrackId", deleteMyTrack);

// Get a hike by its cloud database ID.
router.get("/:id", getMyTrackById);

module.exports = router;

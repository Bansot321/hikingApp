const express = require("express");

const { authenticate } = require("../controller/userController");

const {
  uploadTrack,
  getMyTracks,
  getMyTrackById,
} = require("../controller/trackController");

const router = express.Router();

// Every hike endpoint requires a valid logged-in session.
router.use(authenticate);

router.post("/", uploadTrack);
router.get("/", getMyTracks);
router.get("/:id", getMyTrackById);

module.exports = router;
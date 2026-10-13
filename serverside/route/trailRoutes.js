
const express = require("express");
const { getTrails } = require("../controller/trailController");

const router = express.Router();

router.get("/", getTrails);

module.exports = router;

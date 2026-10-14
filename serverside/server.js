
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, ".env"),
});

const express = require("express");
const cors = require("cors");
const userRoutes = require("./route/routess");
const trailRoutes = require("./route/trailRoutes");
const app = express();
const trackRoutes = require("./route/trackRoutes");

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({
    message: "Hiking Guide API is running.",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
  });
});
app.use("/api/users", userRoutes);
app.use("/api/trails", trailRoutes);
app.use("/api/tracks", trackRoutes);

module.exports = app;

// Start a local server only when running this file directly.
if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`API running at http://localhost:${PORT}`);
  });
}

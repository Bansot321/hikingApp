//trailController.js
const db = require("../config/tursoConfig");

async function getTrails(req, res) {
  try {
    const result = await db.execute({
      sql: `
        SELECT
          id,
          name,
          region,
          latitude,
          longitude,
          difficulty,
          distance_km,
          elevation_m,
          duration,
          best_season,
          description,
          highlights,
          photos,
          route_coordinates
        FROM trails
        WHERE is_active = 1
        ORDER BY name ASC
      `,
      args: [],
    });

    const trails = result.rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      region: row.region,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      difficulty: row.difficulty,
      distanceKm:
        row.distance_km == null ? null : Number(row.distance_km),
      elevationM:
        row.elevation_m == null ? null : Number(row.elevation_m),
      duration: row.duration,
      bestSeason: row.best_season,
      description: row.description || "",
      highlights: parseJson(row.highlights, []),
      photos: parseJson(row.photos, []),
      routeCoordinates: parseJson(row.route_coordinates, null),
    }));

    return res.status(200).json({
      count: trails.length,
      trails,
    });
  } catch (error) {
    console.error("Get trails error:", error.message);

    return res.status(500).json({
      message: "Unable to load trails. Please try again.",
    });
  }
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;

  // LibSQL may return JSON stored as either a string or a parsed value.
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = { getTrails };

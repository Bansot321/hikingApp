const db = require("../config/tursoConfig");
const { MOCK_TRAILS } = require("./trailSeedData");

async function seedTrails() {
  console.log(`Starting migration of ${MOCK_TRAILS.length} trails...`);

  for (const trail of MOCK_TRAILS) {
    const result = await db.execute({
      sql: `
        INSERT INTO trails (
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
          route_coordinates,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          region = excluded.region,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          difficulty = excluded.difficulty,
          distance_km = excluded.distance_km,
          elevation_m = excluded.elevation_m,
          duration = excluded.duration,
          best_season = excluded.best_season,
          description = excluded.description,
          highlights = excluded.highlights,
          photos = excluded.photos,
          route_coordinates = excluded.route_coordinates,
          updated_at = CURRENT_TIMESTAMP
      `,
      args: [
        String(trail.id),
        trail.name,
        trail.region,
        trail.latitude,
        trail.longitude,
        trail.difficulty,
        trail.distanceKm ?? null,
        trail.elevationM ?? null,
        trail.duration ?? null,
        trail.bestSeason ?? null,
        trail.description ?? "",
        JSON.stringify(trail.highlights ?? []),
        JSON.stringify(trail.photos ?? []),
        trail.routeCoordinates
          ? JSON.stringify(trail.routeCoordinates)
          : null,
      ],
    });

    console.log(`Processed: ${trail.id} - ${trail.name}`);
  }

  const count = await db.execute(
    "SELECT COUNT(*) AS total FROM trails"
  );

  console.log(
    `Migration complete. Trails in database: ${count.rows[0].total}`
  );
}

seedTrails().catch((error) => {
  console.error("Trail migration failed:", error);
  process.exitCode = 1;
});
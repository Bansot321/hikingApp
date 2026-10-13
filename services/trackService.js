// The ONLY file that knows where recorded tracks are stored.
// Same idea as trailService.js: when you add a database, change the bodies
// of these functions and nothing else in the app.
//
// Shape of a track passed to saveTrack():
// {
//   trailId:    string | null,   // trail that was selected in LiveTopo
//   trailName:  string | null,
//   startedAt:  ISO date string,
//   endedAt:    ISO date string,
//   durationS:  number,          // time spent recording (pauses excluded)
//   distanceM:  number,
//   ascentM:    number | null,   // null when the device gave no altitude
//   points: [
//     { latitude, longitude, altitude, accuracy, timestamp }, ...
//   ],
// }
//
// When you add login to the database, also attach the signed-in user's id
// (for example `user_id`) inside saveTrack().

// Temporary in-memory store. Saved tracks are lost when the app restarts.
let TRACKS = [];

export async function saveTrack(track) {
  // Later (example with Supabase):
  // const { data, error } = await supabase
  //   .from('tracks')
  //   .insert({
  //     trail_id: track.trailId,
  //     trail_name: track.trailName,
  //     started_at: track.startedAt,
  //     ended_at: track.endedAt,
  //     duration_s: track.durationS,
  //     distance_m: track.distanceM,
  //     ascent_m: track.ascentM,
  //     points: track.points, // jsonb column
  //   })
  //   .select()
  //   .single();
  // if (error) throw error;
  // return data;

  const saved = {
    ...track,
    id: `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
  };

  TRACKS = [saved, ...TRACKS];

  return saved;
}

export async function getTracks() {
  return TRACKS;
}

export async function getTrackById(id) {
  return TRACKS.find((track) => track.id === id) ?? null;
}

export async function deleteTrack(id) {
  TRACKS = TRACKS.filter((track) => track.id !== id);
}
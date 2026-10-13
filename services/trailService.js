// The ONLY file that knows where trail data comes from.
// When you add a database, change the bodies of these functions.
import { MOCK_TRAILS } from '../constants/mockTrails';

export async function getTrails() {
  // Later (example with Supabase):
  // const { data, error } = await supabase.from('trails').select('*');
  // if (error) throw error;
  // return data;
  return MOCK_TRAILS;
}

export async function getTrailById(id) {
  return MOCK_TRAILS.find((t) => t.id === id) ?? null;
}
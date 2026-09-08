import type { PageServerLoad } from './$types';

// Everybody's, now. What each person can see of a player is decided by the
// projection, so this route has nothing to guard.
export const load: PageServerLoad = () => ({});

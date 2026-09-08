import type { PageServerLoad } from './$types';

// Nothing to fetch. Who you drew, and what is public about them, both ride in
// the projection the layout already loaded.
export const load: PageServerLoad = () => ({});

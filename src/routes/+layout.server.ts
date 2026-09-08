import type { LayoutServerLoad } from './$types';

// Who you are, on every page. What you can see is decided per route.
export const load: LayoutServerLoad = ({ locals }) => ({
	me: locals.access.user
		? {
				name: locals.access.user.name,
				email: locals.access.user.email,
				image: locals.access.user.image
			}
		: null,
	tier: locals.access.tier,
	isAdmin: locals.access.isAdmin
});

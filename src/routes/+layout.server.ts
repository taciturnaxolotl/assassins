import { isSpoofing, mayWrite } from '$lib/server/access';
import type { LayoutServerLoad } from './$types';

// Who you are, on every page. What you can see is decided per route.
export const load: LayoutServerLoad = ({ locals }) => {
	const { access } = locals;
	return {
		me: access.user
			? { name: access.user.name, email: access.user.email, image: access.user.image }
			: null,
		tier: access.tier,
		isAdmin: access.isAdmin,
		spoof: isSpoofing(access)
			? { as: access.user!.name, writing: mayWrite(access) }
			: null
	};
};

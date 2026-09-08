import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// ORIGIN is already set when the public origin is not the one the server
	// sees. Reuse it so the hot-reload socket dials the tunnel rather than
	// ws://localhost:5173, which the browser cannot reach.
	const { ORIGIN } = loadEnv(mode, process.cwd(), '');
	const tunnel = ORIGIN ? new URL(ORIGIN) : null;

	return {
		plugins: [tailwindcss(), sveltekit()],
		server: {
			// Vite rejects Host headers it does not recognise. A leading dot
			// covers every subdomain, so any tunnel back to localhost works.
			allowedHosts: ['.dunkirk.sh', 'localhost'],
			...(tunnel && {
				hmr: {
					host: tunnel.hostname,
					protocol: tunnel.protocol === 'https:' ? 'wss' : 'ws',
					clientPort: tunnel.port ? Number(tunnel.port) : tunnel.protocol === 'https:' ? 443 : 80
				}
			})
		}
	};
});

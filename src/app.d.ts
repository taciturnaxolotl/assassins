/// <reference types="@cloudflare/workers-types" />
import type { Env } from '$lib/server/auth';
import type { DB } from '$lib/server/db';
import type { Access } from '$lib/server/access';

declare global {
	namespace App {
		interface Locals {
			env: Env;
			db: DB;
			access: Access;
		}
		interface Platform {
			env: Env;
			context: { waitUntil(p: Promise<unknown>): void };
			caches: CacheStorage;
		}
	}
}

export {};

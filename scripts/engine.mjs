// cedarengine, the one API over everything known about Cedarville.
//
// This used to be three sibling repos opened by absolute path: the directory
// out of cedarstalk-raycast, booklists out of cedar-major-pipeline, the catalog
// out of the-cedarville-app. cedarengine is those three already joined, behind
// one bearer token, so the build asks questions instead of opening databases.
//
// That token is the only thing between a caller and ten thousand students'
// rooms and phone numbers, so it belongs in `.env` and nowhere a build log can
// reach. A missing one fails here rather than quietly producing an empty roster.

const BASE = (process.env.CEDARENGINE_URL ?? "https://cedarengine.dunkirk.sh").replace(/\/$/, "");
const TOKEN = process.env.CEDARENGINE_TOKEN ?? "";

if (!TOKEN) {
  console.error(
    "CEDARENGINE_TOKEN is not set.\n" +
      "  It is the BEARER_TOKEN the engine runs with:\n" +
      "    cd ~/dots/secrets && agenix -d cedarengine.age",
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One request. 404 is an answer here, not a failure: plenty of people have no
 * booklist.
 *
 * A build is around 190 requests fired eight at a time at a public endpoint
 * that rate-limits, so 429 is an ordinary thing to meet rather than an error —
 * back off and ask again. Connection failures get the same treatment, because
 * the difference between a refused connection and a slow one is not worth
 * losing a whole build over.
 */
export async function get(path, { allow404 = false, tries = 4 } = {}) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${TOKEN}` } });
    } catch (error) {
      if (attempt >= tries) throw error;
      await sleep(attempt * 2000);
      continue;
    }

    if (res.status === 404 && allow404) return null;

    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      // Caddy does not send Retry-After, so the window length is the honest
      // default: waiting less just spends another request finding that out.
      const after = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : attempt * 15_000);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `cedarengine ${res.status} on ${path}${body ? ` — ${body.slice(0, 200)}` : ""}`,
      );
    }
    return res.json();
  }
}

/**
 * The whole directory, in pages of 500.
 *
 * All of it, not just the undergraduates: the name index has to be able to say
 * "that is a staff member, not your target" as confidently as it names a
 * sophomore, and `suggest` narrows to enrolled classes on its own afterwards.
 */
export async function directory() {
  const all = [];
  for (let offset = 0; ; offset += 500) {
    const page = await get(`/v1/people?limit=500&offset=${offset}`);
    all.push(...page.people);
    if (page.people.length < 500) return all;
  }
}

/** The campus: outlines, the walking graph, and a door for every building. */
export const campusMap = () => get("/v1/campus/map?graph=1");

/**
 * Write something down in the engine.
 *
 * Deliberately not retried. A GET that fails twice costs a second request; a
 * POST that fails twice may have been applied twice, and while the facts table
 * forgives that — a repeated assertion is just another row in the log — the
 * habit does not belong in a helper where the next caller might not be so
 * lucky.
 */
export async function post(path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`cedarengine ${res.status} on ${path} — ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/**
 * Run `work` over `items` a few at a time.
 *
 * Serially this is 160-odd round trips for an eighty-player roster, which is a
 * minute of waiting for no reason. Eight at a time is polite to a two-core box
 * and turns it into seconds.
 */
export async function pool(items, width, work) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await work(items[i], i);
      }
    }),
  );
  return out;
}

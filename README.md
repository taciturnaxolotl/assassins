# assassins

the ultimate platform for running games of assassin

## Run it

```
bun install
bun scripts/fetch-map.mjs               # once — caches the campus from OSM
bun scripts/pin-buildings.mjs --write   # once — the halls OSM is missing

bunx wrangler d1 create assassins       # put the id in wrangler.jsonc
bun run db:migrate                      # tables, locally
bun run data                            # the join -> local D1

cp .env.example .env               # fill in Google, and Polar if you want it
bun run dev                             # http://localhost:5173
```

Deploying:

```
bun run db:migrate:remote
bun run data:remote
bun run deploy
```

From CI, Workers Builds needs three things set in its own settings, because it
ignores the `build` block in `wrangler.jsonc`:

| setting | value | why |
| --- | --- | --- |
| Build command | `bun run build` | `main` does not exist until Vite has run |
| Deploy command | `bunx wrangler deploy` | |
| `BUN_VERSION` | `1.4.0` | the image ships 1.2.15, which cannot read a lockfileVersion 2 `bun.lock`. Bun is the one tool with no version file, so it has to be a variable |

The secrets go in with `wrangler secret put`, not the build variables — build
variables are not visible at runtime. `ORIGIN` is for tunnels only; leave it
unset in production or every OAuth redirect will point at the wrong host.

Polar needs `checkouts:write`, `customer_sessions:write`, `orders:read` and
`customers:read` on the access token, and a webhook on `order.paid`,
`order.refunded` and `customer.state_changed`.

<p align="center">
    <img src="https://raw.githubusercontent.com/taciturnaxolotl/carriage/main/.github/images/line-break.svg" />
</p>

<p align="center">
    <i><code>&copy; 2026-present <a href="https://dunkirk.sh">Kieran Klukas</a></code></i>
</p>

<p align="center">
    <a href="https://tangled.org/dunkirk.sh/assassins/blob/main/LICENSE.md"><img src="https://img.shields.io/static/v1.svg?style=for-the-badge&label=License&message=MIT&logoColor=d9e0ee&colorA=363a4f&colorB=b7bdf8"/></a>
</p>

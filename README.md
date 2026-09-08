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

<p align="center">
    <img src="https://raw.githubusercontent.com/taciturnaxolotl/carriage/main/.github/images/line-break.svg" />
</p>

<p align="center">
    <i><code>&copy; 2026-present <a href="https://dunkirk.sh">Kieran Klukas</a></code></i>
</p>

<p align="center">
    <a href="https://tangled.org/dunkirk.sh/assassins/blob/main/LICENSE.md"><img src="https://img.shields.io/static/v1.svg?style=for-the-badge&label=License&message=MIT&logoColor=d9e0ee&colorA=363a4f&colorB=b7bdf8"/></a>
</p>

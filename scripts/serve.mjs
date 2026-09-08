#!/usr/bin/env bun
// Static server for the dossier. `bun run dev`.
import * as path from "path";

const WEB = path.join(import.meta.dir, "../web");
const server = Bun.serve({
  port: Number(process.env.PORT ?? 4173),
  async fetch(req) {
    const url = new URL(req.url);
    const file = Bun.file(path.join(WEB, url.pathname === "/" ? "index.html" : url.pathname));
    return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
  },
});
console.log(`dossier on http://localhost:${server.port}`);

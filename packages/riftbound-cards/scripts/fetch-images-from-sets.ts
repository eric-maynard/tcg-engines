#!/usr/bin/env bun
/**
 * Download card images from CDN URLs in src/data/sets/*.json into
 * downloads/card-images/{set}/{id}.png so /card-image/:id serves locally.
 *
 *   bun fetch-images-from-sets.ts
 */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import * as sets from "../src/data/sets/index";

const ROOT = join(import.meta.dir, "../../..");
const OUT = join(ROOT, "downloads/card-images");
const CONC = 12;

type Card = { id: string; imageUrl?: string; set?: string };
const cards: Card[] = [];
for (const s of Object.values(sets)) {
  for (const c of (s as { cards?: Card[] })?.cards ?? []) {
    if (c.id && c.imageUrl) cards.push(c);
  }
}
console.log(`fetching ${cards.length} card images → ${OUT}`);

let done = 0, skip = 0, fail = 0;
async function one(c: Card) {
  const setDir = (c.set ?? c.id.split("-")[0]).toLowerCase();
  const dest = join(OUT, setDir, `${c.id}.png`);
  if (existsSync(dest) && statSync(dest).size > 1000) { skip++; return; }
  mkdirSync(dirname(dest), { recursive: true });
  const url = c.imageUrl!.split("?")[0];
  try {
    const r = await fetch(url);
    if (!r.ok) { fail++; return; }
    await Bun.write(dest, await r.arrayBuffer());
    if (++done % 50 === 0) process.stdout.write(`  ${done + skip + fail}/${cards.length}\r`);
  } catch { fail++; }
}

const q = [...cards];
await Promise.all(Array.from({ length: CONC }, async () => {
  for (let c; (c = q.pop()); ) await one(c);
}));
console.log(`\ndone: ${done} downloaded, ${skip} skipped, ${fail} failed`);

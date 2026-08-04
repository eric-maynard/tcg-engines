#!/usr/bin/env bun
/**
 * Seed dev + dev2 accounts with starter decks on the running app.
 *   bun seed-dev-decks.ts [http://localhost:3000]
 */
import { getAllCards } from "../../../../riftbound-cards/src/data/all-cards";
import { buildDefaultDeck } from "./game-setup";

const BASE = process.argv[2] ?? "http://localhost:3000";
const j = (r: Response) => r.json().catch(() => ({}));

async function loginOrRegister(username: string, password: string) {
  let r = await fetch(`${BASE}/api/auth/login`, {
    body: JSON.stringify({ password, username }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!r.ok) {
    r = await fetch(`${BASE}/api/auth/register`, {
      body: JSON.stringify({ displayName: username, password, username }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }
  const b: any = await j(r);
  if (!b.token) throw new Error(`auth failed for ${username}: ${JSON.stringify(b)}`);
  return b.token as string;
}

const DECK_RECIPES: [string, string, string][] = [
  ["Jinx (Fury/Chaos)", "fury", "chaos"],
  ["Viktor (Mind/Order)", "mind", "order"],
  ["Lee Sin (Body/Calm)", "body", "calm"],
];

const all = getAllCards();

function toSavedDeck(name: string, d: ReturnType<typeof buildDefaultDeck>) {
  const count = (ids: string[]) => {
    const m: Record<string, number> = {};
    for (const id of ids) m[id] = (m[id] ?? 0) + 1;
    return m;
  };
  const cards: { cardId: string; quantity: number; zone: string }[] = [];
  for (const [cardId, quantity] of Object.entries(count(d.mainDeckCardIds))) {
    cards.push({ cardId, quantity, zone: "main" });
  }
  for (const [cardId, quantity] of Object.entries(count(d.runeDeckCardIds))) {
    cards.push({ cardId, quantity, zone: "rune" });
  }
  for (const cardId of d.battlefieldIds) {
    cards.push({ cardId, quantity: 1, zone: "battlefield" });
  }
  return {
    cards,
    championId: d.championId ?? d.mainDeckCardIds[0],
    description: `Starter deck (${name})`,
    format: "duel",
    gameVersion: "preview",
    isPublic: true,
    legendId: d.legendId ?? d.mainDeckCardIds[0],
    name,
  };
}

// login.html enforces client-side email format on the username field, so seed
// email-shaped usernames. Passwords stay short for dev convenience.
const ACCOUNTS: [string, string][] = [
  ["dev@riftbound.local", "dev"],
  ["dev2@riftbound.local", "dev2"],
];

for (const [user, password] of ACCOUNTS) {
  const token = await loginOrRegister(user, password);
  console.log(`[seed] ${user}: token ${token.slice(0, 8)}…`);
  const existing: any[] = (await j(
    await fetch(`${BASE}/api/saved-decks`, { headers: { authorization: `Bearer ${token}` } })
  )) as any[];
  const have = new Set(existing.map((d) => d.name));
  for (const [name, d1, d2] of DECK_RECIPES) {
    if (have.has(name)) {
      console.log(`  · ${name}: already present`);
      continue;
    }
    const deck = buildDefaultDeck(all as any[], d1, d2, "cheap");
    const body = toSavedDeck(name, deck);
    const r = await fetch(`${BASE}/api/saved-decks`, {
      body: JSON.stringify(body),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      method: "POST",
    });
    const rb: any = await j(r);
    console.log(
      `  · ${name}: ${r.status} main=${deck.mainDeckCardIds.length} runes=${deck.runeDeckCardIds.length} bf=${deck.battlefieldIds.length} legend=${body.legendId} champ=${body.championId}${rb.error ? " ERR " + rb.error : ""}`
    );
  }
}
console.log("[seed] done");

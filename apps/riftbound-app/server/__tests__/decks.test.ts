/**
 * Saved-deck naming + rune-mix adjustment.
 */

import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Isolated throwaway DB — must be set before the repo modules load.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rb-decks-test-"));
process.env.RIFTBOUND_DB_PATH = path.join(TMP_DIR, "test.db");

const { createDeck, getDeck, listDecks, uniqueDeckName, updateDeck } = await import("../../src/db/deck-repo");
const { closeDb } = await import("../../src/db/schema");
const { createUser } = await import("../../src/db/user-repo");
const { addToSideboard, adjustRuneMix, buildDefaultDeck, builderPayload, findSideboardViolation, getOrCreateSession, getSideboard, handleDeckBuilderRoutes, removeFromSideboard, savedDeckToDeckConfig } = await import("../decks");
const { allCards } = await import("../cards");
const { deckCardMeta, deckCounts, handleSavedDeckRoutes } = await import("../routes-deck");
const { generateToken } = await import("../routes-auth");

afterAll(() => {
  closeDb();
  fs.rmSync(TMP_DIR, { force: true, recursive: true });
});

const LEGEND_ID = "ogn-255-298"; // Nine-Tailed Fox (calm/mind)
const CHAMPION_ID = "ogn-066-298"; // Ahri, Alluring

describe("saved deck names", () => {
  const user = createUser(`decks-test-${crypto.randomUUID()}`, "pw");
  const base = { cards: [], championId: CHAMPION_ID, legendId: LEGEND_ID, userId: user.id };

  test("a duplicate name is saved as 'Name (1)', then 'Name (2)'", () => {
    expect(createDeck({ ...base, name: "Ahri Control" }).name).toBe("Ahri Control");
    expect(createDeck({ ...base, name: "Ahri Control" }).name).toBe("Ahri Control (1)");
    expect(createDeck({ ...base, name: "Ahri Control" }).name).toBe("Ahri Control (2)");
    // Re-saving an already-suffixed name continues the sequence instead of nesting "(1) (1)".
    expect(createDeck({ ...base, name: "Ahri Control (1)" }).name).toBe("Ahri Control (3)");
  });

  test("renaming onto a taken name is suffixed, renaming to its own name is not", () => {
    const a = createDeck({ ...base, name: "Alpha" });
    const b = createDeck({ ...base, name: "Beta" });
    expect(updateDeck(b.id, user.id, { name: "Alpha" })?.name).toBe("Alpha (1)");
    expect(updateDeck(a.id, user.id, { name: "Alpha" })?.name).toBe("Alpha");
    expect(uniqueDeckName(user.id, "Alpha", a.id)).toBe("Alpha");
  });

  test("names are scoped per user", () => {
    const other = createUser(`decks-test-${crypto.randomUUID()}`, "pw");
    expect(createDeck({ ...base, name: "Ahri Control", userId: other.id }).name).toBe("Ahri Control");
  });

  test("timestamps are ISO-8601 UTC so browsers don't read them as local time", () => {
    const [deck] = listDecks(user.id);
    expect(deck.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(deck.createdAt).toMatch(/Z$/);
  });

  test("list metadata resolves legend/champion names and domains", () => {
    expect(deckCardMeta({ championId: CHAMPION_ID, legendId: LEGEND_ID })).toEqual({
      championName: "Ahri, Alluring",
      domains: ["calm", "mind"],
      legendName: "Nine-Tailed Fox",
    });
    expect(deckCardMeta({ championId: "nope", legendId: "nope" })).toEqual({
      championName: null,
      domains: [],
      legendName: null,
    });
  });

  test("list rows carry per-zone counts (main includes the champion's own copy) + legend/champion ids for the My Decks art thumbnail", async () => {
    expect(deckCounts([
      { cardId: "a", quantity: 3, zone: "main" },
      { cardId: CHAMPION_ID, quantity: 1, zone: "main" },
      { cardId: "r", quantity: 12, zone: "rune" },
      { cardId: "s", quantity: 2, zone: "sideboard" },
      { cardId: "b", quantity: 1, zone: "battlefield" },
    ])).toEqual({ battlefield: 1, main: 4, rune: 12, sideboard: 2 });
    expect(deckCounts([])).toEqual({ battlefield: 0, main: 0, rune: 0, sideboard: 0 });
    const deck = createDeck({ ...base, cards: [{ cardId: "ogn-001-298", quantity: 2, zone: "main" }, { cardId: CHAMPION_ID, quantity: 1, zone: "main" }, { cardId: "ogn-042-298", quantity: 6, zone: "rune" }], name: "Counted" });
    const res = await handleSavedDeckRoutes(new Request("http://x/api/saved-decks", { headers: { Authorization: `Bearer ${generateToken(user.id)}` } }), new URL("http://x/api/saved-decks"), {} as never);
    const rows = (await res!.json()) as { id: string; legendId: string; championId: string; legendName: string; counts: unknown }[];
    const row = rows.find((r) => r.id === deck.id)!;
    expect(row.counts).toEqual({ battlefield: 0, main: 3, rune: 6, sideboard: 0 });
    expect(row.legendId).toBe(LEGEND_ID);
    expect(row.championId).toBe(CHAMPION_ID);
    expect(row.legendName).toBe("Nine-Tailed Fox");
  });
});

describe("adjustRuneMix", () => {
  function freshBuilder() {
    const builder = getOrCreateSession(crypto.randomUUID());
    const legend = allCards.find((c) => c.id === LEGEND_ID);
    builder.setLegend(legend as import("@tcg/riftbound-types/cards").LegendCard);
    return builder;
  }
  const counts = (builder: ReturnType<typeof freshBuilder>) => {
    const out: Record<string, number> = {};
    for (const r of builder.getState().runeDeck) {
      const d = typeof r.domain === "string" ? r.domain : "";
      out[d] = (out[d] ?? 0) + 1;
    }
    return out;
  };

  test("+1 toward a domain takes one from the other; total stays 12", () => {
    const b = freshBuilder();
    b.autoFillRuneDeck();
    expect(counts(b)).toEqual({ calm: 6, mind: 6 });
    expect(adjustRuneMix(b, "calm", 1)).toEqual({ success: true });
    expect(counts(b)).toEqual({ calm: 7, mind: 5 });
    expect(adjustRuneMix(b, "calm", -1)).toEqual({ success: true });
    expect(adjustRuneMix(b, "calm", -1)).toEqual({ success: true });
    expect(counts(b)).toEqual({ calm: 5, mind: 7 });
    expect(b.getState().runeDeck).toHaveLength(12);
  });

  test("fills an incomplete rune deck before adjusting", () => {
    const b = freshBuilder();
    expect(b.getState().runeDeck).toHaveLength(0);
    expect(adjustRuneMix(b, "mind", 1)).toEqual({ success: true });
    expect(counts(b)).toEqual({ calm: 5, mind: 7 });
  });

  test("can go all the way to 12/0 and refuses past it", () => {
    const b = freshBuilder();
    for (let i = 0; i < 6; i++) {expect(adjustRuneMix(b, "calm", 1).success).toBe(true);}
    expect(counts(b)).toEqual({ calm: 12 });
    const res = adjustRuneMix(b, "calm", 1);
    expect(res.success).toBe(false);
    expect(counts(b)).toEqual({ calm: 12 });
    expect(adjustRuneMix(b, "mind", 1).success).toBe(true);
    expect(counts(b)).toEqual({ calm: 11, mind: 1 });
  });

  test("rejects a domain outside the deck's identity", () => {
    const b = freshBuilder();
    b.autoFillRuneDeck();
    const res = adjustRuneMix(b, "fury", 1);
    expect(res.success).toBe(false);
    expect(counts(b)).toEqual({ calm: 6, mind: 6 });
  });
});

describe("sideboard (deck side)", () => {
  const user = createUser(`decks-sb-${crypto.randomUUID()}`, "pw");
  const starter = buildDefaultDeck(); // Fury/chaos, singleton-ish main deck
  const SIDE = ["ogn-005-298", "ogn-008-298", "ogn-014-298"]; // In-identity spells not in the starter

  test("savedDeckToDeckConfig keeps zone==='sideboard' entries OUT of the main deck and hands them over as sideboardCardIds; starter decks have none", () => {
    expect(starter.sideboardCardIds).toBeUndefined();
    const cards = [
      ...starter.mainDeckCardIds.map((cardId) => ({ cardId, quantity: 1, zone: "main" as const })),
      { cardId: starter.runeDeckCardIds[0] as string, quantity: 12, zone: "rune" as const },
      { cardId: SIDE[0] as string, quantity: 2, zone: "sideboard" as const },
      { cardId: SIDE[1] as string, quantity: 1, zone: "sideboard" as const },
    ];
    const saved = createDeck({ cards, championId: starter.championId as string, legendId: starter.legendId as string, name: "SB deck", userId: user.id });
    const full = getDeck(saved.id)!;
    // GET /api/saved-decks/:id (getDeck) returns the sideboard entries.
    expect(full.cards.filter((c) => c.zone === "sideboard").map((c) => [c.cardId, c.quantity])).toEqual([[SIDE[0], 2], [SIDE[1], 1]]);
    const config = savedDeckToDeckConfig(full)!;
    expect(config).not.toBeNull();
    expect(config.sideboardCardIds).toEqual([SIDE[0], SIDE[0], SIDE[1]]);
    expect(config.mainDeckCardIds).toHaveLength(starter.mainDeckCardIds.length);
    expect(config.mainDeckCardIds).not.toContain(SIDE[0]);
  });

  test("an illegal saved sideboard (over 10, wrong type, or >3 copies across main+side) is KEPT — legality is advisory — and the deck still loads; findSideboardViolation still describes it", () => {
    const tooMany = { cardId: SIDE[2] as string, quantity: 11, zone: "sideboard" as const };
    const bf = { cardId: starter.battlefieldIds[0] as string, quantity: 1, zone: "sideboard" as const };
    const fourth = { cardId: starter.mainDeckCardIds[0] as string, quantity: 3, zone: "sideboard" as const }; // 1 in main + 3
    for (const bad of [tooMany, bf, fourth]) {
      const cards = [
        ...starter.mainDeckCardIds.map((cardId) => ({ cardId, quantity: 1, zone: "main" as const })),
        { cardId: starter.runeDeckCardIds[0] as string, quantity: 12, zone: "rune" as const },
        bad,
      ];
      const saved = createDeck({ cards, championId: starter.championId as string, legendId: starter.legendId as string, name: "bad sb", userId: user.id });
      const config = savedDeckToDeckConfig(getDeck(saved.id)!);
      expect(config).not.toBeNull();
      expect(config!.sideboardCardIds).toHaveLength(bad.quantity);
    }
    expect(findSideboardViolation(undefined)).toBeNull();
    expect(findSideboardViolation([])).toBeNull();
    expect(findSideboardViolation(Array.from({ length: 10 }, (_, i) => SIDE[i % 3] as string))).toBeNull();
    expect(findSideboardViolation(Array.from({ length: 11 }, (_, i) => SIDE[i % 3] as string))).toContain("at most 10");
    expect(findSideboardViolation([starter.legendId as string])).toContain("legend");
  });

  test("builder session is lenient: sideboard add/remove only refuses non-main-deck types; the 10-card cap, domain identity and the combined 3-copy limit surface in payload.legality instead", () => {
    const sid = crypto.randomUUID();
    const b = getOrCreateSession(sid);
    const card = (id: string) => allCards.find((c) => c.id === id)!;
    b.setLegend(card(starter.legendId as string) as import("@tcg/riftbound-types/cards").LegendCard);
    b.setChampion(card(starter.championId as string) as import("@tcg/riftbound-types/cards").UnitCard);
    expect(addToSideboard(sid, b, card(starter.battlefieldIds[0] as string)).success).toBe(false); // Wrong type
    // Off-identity card (Ahri: calm — outside fury/chaos) is accepted but flagged.
    expect(addToSideboard(sid, b, card("ogn-066-298")).success).toBe(true);
    expect(builderPayload(sid, b).legality.problems.map((p: { code: string }) => p.code)).toContain("SIDEBOARD_DOMAIN_VIOLATION");
    expect(removeFromSideboard(sid, "ogn-066-298")).toBe(true);
    // Combined copy limit: 2 in main + 1 in side OK, a 4th anywhere is accepted and reported.
    const x = card(SIDE[0] as string);
    expect(b.addToMainDeck(x).success).toBe(true);
    expect(b.addToMainDeck(x).success).toBe(true);
    expect(addToSideboard(sid, b, x)).toEqual({ success: true });
    expect(builderPayload(sid, b).legality.problems.some((p: { code: string }) => p.code === "TOO_MANY_COPIES")).toBe(false);
    expect(addToSideboard(sid, b, x).success).toBe(true);
    expect(builderPayload(sid, b).stats.copies[x.name]).toBe(4);
    const tooMany = builderPayload(sid, b).legality.problems.find((p: { code: string }) => p.code === "TOO_MANY_COPIES") as { cardIds: string[]; message: string };
    expect(tooMany.cardIds).toEqual([x.id]);
    expect(tooMany.message).toContain("4 copies");
    expect(removeFromSideboard(sid, x.id)).toBe(true);
    // Fill to 10 — fine; the 11th is accepted and flagged SIDEBOARD_TOO_LARGE.
    const y = card(SIDE[1] as string);
    const z = card(SIDE[2] as string);
    for (const c of [y, y, y, z, z, z]) {expect(addToSideboard(sid, b, c).success).toBe(true);}
    const pool = allCards.filter((c) => c.cardType === "unit" && !("isChampion" in c && c.isChampion) && c.domain === "fury" && !SIDE.includes(c.id));
    for (const c of pool.slice(0, 3)) {expect(addToSideboard(sid, b, c).success).toBe(true);}
    let payload = builderPayload(sid, b);
    expect(payload.state.sideboard).toHaveLength(10);
    expect(payload.stats.sideboardCount).toBe(10);
    expect(payload.stats.sideboardMax).toBe(10);
    expect(payload.legality.problems.some((p: { code: string }) => p.code === "SIDEBOARD_TOO_LARGE")).toBe(false);
    expect(addToSideboard(sid, b, pool[3]!).success).toBe(true);
    payload = builderPayload(sid, b);
    expect(payload.stats.sideboardCount).toBe(11);
    expect(payload.legality.legal).toBe(false);
    expect(payload.legality.problems.map((p: { code: string }) => p.code)).toContain("SIDEBOARD_TOO_LARGE");
    expect(removeFromSideboard(sid, y.id)).toBe(true);
    expect(removeFromSideboard(sid, "nope")).toBe(false);
    expect(getSideboard(sid)).toHaveLength(10);
  });

  test("import keeps the 'Sideboard:' section and export writes it back", async () => {
    const create = await handleDeckBuilderRoutes(new Request("http://x/api/deck/create", { method: "POST" }), new URL("http://x/api/deck/create"), {} as never);
    const { sessionId } = (await create!.json()) as { sessionId: string };
    const name = (id: string) => allCards.find((c) => c.id === id)!.name;
    const text = [
      `Legend:\n1 ${name(starter.legendId as string)}`,
      `Champion:\n1 ${name(starter.championId as string)}`,
      `MainDeck:\n${starter.mainDeckCardIds.slice(0, 10).map((id) => `1 ${name(id)}`).join("\n")}`,
      `Sideboard:\n2 ${name(SIDE[0] as string)}\n1 ${name(SIDE[1] as string)}`,
    ].join("\n\n");
    const imp = await handleDeckBuilderRoutes(
      new Request(`http://x/api/deck/${sessionId}/import`, { body: JSON.stringify({ text }), headers: { "Content-Type": "application/json" }, method: "POST" }),
      new URL(`http://x/api/deck/${sessionId}/import`),
      {} as never,
    );
    const body = (await imp!.json()) as { errors: string[]; state: { sideboard: { id: string }[] }; stats: { sideboardCount: number } };
    expect(body.errors.filter((e) => e.startsWith("Sideboard"))).toEqual([]);
    expect(body.state.sideboard.map((c) => c.id)).toEqual([SIDE[0], SIDE[0], SIDE[1]]);
    expect(body.stats.sideboardCount).toBe(3);
    const exp = await handleDeckBuilderRoutes(new Request(`http://x/api/deck/${sessionId}/export`), new URL(`http://x/api/deck/${sessionId}/export`), {} as never);
    const out = await exp!.text();
    expect(out).toContain(`Sideboard:\n2 ${name(SIDE[0] as string)}\n1 ${name(SIDE[1] as string)}`);
    // Re-import clears the previous sideboard first (no doubling).
    const again = await handleDeckBuilderRoutes(
      new Request(`http://x/api/deck/${sessionId}/import`, { body: JSON.stringify({ text }), headers: { "Content-Type": "application/json" }, method: "POST" }),
      new URL(`http://x/api/deck/${sessionId}/import`),
      {} as never,
    );
    expect(((await again!.json()) as { stats: { sideboardCount: number } }).stats.sideboardCount).toBe(3);
  });
});

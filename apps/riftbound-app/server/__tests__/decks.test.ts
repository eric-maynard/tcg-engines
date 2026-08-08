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

const { createDeck, listDecks, uniqueDeckName, updateDeck } = await import("../../src/db/deck-repo");
const { closeDb } = await import("../../src/db/schema");
const { createUser } = await import("../../src/db/user-repo");
const { adjustRuneMix, getOrCreateSession } = await import("../decks");
const { allCards } = await import("../cards");
const { deckCardMeta } = await import("../routes-deck");

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

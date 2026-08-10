/**
 * Interaction (deck construction): Relentless Storm (ogn-249-298 · Legend · Fury/Body · tag Volibear)
 *   × Volibear, Furious  (ogn-041-298 · Champion Unit · Fury · tag Volibear)
 *   × Volibear, Imposing (ogn-158-298 · Champion Unit · Body · tag Volibear)
 *
 * Rules: 103.2 (a Main Deck of at least 40 cards: "A Chosen Champion Unit, as well as Units, Gear,
 * and Spells" — the Chosen Champion IS a Main Deck card), 103.2.a.2 (Chosen Champion = champion
 * unit whose tag matches the legend's), 103.2.b (up to 3 copies of the same NAMED card),
 * 103.2.b.1 ("This includes your Chosen Champion" — the very example: Volibear, Furious as Chosen
 * Champion + 2 more copies), 103.2.b.2 (different names are different cards even for the same
 * character), 103.1.b.3 (a single-Domain card is legal in an identity containing that Domain),
 * 112 (setup: the Chosen Champion is separated out and placed in the Champion Zone).
 *
 * Question:
 *  A. Chosen Champion = Furious + 2 more Furious + 3 Imposing in the deck — legal?
 *  B. Chosen Champion = Furious + 3 MORE Furious ("the Champion Zone copy isn't in the Main Deck")
 *     — is the 4th copy rejected, naming Volibear, Furious with count 4?
 *  C. Chosen Champion = Imposing (Body) under the Fury/Body legend with 3 Furious in the deck —
 *     legal, and does setup put IMPOSING (not a Furious) in the Champion Zone, leaving all three
 *     Furious in the shuffled deck?
 *
 * Surfaces under test: the engine's DeckBuilder (the construction surface the app drives — the
 * champion lives in its own slot, exactly the "it isn't in the Main Deck" framing), the raw
 * validateDeck (contract per rule 103.2 / DeckBuilder.validate: `mainDeck` lists the Chosen
 * Champion too), and the constructed-deck setup path (Game.fromDecks → placeChampion, rule 112).
 */
import { describe, expect, test } from "bun:test";
import { DeckBuilder } from "../../../deckbuilder/deck-builder";
import { basicRuneDef, Game, loadDefaultCardPool, P1 } from "../../../harness";
import type { CardDefLike, CardPool } from "../../../harness";
import { validateDeck } from "../../../validators/deck-validators";

const RELENTLESS_STORM = "ogn-249-298";
const VOLIBEAR_FURIOUS = "ogn-041-298";
const VOLIBEAR_IMPOSING = "ogn-158-298";
const WAR_CAMP = "ogn-294-298"; // inert-ish battlefield for the opponent in the setup test

/** The deck builder / validator take the typed Card union; pool defs are structurally those same objects. */
type AnyCard = never;

interface Kit {
  pool: CardPool;
  legend: CardDefLike;
  furious: CardDefLike;
  imposing: CardDefLike;
  /** Distinct-named, non-champion, non-signature Fury/Body main-deck cards (one def per name). */
  fillerNames: CardDefLike[];
  rune: CardDefLike;
  battlefields: CardDefLike[];
}

async function kit(): Promise<Kit> {
  const pool = await loadDefaultCardPool();
  const seen = new Set<string>();
  const fillerNames = pool
    .all()
    .filter(
      (c) =>
        (c.cardType === "unit" || c.cardType === "spell" || c.cardType === "gear") &&
        (c.domain === "fury" || c.domain === "body") &&
        c.isChampion !== true &&
        c.isSignature !== true &&
        !(c.tags ?? []).includes("Volibear") &&
        !(c.keywords ?? []).includes("Unique"),
    )
    .filter((c) => (seen.has(c.name ?? "") ? false : Boolean(seen.add(c.name ?? ""))));
  expect(fillerNames.length).toBeGreaterThanOrEqual(13);
  const battlefields = pool
    .all()
    .filter((c) => c.cardType === "battlefield" && c.domain === undefined)
    .filter((c, i, all) => all.findIndex((o) => o.name === c.name) === i)
    .slice(0, 3);
  return {
    battlefields,
    fillerNames,
    furious: pool.get(VOLIBEAR_FURIOUS)!,
    imposing: pool.get(VOLIBEAR_IMPOSING)!,
    legend: pool.get(RELENTLESS_STORM)!,
    pool,
    rune: basicRuneDef(pool, "fury"),
  };
}

/** `n` filler cards as full 3-ofs of distinct names (n must be ≤ 3 × available names). */
function filler(k: Kit, n: number): CardDefLike[] {
  const out: CardDefLike[] = [];
  for (const def of k.fillerNames) {
    for (let i = 0; i < 3 && out.length < n; i++) {
      out.push(def);
    }
    if (out.length >= n) {
      break;
    }
  }
  expect(out).toHaveLength(n);
  return out;
}

/** A DeckBuilder with Relentless Storm set, `champion` chosen, 12 runes and 3 battlefields — main deck still empty. */
function builderFor(k: Kit, champion: CardDefLike): DeckBuilder {
  const b = new DeckBuilder(k.pool.all() as AnyCard[], "duel");
  b.setLegend(k.legend as AnyCard);
  expect(b.setChampion(champion as AnyCard)).toEqual({ success: true });
  b.autoFillRuneDeck();
  for (const bf of b.getAvailableBattlefields().slice(0, 12)) {
    if (b.getState().battlefields.length < 3) {
      b.addBattlefield(bf);
    }
  }
  expect(b.getState().runeDeck).toHaveLength(12);
  expect(b.getState().battlefields).toHaveLength(3);
  return b;
}

function addAll(b: DeckBuilder, cards: readonly CardDefLike[]): void {
  for (const c of cards) {
    expect(b.addToMainDeck(c as AnyCard)).toEqual({ success: true });
  }
}

describe("Side A — Chosen Champion Furious + 2 Furious + 3 Imposing (103.2.b.1's own example)", () => {
  test("DeckBuilder accepts 2 more Furious and 3 Imposing next to the chosen Furious; the finished 40-card deck validates clean", async () => {
    const k = await kit();
    const b = builderFor(k, k.furious);
    addAll(b, [k.furious, k.furious, k.imposing, k.imposing, k.imposing]);
    addAll(b, filler(k, 34)); // 1 (champion) + 2 + 3 + 34 = 40
    expect(b.getStats().mainDeckCount).toBe(40); // the champion counts toward the 40 (103.2)
    expect(b.getCopyCounts()["Volibear, Furious"]).toBe(3); // chosen copy included (103.2.b.1)
    expect(b.getCopyCounts()["Volibear, Imposing"]).toBe(3); // its own name, its own cap (103.2.b.2)
    expect(b.validate()).toEqual({ errors: [], valid: true });
  });

  test("raw validateDeck (mainDeck lists the Chosen Champion, per 103.2): 3 Furious total + 3 Imposing is legal — different names, separate caps", async () => {
    const k = await kit();
    const mainDeck = [k.furious, k.furious, k.furious, k.imposing, k.imposing, k.imposing, ...filler(k, 34)];
    expect(mainDeck).toHaveLength(40);
    const result = validateDeck({
      battlefields: k.battlefields,
      chosenChampion: k.furious,
      legend: k.legend,
      mainDeck,
      mode: "duel",
      runeDeck: Array.from({ length: 12 }, () => k.rune),
    } as AnyCard);
    expect(result).toEqual({ errors: [], valid: true });
  });

  test("Imposing (Body) and Furious (Fury) each fit the Fury/Body identity as single-Domain cards (103.1.b.3) — no DOMAIN error for either", async () => {
    const k = await kit();
    expect(k.legend.domain).toEqual(["fury", "body"]);
    expect(k.furious.domain).toBe("fury");
    expect(k.imposing.domain).toBe("body");
    const b = builderFor(k, k.furious);
    const available = b.getAvailableMainDeckCards().map((c) => c.id as string);
    expect(available).toContain(VOLIBEAR_FURIOUS);
    expect(available).toContain(VOLIBEAR_IMPOSING);
  });
});

describe("Side B — Chosen Champion Furious + 3 MORE Furious: the Champion-Zone copy still counts (103.2, 103.2.b.1)", () => {
  test("DeckBuilder: with Furious in the champion slot, the 1st and 2nd extra Furious are accepted and the 3rd extra (4th overall) is refused with MAX_COPIES", async () => {
    const k = await kit();
    const b = builderFor(k, k.furious);
    expect(b.getCopyCounts()["Volibear, Furious"]).toBe(1); // the slot copy alone already counts 1
    expect(b.addToMainDeck(k.furious as AnyCard)).toEqual({ success: true });
    expect(b.addToMainDeck(k.furious as AnyCard)).toEqual({ success: true });
    const fourth = b.addToMainDeck(k.furious as AnyCard);
    expect(fourth.success).toBe(false);
    expect(fourth).toMatchObject({ error: { code: "MAX_COPIES", message: expect.stringContaining("Volibear, Furious") } });
    expect(b.getCopyCounts()["Volibear, Furious"]).toBe(3);
    // ...and Furious is no longer offered as an addable card at all.
    expect(b.getAvailableMainDeckCards().map((c) => c.id as string)).not.toContain(VOLIBEAR_FURIOUS);
    // Imposing is unaffected by Furious hitting its cap (103.2.b.2).
    expect(b.getAvailableMainDeckCards().map((c) => c.id as string)).toContain(VOLIBEAR_IMPOSING);
  });

  test("DeckBuilder.validate on a force-loaded 1 + 3 list reports TOO_MANY_COPIES naming Volibear, Furious with 4 copies — the deck is illegal", async () => {
    const k = await kit();
    const b = builderFor(k, k.furious);
    const legal = b.getState();
    // An imported/hand-edited list that bypassed addToMainDeck: champion slot Furious + 3 Furious "in the deck".
    b.loadState({ ...legal, mainDeck: [k.furious, k.furious, k.furious, ...filler(k, 36)] as AnyCard[] });
    expect(b.getStats().mainDeckCount).toBe(40);
    expect(b.getCopyCounts()["Volibear, Furious"]).toBe(4);
    const result = b.validate();
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "TOO_MANY_COPIES",
      message: expect.stringMatching(/Volibear, Furious.*4/),
    });
    // Nothing else is wrong with this deck — the copy count is the only violation.
    expect(result.errors).toHaveLength(1);
  });

  test("raw validateDeck with the Chosen Champion listed in mainDeck (103.2): 4 × Volibear, Furious → exactly one TOO_MANY_COPIES error, count 4", async () => {
    const k = await kit();
    const mainDeck = [k.furious, k.furious, k.furious, k.furious, ...filler(k, 36)];
    const result = validateDeck({
      battlefields: k.battlefields,
      chosenChampion: k.furious,
      legend: k.legend,
      mainDeck,
      mode: "duel",
      runeDeck: Array.from({ length: 12 }, () => k.rune),
    } as AnyCard);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      { code: "TOO_MANY_COPIES", message: expect.stringMatching(/"Volibear, Furious" has 4 copies/) },
    ]);
  });
});

describe("Side C — Chosen Champion Imposing (Body) under Fury/Body with 3 Furious in the deck", () => {
  test("DeckBuilder: Imposing is a legal champion for Relentless Storm (Volibear tag, 103.2.a.2); 3 Furious go in beside it; the deck validates clean", async () => {
    const k = await kit();
    const probe = new DeckBuilder(k.pool.all() as AnyCard[], "duel");
    probe.setLegend(k.legend as AnyCard);
    const legalChampions = probe.getLegalChampions().map((c) => c.id as string);
    expect(legalChampions).toContain(VOLIBEAR_IMPOSING);
    expect(legalChampions).toContain(VOLIBEAR_FURIOUS);

    const b = builderFor(k, k.imposing);
    addAll(b, [k.furious, k.furious, k.furious]);
    expect(b.addToMainDeck(k.furious as AnyCard).success).toBe(false); // Furious' own cap is still 3
    addAll(b, filler(k, 36)); // 1 + 3 + 36 = 40
    expect(b.getCopyCounts()).toMatchObject({ "Volibear, Furious": 3, "Volibear, Imposing": 1 });
    expect(b.validate()).toEqual({ errors: [], valid: true });
    expect(b.export()).toMatchObject({ championId: VOLIBEAR_IMPOSING, legendId: RELENTLESS_STORM });
    expect(b.export()?.mainDeckIds.filter((id) => id === VOLIBEAR_FURIOUS)).toHaveLength(3);
    expect(b.export()?.mainDeckIds).not.toContain(VOLIBEAR_IMPOSING); // the chosen copy travels as championId, not as a deck entry
  });

  test("setup (rule 112): Game.fromDecks puts exactly the designated Volibear, IMPOSING in P1's Champion Zone and leaves all 3 Furious among P1's shuffled deck + opening hand", async () => {
    const k = await kit();
    const fillerIds = filler(k, 36).map((c) => c.id as string);
    const p1 = {
      battlefieldIds: [WAR_CAMP],
      championId: VOLIBEAR_IMPOSING,
      legendId: RELENTLESS_STORM,
      mainDeckCardIds: [VOLIBEAR_FURIOUS, VOLIBEAR_FURIOUS, VOLIBEAR_FURIOUS, ...fillerIds],
      runeDeckCardIds: Array.from({ length: 12 }, () => k.rune.id as string),
    };
    const p2 = {
      battlefieldIds: [k.battlefields.find((b) => b.id !== WAR_CAMP)?.id as string],
      mainDeckCardIds: Array.from({ length: 40 }, () => "ogn-175-298"),
      runeDeckCardIds: Array.from({ length: 12 }, () => k.rune.id as string),
    };
    const game = await Game.fromDecks({ p1, p2, seed: "volibear-champion-slot" });
    await game.settle();

    // Champion Zone: one card, and it is Imposing.
    const championZone = game.p1.cardsAt("championZone");
    expect(championZone).toHaveLength(1);
    const champ = game.p1.champion() as string;
    expect(game.state(champ)).toMatchObject({ defId: VOLIBEAR_IMPOSING, name: "Volibear, Imposing", owner: P1, zone: "championZone" });

    // Legend Zone: Relentless Storm.
    expect(game.state(game.p1.legend() as string).defId).toBe(RELENTLESS_STORM);

    // All three Furious are still "in the deck" (deck ∪ opening hand after the shuffle/draw) — none was
    // pulled into the Champion Zone, and no Imposing exists anywhere but the Champion Zone.
    const furious = game.findAll({ defId: VOLIBEAR_FURIOUS, owner: P1 });
    expect(furious).toHaveLength(3);
    for (const id of furious) {
      expect(["mainDeck", "hand"]).toContain(game.zoneOf(id));
    }
    expect(game.findAll({ defId: VOLIBEAR_IMPOSING, owner: P1 })).toEqual([champ]);
    // 39 listed deck entries + 1 champion = the 40-card Main Deck of rule 103.2.
    expect(game.p1.deck().length + game.p1.hand().length).toBe(39);
    expect(game.violations()).toEqual([]);
  });
});

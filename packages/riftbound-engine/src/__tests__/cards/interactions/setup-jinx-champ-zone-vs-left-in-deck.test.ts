/**
 * Interaction (deck construction + setup): Loose Cannon (ogn-251-298 · Legend · Fury/Chaos · tag Jinx)
 *   × Jinx, Rebel (ogn-202-298 · Champion Unit · Chaos · tag Jinx)
 *   × Jinx, Demolitionist (ogn-030-298 · Champion Unit · Fury · tag Jinx)
 *
 * Question. Legal side: Loose Cannon + a 40-card Main Deck whose Chosen Champion is Jinx, Rebel, with 2
 * more Jinx, Rebel and 3 Jinx, Demolitionist also in the deck. After setup (111–114): exactly one Jinx,
 * Rebel in the Champion Zone, Loose Cannon in the Legend Zone, the other 39 cards shuffled into the Main
 * Deck zone, and the other 2 Rebel + 3 Demolitionist still in the deck and legal?
 * Illegal sides: (a) same 40 but NO card designated as Chosen Champion — rejected rather than a Jinx unit
 * being auto-picked? (b) no Champion Legend — rejected (103.1)? (c) 39 cards total counting the
 * champion — rejected as under 40 (103.2 counts the Chosen Champion inside the 40)?
 *
 * Rules: 103.1 / 103.1.a / 103.1.b (one Champion Legend → Legend Zone; it dictates Domain Identity),
 * 103.2 ("A Main Deck of at least 40 cards: A Chosen Champion Unit, as well as Units, Gear, and Spells"),
 * 103.2.a.1–3 (the designated copy starts in the Champion Zone; other same-name copies also COUNT as
 * Chosen Champion during play but stay in the deck), 103.2.b.1 (3-copy cap includes the chosen copy),
 * 103.2.b.2 (different names = different cards), 108.3.b / 108.3.e (Champion Zone, public), 111, 112,
 * 114 (separate legend, separate champion, shuffle the rest into the Main Deck zone).
 *
 * Surfaces: the engine's DeckBuilder / validateDeck (construction legality) and Game.fromDecks (the
 * constructed-deck setup path: placeLegend / placeChampion / shuffle / opening draw).
 */
import { describe, expect, test } from "bun:test";
import { DeckBuilder } from "../../../deckbuilder/deck-builder";
import { basicRuneDef, Game, isHiddenView, loadDefaultCardPool, P1, P2 } from "../../../harness";
import type { CardDefLike, CardPool } from "../../../harness";
import { validateDeck } from "../../../validators/deck-validators";

const LOOSE_CANNON = "ogn-251-298";
const JINX_REBEL = "ogn-202-298";
const JINX_DEMOLITIONIST = "ogn-030-298";

/** DeckBuilder / validateDeck take the typed Card union; pool defs are structurally those objects. */
type AnyCard = never;

interface Kit {
  pool: CardPool;
  legend: CardDefLike;
  rebel: CardDefLike;
  demo: CardDefLike;
  /** Distinct-named fury/chaos main-deck cards that are not champions, signatures, Jinx-tagged or Unique. */
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
        (c.domain === "fury" || c.domain === "chaos") &&
        c.isChampion !== true &&
        c.isSignature !== true &&
        c.isToken !== true &&
        !(c.tags ?? []).includes("Jinx") &&
        !(c.keywords ?? []).includes("Unique"),
    )
    .filter((c) => (seen.has(c.name ?? "") ? false : Boolean(seen.add(c.name ?? ""))));
  expect(fillerNames.length).toBeGreaterThanOrEqual(13);
  const battlefields = pool
    .all()
    .filter((c) => c.cardType === "battlefield" && c.domain === undefined)
    .filter((c, i, all) => all.findIndex((o) => o.name === c.name) === i)
    .slice(0, 3);
  expect(battlefields).toHaveLength(3);
  return {
    battlefields,
    demo: pool.get(JINX_DEMOLITIONIST)!,
    fillerNames,
    legend: pool.get(LOOSE_CANNON)!,
    pool,
    rebel: pool.get(JINX_REBEL)!,
    rune: basicRuneDef(pool, "chaos"),
  };
}

/** `n` filler cards as 3-ofs of distinct names. */
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

/** The 5 extra Jinx champions that ride in the Main Deck next to the chosen Rebel. */
function jinxPackage(k: Kit): CardDefLike[] {
  return [k.rebel, k.rebel, k.demo, k.demo, k.demo];
}

/** Builder with Loose Cannon set, optional champion, 12 chaos runes and 3 battlefields; main deck empty. */
function builderFor(k: Kit, champion: CardDefLike | null): DeckBuilder {
  const b = new DeckBuilder(k.pool.all() as AnyCard[], "duel");
  b.setLegend(k.legend as AnyCard);
  if (champion) {
    expect(b.setChampion(champion as AnyCard)).toEqual({ success: true });
  }
  b.autoFillRuneDeck();
  for (const bf of b.getAvailableBattlefields()) {
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

function rawConfig(k: Kit, mainDeck: readonly CardDefLike[], chosenChampion: CardDefLike = k.rebel) {
  return {
    battlefields: k.battlefields,
    chosenChampion,
    legend: k.legend,
    mainDeck: [...mainDeck],
    mode: "duel",
    runeDeck: Array.from({ length: 12 }, () => k.rune),
  } as AnyCard;
}

/** Game.fromDecks config for the legal Jinx list (39 deck entries + the designated Rebel as championId). */
function legalDeckConfig(k: Kit, opts: { championId?: string | undefined; legendId?: string | undefined; deckEntries?: string[] } = {}) {
  const entries = opts.deckEntries ?? [...jinxPackage(k), ...filler(k, 34)].map((c) => c.id as string);
  return {
    battlefieldIds: [k.battlefields[0]?.id as string],
    ...("championId" in opts ? (opts.championId ? { championId: opts.championId } : {}) : { championId: JINX_REBEL }),
    ...("legendId" in opts ? (opts.legendId ? { legendId: opts.legendId } : {}) : { legendId: LOOSE_CANNON }),
    mainDeckCardIds: entries,
    runeDeckCardIds: Array.from({ length: 12 }, () => k.rune.id as string),
  };
}

function opponentDeck(k: Kit) {
  return {
    battlefieldIds: [k.battlefields[1]?.id as string],
    championId: JINX_REBEL,
    legendId: LOOSE_CANNON,
    mainDeckCardIds: filler(k, 39).map((c) => c.id as string),
    runeDeckCardIds: Array.from({ length: 12 }, () => k.rune.id as string),
  };
}

// ---------------------------------------------------------------------------------------------------

describe("Legal side — Loose Cannon + chosen Jinx, Rebel + 2 Rebel + 3 Demolitionist in a 40-card Main Deck", () => {
  test("card facts: Loose Cannon is a Fury/Chaos legend tagged Jinx; Rebel (Chaos) and Demolitionist (Fury) are Jinx-tagged CHAMPION units with different names (103.2.a.2, 103.2.b.2)", async () => {
    const k = await kit();
    expect(k.legend).toMatchObject({ cardType: "legend", championTag: "Jinx", domain: ["fury", "chaos"], name: "Loose Cannon" });
    expect(k.rebel).toMatchObject({ cardType: "unit", domain: "chaos", isChampion: true, name: "Jinx, Rebel", tags: ["Jinx"] });
    expect(k.demo).toMatchObject({ cardType: "unit", domain: "fury", isChampion: true, name: "Jinx, Demolitionist", tags: ["Jinx"] });
    expect(k.rebel.name).not.toBe(k.demo.name);
  });

  test("DeckBuilder: both Jinx champions are legal Chosen Champions for Loose Cannon; with Rebel chosen, 2 more Rebel + 3 Demolitionist + 34 filler = 40 validates clean", async () => {
    const k = await kit();
    const probe = new DeckBuilder(k.pool.all() as AnyCard[], "duel");
    probe.setLegend(k.legend as AnyCard);
    expect(probe.getDomainIdentity()).toEqual(["fury", "chaos"]); // 103.1.b
    const legalChampions = probe.getLegalChampions().map((c) => c.id as string);
    expect(legalChampions).toContain(JINX_REBEL);
    expect(legalChampions).toContain(JINX_DEMOLITIONIST);

    const b = builderFor(k, k.rebel);
    addAll(b, jinxPackage(k));
    addAll(b, filler(k, 34));
    expect(b.getStats().mainDeckCount).toBe(40); // 1 (chosen) + 5 + 34 — the champion is inside the 40 (103.2)
    expect(b.getCopyCounts()).toMatchObject({ "Jinx, Demolitionist": 3, "Jinx, Rebel": 3 }); // 103.2.b.1 / .b.2
    expect(b.addToMainDeck(k.rebel as AnyCard).success).toBe(false); // a 4th Rebel (3rd in-deck) is over the cap
    expect(b.addToMainDeck(k.demo as AnyCard).success).toBe(false); // Demolitionist has its own, now full, cap
    expect(b.getStats().isComplete).toBe(true);
    expect(b.validate()).toEqual({ errors: [], valid: true });
    // The chosen copy travels in its own slot; the deck entries carry only the OTHER two Rebels.
    const exported = b.export();
    expect(exported).toMatchObject({ championId: JINX_REBEL, legendId: LOOSE_CANNON });
    expect(exported?.mainDeckIds).toHaveLength(39);
    expect(exported?.mainDeckIds.filter((id) => id === JINX_REBEL)).toHaveLength(2);
    expect(exported?.mainDeckIds.filter((id) => id === JINX_DEMOLITIONIST)).toHaveLength(3);
  });

  test("raw validateDeck (mainDeck lists the Chosen Champion, per 103.2): 3 Rebel + 3 Demolitionist + 34 = 40 → valid, no copy / domain / champion errors", async () => {
    const k = await kit();
    const mainDeck = [k.rebel, ...jinxPackage(k), ...filler(k, 34)];
    expect(mainDeck).toHaveLength(40);
    expect(validateDeck(rawConfig(k, mainDeck))).toEqual({ errors: [], valid: true });
  });

  test("setup 111/112: Loose Cannon lands in P1's Legend Zone and EXACTLY ONE Jinx, Rebel — the designated copy — in P1's Champion Zone", async () => {
    const k = await kit();
    const game = await Game.fromDecks({ p1: legalDeckConfig(k), p2: opponentDeck(k), seed: "jinx-setup" });
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.p1.cardsAt("legendZone")).toHaveLength(1);
    expect(game.state(game.p1.legend() as string)).toMatchObject({ defId: LOOSE_CANNON, name: "Loose Cannon", owner: P1, zone: "legendZone" });
    const champs = game.p1.cardsAt("championZone");
    expect(champs).toHaveLength(1);
    expect(game.state(champs[0] as string)).toMatchObject({ cardType: "unit", defId: JINX_REBEL, name: "Jinx, Rebel", owner: P1, zone: "championZone" });
    expect(game.violations()).toEqual([]);
  });

  test("108.3.e: the Champion Zone is public — P2's view of P1's champion shows its identity (not a hidden card back)", async () => {
    const k = await kit();
    const game = await Game.fromDecks({ p1: legalDeckConfig(k), p2: opponentDeck(k), seed: "jinx-setup" });
    await game.settle();
    const champ = game.p1.champion() as string;
    const seenByP2 = (game.view(P2).zones.championZone ?? []).filter((v) => !isHiddenView(v) && v.owner === P1);
    expect(seenByP2).toHaveLength(1);
    const [view] = seenByP2;
    expect(view && !isHiddenView(view) ? { id: view.id, name: view.name } : null).toEqual({ id: champ, name: "Jinx, Rebel" });
    // …whereas P1's deck stays secret to P2.
    expect((game.view(P2).zones.mainDeck ?? []).filter((v) => !isHiddenView(v) && v.owner === P1)).toEqual([]);
  });

  test("setup 114: the other 39 cards form P1's Main Deck (deck ∪ opening hand = 39) and were shuffled — the deck is not in list order", async () => {
    const k = await kit();
    const game = await Game.fromDecks({ p1: legalDeckConfig(k), p2: opponentDeck(k), seed: "jinx-setup" });
    await game.settle();
    const deck = game.p1.deck();
    const hand = game.p1.hand();
    expect(deck.length + hand.length).toBe(39); // 40-card Main Deck minus the separated champion (112)
    expect(hand.length).toBeGreaterThanOrEqual(4); // 116 opening four (+ the turn-1 draw)
    // Instance ids encode the list position ("player-1-main-<i>-<def>"); a shuffled deck is not monotone in i.
    const listIndex = (id: string): number => Number(id.split("-")[3]);
    const indices = deck.map(listIndex);
    expect(indices.every((n) => Number.isInteger(n))).toBe(true);
    const ascending = indices.every((n, i) => i === 0 || n > (indices[i - 1] as number));
    expect(ascending).toBe(false);
  });

  test("103.2.a.3 / 103.2.b.1: the two OTHER Jinx, Rebel and all three Jinx, Demolitionist stay in the deck (or opening hand) — none is pulled into the Champion Zone, none is dropped", async () => {
    const k = await kit();
    const game = await Game.fromDecks({ p1: legalDeckConfig(k), p2: opponentDeck(k), seed: "jinx-setup" });
    await game.settle();
    const champ = game.p1.champion() as string;
    const rebels = game.findAll({ defId: JINX_REBEL, owner: P1 });
    expect(rebels).toHaveLength(3);
    expect(rebels).toContain(champ);
    for (const id of rebels.filter((r) => r !== champ)) {
      expect(["mainDeck", "hand"]).toContain(game.zoneOf(id));
    }
    const demos = game.findAll({ defId: JINX_DEMOLITIONIST, owner: P1 });
    expect(demos).toHaveLength(3);
    for (const id of demos) {
      expect(["mainDeck", "hand"]).toContain(game.zoneOf(id));
    }
    expect(game.findAll({ owner: P1, zone: "championZone" })).toEqual([champ]);
  });
});

describe("Illegal (a) — the same 40 cards but NO Chosen Champion designated (Jinx, Rebel just left in the list)", () => {
  test("DeckBuilder.validate rejects with NO_CHAMPION; the deck is not complete and cannot be exported", async () => {
    const k = await kit();
    const b = builderFor(k, null);
    addAll(b, [k.rebel, ...jinxPackage(k)]); // all 3 Rebel + 3 Demolitionist as plain deck entries
    addAll(b, filler(k, 34));
    expect(b.getStats().mainDeckCount).toBe(40);
    expect(b.validate()).toEqual({ errors: [{ code: "NO_CHAMPION", message: expect.any(String) }], valid: false });
    expect(b.getStats().isComplete).toBe(false);
    expect(b.export()).toBeNull();
  });

  test("no auto-pick: adding Jinx-tagged champion units to the main deck never fills the Chosen Champion slot behind the player's back", async () => {
    const k = await kit();
    const b = builderFor(k, null);
    expect(b.getLegalChampions().map((c) => c.id as string)).toContain(JINX_REBEL); // it COULD be chosen…
    addAll(b, [k.rebel, k.rebel, k.rebel, k.demo]);
    expect(b.getState().chosenChampion).toBeNull(); // …but only an explicit setChampion designates it
    expect(b.getCopyCounts()["Jinx, Rebel"]).toBe(3);
    expect(b.validate().errors.map((e) => e.code)).toEqual(["NO_CHAMPION"]);
  });

  test("setup path without a championId: the Champion Zone stays EMPTY and all 3 Rebels + 3 Demolitionists are still among the 40 deck cards — the engine does not silently promote a Jinx unit (112 needs a designated card)", async () => {
    const k = await kit();
    const entries = [k.rebel, ...jinxPackage(k), ...filler(k, 34)].map((c) => c.id as string); // the full 40 as deck entries
    const game = await Game.fromDecks({
      p1: legalDeckConfig(k, { championId: undefined, deckEntries: entries }),
      p2: opponentDeck(k),
      seed: "jinx-no-champion",
    });
    await game.settle();
    expect(game.p1.cardsAt("championZone")).toEqual([]);
    expect(game.p1.champion()).toBeUndefined();
    expect(game.p1.deck().length + game.p1.hand().length).toBe(40);
    for (const id of [...game.findAll({ defId: JINX_REBEL, owner: P1 }), ...game.findAll({ defId: JINX_DEMOLITIONIST, owner: P1 })]) {
      expect(["mainDeck", "hand"]).toContain(game.zoneOf(id));
    }
    expect(game.findAll({ defId: JINX_REBEL, owner: P1 })).toHaveLength(3);
    expect(game.p1.can("playChampion")).toBe(false);
  });
});

describe("Illegal (b) — no Champion Legend supplied (103.1)", () => {
  test("DeckBuilder with no legend: no Domain Identity can be derived (103.1.b), no champion is legal, main-deck adds are refused NO_LEGEND, validate → NO_LEGEND", async () => {
    const k = await kit();
    const b = new DeckBuilder(k.pool.all() as AnyCard[], "duel");
    expect(b.getDomainIdentity()).toEqual([]);
    expect(b.getLegalChampions()).toEqual([]);
    expect(b.setChampion(k.rebel as AnyCard)).toMatchObject({ error: { code: "NO_LEGEND" }, success: false });
    expect(b.addToMainDeck(k.rebel as AnyCard)).toMatchObject({ error: { code: "NO_LEGEND" }, success: false });
    expect(b.validate()).toEqual({ errors: [{ code: "NO_LEGEND", message: expect.any(String) }], valid: false });
    expect(b.export()).toBeNull();
  });

  test("a force-loaded legend-less list (champion Rebel + 39 otherwise-legal cards) is still rejected NO_LEGEND — the legend is not optional", async () => {
    const k = await kit();
    const legal = builderFor(k, k.rebel);
    addAll(legal, [...jinxPackage(k), ...filler(k, 34)]);
    expect(legal.validate().valid).toBe(true);
    const b = new DeckBuilder(k.pool.all() as AnyCard[], "duel");
    b.loadState({ ...legal.getState(), legend: null });
    expect(b.getStats().mainDeckCount).toBe(40);
    expect(b.validate()).toEqual({ errors: [{ code: "NO_LEGEND", message: expect.any(String) }], valid: false });
    expect(b.getStats().isComplete).toBe(false);
  });
});

describe("Illegal (c) — 39 cards in total: the Chosen Champion is counted INSIDE the 40 (103.2), not on top of it", () => {
  test("DeckBuilder: chosen Rebel + 38 deck entries = 39 → MAIN_DECK_TOO_SMALL naming 39; one more card makes exactly 40 → valid", async () => {
    const k = await kit();
    const b = builderFor(k, k.rebel);
    addAll(b, [...jinxPackage(k), ...filler(k, 33)]); // 1 + 5 + 33 = 39
    expect(b.getStats().mainDeckCount).toBe(39);
    expect(b.getStats().isComplete).toBe(false);
    const short = b.validate();
    expect(short.valid).toBe(false);
    expect(short.errors).toEqual([{ code: "MAIN_DECK_TOO_SMALL", message: expect.stringMatching(/at least 40.*has 39/) }]);
    addAll(b, [k.fillerNames.at(-1) as CardDefLike]); // the 40th card (a fresh name, so no cap issue)
    expect(b.getStats().mainDeckCount).toBe(40);
    expect(b.validate()).toEqual({ errors: [], valid: true });
  });

  test("raw validateDeck: a 39-card mainDeck that already includes the chosen Rebel is too small; listing the champion 'separately' does not add a 40th card", async () => {
    const k = await kit();
    const thirtyNine = [k.rebel, ...jinxPackage(k), ...filler(k, 33)];
    expect(thirtyNine).toHaveLength(39);
    const result = validateDeck(rawConfig(k, thirtyNine));
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([{ code: "MAIN_DECK_TOO_SMALL", message: expect.stringContaining("has 39") }]);
    // Contrast: the champion + 39 OTHER cards is the legal 40 (39 end up in the Main Deck zone after 112).
    expect(validateDeck(rawConfig(k, [k.rebel, ...jinxPackage(k), ...filler(k, 34)])).valid).toBe(true);
  });
});

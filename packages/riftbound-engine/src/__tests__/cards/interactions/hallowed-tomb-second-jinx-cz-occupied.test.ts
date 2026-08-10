/**
 * Interaction: Hallowed Tomb (ogn-281-298) × Jinx, Rebel (ogn-202-298) × Loose Cannon (ogn-251-298)
 *
 *   Hallowed Tomb — Battlefield
 *     "When you hold here, you may return your Chosen Champion from your trash to your Champion Zone
 *      if it is empty."                                       — P1 controls it with a Gravekeeper on it
 *   Jinx, Rebel — Champion Unit (Jinx) · Chaos · 5 · 5 Might
 *     "When you discard one or more cards, ready me and give me +1 [Might] this turn."
 *                                                              — P1's Chosen Champion; the deck runs 3
 *   Loose Cannon — Legend · Jinx  "At start of your Beginning Phase, draw 1 if you have one or fewer
 *     cards in your hand."                                     — makes every Jinx, Rebel P1 owns the
 *                                                                Chosen Champion (103.2.a.3)
 *
 * Rules: 103.2.a.3 (every copy with the Chosen Champion's name counts, in any zone), 108.3.b/c/c.1 (a
 * Chosen Champion may be returned to the Champion Zone only if no card is already there), 108.3.d /
 * 419.1.a (played from there as normal, full cost), 355.10.a (trash is public — the returned copy is a
 * chosen object), 124 / 748 (a card changing to a non-board zone is a new object: no damage, no
 * temporary Might), 705.1 (champions do not retain buffs in the Champion Zone even if they return).
 *
 * Question / cases (P1 holds the Tomb at the start of turn 3):
 *   A — the ORIGINAL Jinx is still unplayed in the Champion Zone; a second copy was played and died →
 *       trash. Is the hold trigger offered, and does accepting do anything?
 *   B — the original Jinx is alive in P1's base (zone empty); a second, BUFFED and damaged copy dies in
 *       combat → trash. May it return although "Jinx" is on the board? Is it clean? Is the play offered?
 *   C — zone empty, TWO copies in the trash → how many return?
 *   D — zone empty, trash holds only non-champion units (a vanilla body, Cemetery Attendant) → nothing.
 *
 * Expected: A — the "you may" fires under P1 (hold point scored), but "if it is empty" gates the return:
 * trash copy stays, zone keeps the original. B — legal (identity is by name): the copy moves trash →
 * Champion Zone as a fresh 5-Might object (no buff/damage/modifier); the on-board Jinx is untouched;
 * "play from Champion Zone" is offered again once 5 + [chaos] is available. C — exactly one returns
 * (108.3.c.1). D — no zone change at all.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HALLOWED_TOMB = "ogn-281-298";
const JINX_REBEL = "ogn-202-298";
const LOOSE_CANNON = "ogn-251-298";
const CEMETERY_ATTENDANT = "ogn-165-298"; // Unit · Chaos · 3 · "When you play me, return a unit from your trash to your hand."

/**
 * End of P2's turn 2. P1: Loose Cannon legend; controls Hallowed Tomb (live text) with a vanilla
 * Gravekeeper on it → P1 HOLDS it at the start of turn 3; also controls inert bf2. Two filler cards in
 * hand so Loose Cannon's start-of-turn draw is a clean no-op. P2 has an 8-Might Brute in base (Case B).
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .legend(P1, LOOSE_CANNON, "legend")
    .battlefield("tomb", { controller: P1, def: HALLOWED_TOMB, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "tomb", { might: 2, name: "Gravekeeper" }, "keeper")
    .unit(P2, "base", { might: 8, name: "Brute" }, "brute")
    .hand(P1, { energyCost: 1, might: 1, name: "Filler A" }, "fillA")
    .hand(P1, { energyCost: 1, might: 1, name: "Filler B" }, "fillB");
}

const boardA = () => board().champion(P1, JINX_REBEL, "jinxOrig").trash(P1, JINX_REBEL, "jinxCopy");
/** Case B: original Jinx alive in base; the second copy sits at bf2 BUFFED, +1 Might this turn, 1 damage (7 Might). */
const boardB = () =>
  board()
    .unit(P1, "base", JINX_REBEL, "jinxOrig")
    .unit(P1, "bf2", JINX_REBEL, "jinxCopy", { buffed: true, damage: 1, mightModifier: 1 });
const boardC = () => board().trash(P1, JINX_REBEL, "jinxA").trash(P1, JINX_REBEL, "jinxB");
const boardD = () =>
  board().trash(P1, { energyCost: 3, might: 3, name: "Vanilla Bones" }, "bones").trash(P1, CEMETERY_ATTENDANT, "attendant");

/**
 * P2 ends the turn → P1's turn 3: Loose Cannon's Beginning-Step trigger (2 cards in hand → no draw) is
 * passed through, the Scoring Step holds the Tomb (+1) and the Tomb's optional trigger asks P1.
 */
async function intoHoldPrompt(game: Game): Promise<void> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  const s = await game.settle();
  expect(s.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tomb" } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tomb", controller: P1, triggered: true })]);
  expect(game.p1.points()).toBe(1);
}

/** Accept the Tomb's "you may" and settle into P1's open main phase. */
async function acceptAndSettle(game: Game): Promise<void> {
  await game.p1.yes();
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.phase()).toBe("main");
  expect(game.chain()).toEqual([]);
}

/** Case B step 1: during P2's turn the Brute walks into bf2 and kills the buffed copy (8 ≥ 7). */
async function copyDiesInCombat(): Promise<Game> {
  const game = await boardB().build();
  expect(game.state("jinxCopy")).toMatchObject({ damage: 1, isBuffed: true, might: 7, zone: "battlefield-bf2" });
  expect(game.p1.champion()).toBeUndefined();
  await game.p2.move("brute", "bf2");
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.zoneOf("jinxCopy")).toBe("trash");
  return game;
}

describe("Case A — original Jinx still in the Champion Zone, a second copy in the trash", () => {
  test("before the hold: the zone holds exactly the original, the trash holds the copy", async () => {
    const game = await boardA().build();
    expect(game.cardsAt("championZone", P1)).toEqual(["jinxOrig"]);
    expect(game.p1.trash()).toEqual(["jinxCopy"]);
  });

  test("the hold trigger still FIRES: P1 scores the hold point and is asked the Tomb's 'you may' (it is P1's optional trigger)", async () => {
    const game = await boardA().build();
    await intoHoldPrompt(game);
    expect(game.zoneOf("jinxCopy")).toBe("trash");
    expect(game.cardsAt("championZone", P1)).toEqual(["jinxOrig"]);
  });

  test("accepting does nothing — 'if it is empty' / 108.3.c.1: the copy stays in the trash, the zone still holds only the original, score unaffected", async () => {
    const game = await boardA().build();
    await intoHoldPrompt(game);
    await acceptAndSettle(game);
    expect(game.zoneOf("jinxCopy")).toBe("trash");
    expect(game.p1.trash()).toEqual(["jinxCopy"]);
    expect(game.cardsAt("championZone", P1)).toEqual(["jinxOrig"]);
    expect(game.p1.champion()).toBe("jinxOrig");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.hand()).not.toContain("jinxCopy");
    expect(game.violations()).toEqual([]);
  });

  test("declining is equally a no-op and the turn proceeds to P1's main phase", async () => {
    const game = await boardA().build();
    await intoHoldPrompt(game);
    await game.p1.no();
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("jinxCopy")).toBe("trash");
    expect(game.cardsAt("championZone", P1)).toEqual(["jinxOrig"]);
  });
});

describe("Case B — original Jinx alive on the board (zone empty), a buffed second copy dies and comes back through the Tomb", () => {
  test("killed in combat (8 vs 7): the copy lands in the trash already stripped — 5 Might, no buff, no damage (705, 124); P2 conquers bf2", async () => {
    const game = await copyDiesInCombat();
    expect(game.state("jinxCopy")).toMatchObject({ baseMight: 5, damage: 0, isBuffed: false, might: 5, mightModifier: 0, zone: "trash" });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.zoneOf("jinxOrig")).toBe("base");
  });

  test("hold → the 'you may' is offered and acceptable although another Jinx, Rebel is on the board (identity is by name, 103.2.a.3)", async () => {
    const game = await copyDiesInCombat();
    await intoHoldPrompt(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(game.p1.champion()).toBeUndefined();
    expect(game.zoneOf("jinxOrig")).toBe("base");
  });

  test("accepting moves the trash copy → P1's CHAMPION ZONE (not hand, not board); the trash is empty; the on-board original is untouched", async () => {
    const game = await copyDiesInCombat();
    await intoHoldPrompt(game);
    await acceptAndSettle(game);
    expect(game.zoneOf("jinxCopy")).toBe("championZone");
    expect(game.p1.champion()).toBe("jinxCopy");
    expect(game.cardsAt("championZone", P1)).toEqual(["jinxCopy"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).not.toContain("jinxCopy");
    expect(game.state("jinxOrig")).toMatchObject({ damage: 0, isBuffed: false, might: 5, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("the returned card is a brand-new object: printed 5 Might, no buff counter, no damage, no leftover +1-this-turn (124, 705.1)", async () => {
    const game = await copyDiesInCombat();
    await intoHoldPrompt(game);
    await acceptAndSettle(game);
    expect(game.state("jinxCopy")).toMatchObject({
      baseMight: 5,
      damage: 0,
      grantedKeywords: [],
      isBuffed: false,
      isExhausted: false,
      might: 5,
      mightModifier: 0,
      zone: "championZone",
    });
  });

  test("108.3.d / 419.1.a: back in Neutral Open, 'play Jinx from the Champion Zone' is offered again — only at FULL cost (5 + [chaos]), not with 2 energy", async () => {
    const game = await copyDiesInCombat();
    await intoHoldPrompt(game);
    await acceptAndSettle(game);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.tapRunes(2); // the two runes channeled this turn
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("playChampion")).toBe(false);
    await game.p1.do("addResources", { energy: 3, power: { chaos: 1 } });
    expect(game.p1.can("playChampion")).toBe(true);
    await game.p1.playChampion("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("jinxCopy")).toBe("base");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.p1.units("base").sort()).toEqual(["jinxCopy", "jinxOrig"]);
    expect(game.state("jinxCopy")).toMatchObject({ isBuffed: false, isExhausted: true, might: 5 });
  });
});

describe("Case C — zone empty, TWO copies in the trash", () => {
  test("accepting returns EXACTLY ONE copy: the Champion Zone holds a single card and the other copy stays in the trash (108.3.c.1)", async () => {
    const game = await boardC().build();
    expect(game.p1.champion()).toBeUndefined();
    await intoHoldPrompt(game);
    await game.p1.yes();
    // If the engine asks which (identical) copy, name one; otherwise it bound one itself.
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const keys = d.options.map((o) => o.card ?? o.key);
      expect(keys.sort()).toEqual(["jinxA", "jinxB"]);
      expect(d.max).toBe(1);
      await game.p1.pick("jinxA");
    }
    const s = await game.settle();
    expect(s.reason).toBe("open");
    const cz = game.cardsAt("championZone", P1);
    expect(cz).toHaveLength(1);
    expect(["jinxA", "jinxB"]).toContain(cz[0] as string);
    const left = cz[0] === "jinxA" ? "jinxB" : "jinxA";
    expect(game.p1.trash()).toEqual([left]);
    expect(game.zoneOf(left)).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("holding again next turn with the zone now OCCUPIED returns nothing more — the second copy is still in the trash", async () => {
    const game = await boardC().build();
    await intoHoldPrompt(game);
    await acceptAndSettle(game);
    const [inZone] = game.cardsAt("championZone", P1) as [string];
    const left = inZone === "jinxA" ? "jinxB" : "jinxA";
    await game.advanceTurn(); // → P2
    await game.p2.endTurn(); // → P1 holds again
    const s = await game.settle();
    if (s.reason === "unanswered" && game.decision()?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.phase()).toBe("main");
    expect(game.cardsAt("championZone", P1)).toEqual([inZone]);
    expect(game.zoneOf(left)).toBe("trash");
    expect(game.p1.points()).toBe(2);
  });
});

describe("Case D (control) — zone empty, no Chosen Champion in the trash", () => {
  test("a vanilla unit and Cemetery Attendant are not 'your Chosen Champion': whether or not the 'you may' is asked, nothing moves and the zone stays empty", async () => {
    const game = await boardD().build();
    await game.p2.endTurn();
    const s = await game.settle();
    expect(game.p1.points()).toBe(1);
    if (s.reason === "unanswered") {
      expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tomb" } });
      await game.p1.yes();
      // No eligible card → no pick may be demanded of P1.
      expect(game.decision()?.kind).not.toBe("pick");
      await game.settle();
    }
    expect(game.phase()).toBe("main");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.cardsAt("championZone", P1)).toEqual([]);
    expect(game.p1.trash().sort()).toEqual(["attendant", "bones"]);
    expect(game.p1.hand()).not.toContain("attendant");
    expect(game.p1.hand()).not.toContain("bones");
    expect(game.violations()).toEqual([]);
  });
});

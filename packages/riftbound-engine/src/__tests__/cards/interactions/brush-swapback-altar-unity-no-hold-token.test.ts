/**
 * Interaction: Green Father (unl-195-219, Legend · Ivern) "When you conquer or hold, you may exhaust me to replace
 *     that battlefield with a Brush battlefield token. (… It can be swapped back when scored.)"
 *   × Brush token (unl-t03) "Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might]. When you score here, you may
 *     replace this with the battlefield it replaced."
 *   × Altar to Unity (ogn-275-298, Battlefield) "When you hold here, play a 1 [Might] Recruit unit token in your base."
 *
 * Rules: 438.1 / 438.1.a (Replace = CREATE a token in the object's place, not played, inheriting every status),
 * 438.4 (Replace is not a subset of Banish), 438.5 / 438.5.a (the replaced CARD waits in Banishment "as Replaced"),
 * 438.7 / 438.7.b (Swap Back: the token stops existing, the original returns to the slot inheriting all CURRENT
 * statuses), 652.2.b / 652.2.c (units and facedown cards stay with the slot), 187.8 (Brush text) / 187.1 (Recruit
 * token: 1-Might unit token, Recruit tag), 439.1 / 439.2 / 439.4 (Create: at the directed location; the creator owns
 * it), 469.2 (Hold is scored at the start of the Beginning Phase), 470 (one Score per battlefield per turn),
 * 190.6.a / 190.6.d ("you … here" = the battlefield's controller), 143.4 / 185.2.d (played/created units enter exhausted).
 *
 * Story: turn A (P1) — the Ranger walks into the empty Altar, conquers, Green Father brushes it. Turn C (P1's next)
 * — P1 holds the Brush and swaps back. Turn E (P1's following) — P1 holds the returned Altar.
 * Q (a) what exactly happened to Altar on turn A (zone, banish-or-not, was Brush "played", control, unit, scored)?
 *   (b) turn C: where does the Brush go, and does the returning Altar's own hold trigger make a Recruit THIS turn?
 *   (c) turn E: what happens; the Recruit's characteristics/state/location?  (d) contrast: never brushed.
 * Expected: (a) Brush token created in the slot (not played), P1 controls it, Ranger stays, slot already scored;
 * Altar card → Banishment as Replaced (no banish event). (b) hold +1; swap back: Brush ceases to exist (not in
 * trash/banishment), Altar returns with P1's control + Ranger + "scored this turn"; NO Recruit on turn C. (c) hold
 * +1, one exhausted 1-Might Recruit token in P1's base. (d) unbrushed, the first Recruit already appears on turn C;
 * points identical (A conquer, C hold, E hold).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GREEN_FATHER = "unl-195-219";
const ALTAR_TO_UNITY = "ogn-275-298";

/**
 * P1's turn A (turn 2). P1: legend Green Father, a tagless 3-Might Ranger and a 2-Might Scout in base. The live
 * (non-inert) Altar to Unity — P2's battlefield card — is empty and uncontrolled; P2 sits on an inert bf2 so its
 * own turns are eventless.
 */
function board() {
  return scenario()
    .legend(P1, GREEN_FATHER, "gf")
    .battlefield("altar", { controller: null, def: ALTAR_TO_UNITY, inert: false, owner: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Ranger" }, "ranger")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "bf2", { might: 2, name: "Guard" }, "guard");
}

interface Prompts {
  greenFather: number;
  brush: number;
}

/**
 * Settle, answering P1's opt-ins: Green Father's "exhaust me to replace" with `gf`, the Brush's "swap back" with
 * `brush`. Returns how often each was asked. Stops at the open main phase.
 */
async function drain(game: Game, answers: { gf: boolean; brush?: boolean }): Promise<Prompts> {
  const asked: Prompts = { brush: 0, greenFather: 0 };
  for (let i = 0; i < 16; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      if (d.source?.cardId === "gf") {
        asked.greenFather += 1;
        await (answers.gf ? game.p1.yes() : game.p1.no());
      } else {
        expect(d.prompt).toMatch(/Brush/);
        asked.brush += 1;
        await (answers.brush === true ? game.p1.yes() : game.p1.no());
      }
      continue;
    }
    if (r.reason !== "unanswered") {
      break;
    }
    break;
  }
  expect(game.decision()).toMatchObject({ context: "main", kind: "action" });
  return asked;
}

const slotUnder = (game: Game, unit = "ranger") => game.locationOf(unit) as string;
const named = (game: Game, name: string) => game.findAll({ name });
const recruits = (game: Game) => named(game, "Recruit").filter((id) => game.zoneOf(id) !== "gone");

/** Turn A: Ranger conquers the Altar; Green Father brushes it (or not). */
async function turnA(brushIt: boolean): Promise<Game> {
  const game = await board().build();
  await game.p1.move("ranger", "altar");
  const asked = await drain(game, { gf: brushIt });
  expect(asked.greenFather).toBe(1);
  return game;
}

/** P1 ends → P2's (empty) turn → P2 ends → P1's next Beginning Phase; answer the hold-time opt-ins. */
async function nextP1Turn(game: Game, answers: { gf: boolean; brush?: boolean }): Promise<Prompts> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.endTurn();
  const asked = await drain(game, answers);
  expect(game.turnPlayer()).toBe(P1);
  return asked;
}

describe("Green Father brushes Altar to Unity, swaps back on the hold — the returning Altar makes no Recruit that turn", () => {
  // ---------------------------------------------------------------- (a)
  test("(a) turn A: the Ranger conquers the empty Altar (+1), Green Father asks once and is exhausted; the slot the Ranger stands on is now a Brush battlefield TOKEN — created in place, the row still has exactly two battlefields (438.1)", async () => {
    const game = await turnA(true);
    expect(game.state("gf").isExhausted).toBe(true);
    expect(game.p1.points()).toBe(1);
    const slot = slotUnder(game);
    expect(game.state(slot)).toMatchObject({ cardType: "battlefield", isToken: true, name: "Brush", zone: "battlefieldRow" });
    expect(game.battlefields()).toHaveLength(2);
    expect(named(game, "Brush")).toEqual([slot]);
  });

  test("(a) 438.1.a — the Brush inherits every status: controlled by P1, the Ranger is still exactly there (652.2.b), and the slot counts as conquered/scored by P1 this turn (470)", async () => {
    const game = await turnA(true);
    const slot = slotUnder(game);
    expect(game.gameState.battlefields[slot]?.controller).toBe(P1);
    expect(game.cardsAt(slot)).toEqual(["ranger"]);
    expect(game.p1.units(slot)).toEqual(["ranger"]);
    expect(game.gameState.scoredThisTurn?.[P1] ?? []).toContain(slot);
    expect(game.gameState.conqueredThisTurn?.[P1] ?? []).toContain(slot);
  });

  test("(a) the Brush token is OWNED by P1 (created by P1's legend, 439.4) and carries only its own text (187.8): the tagless Ranger gets no +1 there", async () => {
    const game = await turnA(true);
    const slot = slotUnder(game);
    expect(game.state(slot).owner).toBe(P1);
    expect(game.state("ranger").might).toBe(3);
  });

  test("(a) Altar to Unity (a CARD) is put into Banishment 'as Replaced' (438.5/.5.a): exactly one battlefield card named Altar to Unity waits there, still owned by P2, not a token", async () => {
    const game = await turnA(true);
    const banished = game.cardsAt("banishment");
    expect(banished).toHaveLength(1);
    expect(game.state(banished[0] as string)).toMatchObject({ cardType: "battlefield", isToken: false, name: "Altar to Unity", owner: P2, zone: "banishment" });
    expect(named(game, "Altar to Unity")).toEqual(banished); // nowhere else — its hold ability is off the board
  });

  test("(a) Replace is neither a Banish (438.4) nor a play (438.1): no 'banish' event and no card-play is recorded for the turn — only move / conquer / score", async () => {
    const game = await turnA(true);
    const counts = game.gameState.turnEventCounts ?? {};
    expect(counts.banish).toBeUndefined();
    expect(counts["play-card"]).toBeUndefined();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(0);
    expect(counts.conquer).toBe(1);
    expect(counts.score).toBe(1);
  });

  // ---------------------------------------------------------------- (b)
  test("(b) turn C: P1 holds the Brush at the start of its Beginning Phase (469.2) → +1 (total 2); Green Father (readied) asks again and the Brush's own 'When you score here' offers the swap-back to P1, its controller (190.6.d)", async () => {
    const game = await turnA(true);
    const asked = await nextP1Turn(game, { brush: true, gf: false });
    expect(asked).toEqual({ brush: 1, greenFather: 1 });
    expect(game.p1.points()).toBe(2);
    expect(game.gameState.turnEventCounts?.hold).toBe(1);
    expect(game.gameState.turnEventCounts?.score).toBe(1);
  });

  test("(b) Swap Back (438.7.b): the Brush token simply stops existing — no Brush on the row, in any trash or in banishment — and Altar to Unity is back in that slot as a real card, banishment now empty", async () => {
    const game = await turnA(true);
    await nextP1Turn(game, { brush: true, gf: false });
    const slot = slotUnder(game);
    expect(game.state(slot)).toMatchObject({ cardType: "battlefield", isToken: false, name: "Altar to Unity", owner: P2, zone: "battlefieldRow" });
    expect(named(game, "Brush")).toEqual([]);
    expect(game.cardsAt("banishment")).toEqual([]);
    expect([...game.p1.trash(), ...game.p2.trash()]).toEqual([]);
    expect(game.battlefields()).toHaveLength(2);
  });

  test("(b) the returning Altar inherits the current statuses: still controlled by P1 with the Ranger standing on it", async () => {
    const game = await turnA(true);
    await nextP1Turn(game, { brush: true, gf: false });
    const slot = slotUnder(game);
    expect(game.gameState.battlefields[slot]?.controller).toBe(P1);
    expect(game.cardsAt(slot)).toEqual(["ranger"]);
    expect(game.state("ranger")).toMatchObject({ isReady: true, might: 3 });
  });

  test("(b) Altar's 'When you hold here' does NOT fire on turn C — the hold happened while Altar was in Banishment and the slot is already scored (470): no Recruit token anywhere, no token-play event", async () => {
    const game = await turnA(true);
    await nextP1Turn(game, { brush: true, gf: false });
    expect(recruits(game)).toEqual([]);
    expect(named(game, "Recruit")).toEqual([]);
    expect(game.p1.units("base")).toEqual(["scout"]);
    expect(game.gameState.turnEventCounts?.["play-token-unit"]).toBeUndefined();
  });

  // rule 470 + 438.7.b — the swapped-back Altar inherits "already scored by P1 this turn", so when the Ranger
  // walks home (control lapses, 190.4.c) and the Scout re-conquers the very same slot later on turn C, P1 must
  // NOT score it a second time — points stay 2 (the turn ledgers are re-keyed with the slot in swap-back).
  test("(b) 470 via 438.7.b — re-conquering the swapped-back Altar later the same turn scores nothing (points stay 2)", async () => {
    const game = await turnA(true);
    await nextP1Turn(game, { brush: true, gf: false });
    expect(game.p1.points()).toBe(2);
    const slot = slotUnder(game);
    await game.p1.move("ranger", "base");
    await game.settle();
    expect(game.gameState.battlefields[slot]?.controller).toBeNull();
    await game.p1.move("scout", slot);
    await drain(game, { brush: false, gf: false });
    expect(game.locationOf("scout")).toBe(slot);
    expect(game.gameState.battlefields[slot]?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  // ---------------------------------------------------------------- (c)
  test("(c) turn E: P1 holds the Altar (+1, total 3) and NOW its trigger resolves — exactly one Recruit token is created", async () => {
    const game = await turnA(true);
    await nextP1Turn(game, { brush: true, gf: false });
    const asked = await nextP1Turn(game, { gf: false });
    expect(asked).toEqual({ brush: 0, greenFather: 1 }); // the Altar has no swap-back text
    expect(game.p1.points()).toBe(3);
    expect(recruits(game)).toHaveLength(1);
    expect(game.gameState.turnEventCounts?.["play-token-unit"]).toBe(1);
  });

  test("(c) the Recruit per 187.1 / 439: a unit TOKEN, 1 Might, no cost, no domain, owned and controlled by P1, in P1's BASE (the directed destination, 439.2), entering EXHAUSTED (143.4 / 185.2.d)", async () => {
    const game = await turnA(true);
    await nextP1Turn(game, { brush: true, gf: false });
    await nextP1Turn(game, { gf: false });
    const [recruit] = recruits(game);
    expect(recruit).toBeDefined();
    expect(game.state(recruit as string)).toMatchObject({
      baseMight: 1,
      cardType: "unit",
      controller: P1,
      domains: [],
      energyCost: 0,
      isExhausted: true,
      isToken: true,
      location: "base",
      might: 1,
      name: "Recruit",
      owner: P1,
      zone: "base",
    });
    expect(game.p1.units("base").sort()).toEqual(["scout", recruit as string].sort());
    expect(game.locationOf("ranger")).toBe(slotUnder(game)); // the holder never moved
  });

  // ---------------------------------------------------------------- (d)
  test("(d) contrast — never brushed: Altar stays a card in its slot on turn A (nothing banished, Green Father stays ready), same +1 for the conquer", async () => {
    const game = await turnA(false);
    expect(game.state("gf").isReady).toBe(true);
    expect(slotUnder(game)).toBe("altar");
    expect(game.state("altar")).toMatchObject({ isToken: false, name: "Altar to Unity", zone: "battlefieldRow" });
    expect(game.gameState.battlefields.altar?.controller).toBe(P1);
    expect(game.cardsAt("banishment")).toEqual([]);
    expect(game.p1.points()).toBe(1);
    expect(recruits(game)).toEqual([]);
  });

  test("(d) contrast — the FIRST Recruit already appears on turn C: holding the unbrushed Altar (+1, total 2) creates one exhausted 1-Might Recruit in P1's base right away", async () => {
    const game = await turnA(false);
    const asked = await nextP1Turn(game, { gf: false });
    expect(asked).toEqual({ brush: 0, greenFather: 1 });
    expect(game.p1.points()).toBe(2);
    const list = recruits(game);
    expect(list).toHaveLength(1);
    expect(game.state(list[0] as string)).toMatchObject({ isExhausted: true, isToken: true, might: 1, owner: P1, zone: "base" });
  });

  test("(d) the ledger: brushing cost P1 exactly one Recruit (turn C) while the points are identical — A conquer 1, C hold 2, E hold 3 on both lines; Recruits 0/0/1 brushed vs 0/1/2 unbrushed", async () => {
    /** One line of play (the harness hosts one live game at a time): [points, recruits] after turns A, C, E. */
    async function ledger(brushIt: boolean): Promise<[number, number][]> {
      const game = await turnA(brushIt);
      const rows: [number, number][] = [[game.p1.points(), recruits(game).length]];
      await nextP1Turn(game, { brush: true, gf: false });
      rows.push([game.p1.points(), recruits(game).length]);
      await nextP1Turn(game, { gf: false });
      rows.push([game.p1.points(), recruits(game).length]);
      expect(game.state(slotUnder(game)).owner).toBe(P2); // the Altar card was P2's all along on both lines
      return rows;
    }
    expect(await ledger(true)).toEqual([
      [1, 0],
      [2, 0],
      [3, 1],
    ]);
    expect(await ledger(false)).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
    ]);
  });
});

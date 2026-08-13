/**
 * Interaction: a four-deep counter ladder ending in a THEFT.
 *
 *   Void Seeker (ogn-024-298) [Action] · 3 [fury] — "Deal 4 to a unit at a battlefield. Draw 1."
 *   Defy        (ogn-045-298) [Reaction] · 1 [calm] — "Counter a spell that costs no more than [4]
 *                                                     and no more than [rainbow]."
 *   Wind Wall   (ogn-064-298) [Reaction] · 3 [calm][calm] — "Counter a spell."
 *   Rebuttal    (ven-152-166) [Reaction] · 1 [rainbow] — "Choose a spell with Energy cost no more
 *                 than [4]. You may pay [rainbow]. If you do, gain control of it and you may make
 *                 new choices for it. Otherwise, counter it."
 *
 * The ladder: P1 plays Void Seeker at P2's unit X; P2 answers with Defy naming Void Seeker; P1
 * answers with Wind Wall naming Defy; P2 answers with Rebuttal naming Wind Wall.
 *
 * Rules: 337.1.a (nobody gains priority during finalization) · 337.4 (the controller of the newest
 * chain item gets priority) · 339.2 (a pass moves priority in turn order) · 340.1 (strict LIFO,
 * and a resolution is uninterruptible) · 340.4 (after a resolution priority goes to the controller
 * of the new newest item) · 355.9.a.2 (a counterspell on the chain is itself "a spell") ·
 * 359.3.e.5 (an instruction whose chosen object is gone simply does not execute — the spell is NOT
 * countered) · 359.3.d (a resolved/countered card goes to its OWNER's trash) · 425.1.a / 425.1.c
 * (a countered spell does nothing and refunds nothing) · 419.4.b (a finalized card counts as
 * played this turn) · 191.2 (control of a chain item) · 206 (Energy cost vs Power pips) ·
 * 751–755 (new choices for a stolen item).
 *
 * Q: (a) who holds priority after each play and after each resolution? (b) is Wind Wall — printed
 *    Energy cost 3, plus two [calm] POWER pips — a legal choice for Rebuttal's "Energy cost no more
 *    than [4]"? (c) must P1 decide whether to respond to Rebuttal BEFORE knowing whether it steals
 *    or counters? (d) on the steal line, which spells may the stolen Wind Wall be re-aimed at, and
 *    does the control change move priority? (e) steal-and-re-aim vs decline-to-pay: final board,
 *    what was countered, what fizzled, whose trash each card ends in.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const DEFY = "ogn-045-298";
const WIND_WALL = "ogn-064-298";
const REBUTTAL = "ven-152-166";

/** Flatten the `targets` field of a seat's cast option into the set of card ids offered. */
function targetsOffered(game: Game, seat: typeof P1, alias: string): string[] {
  const opt = game.seat(seat).option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn. P2's 6-Might Bulwark holds bf1 (4 damage will not kill it, so the board reads
 * cleanly). Both seats hold their half of the ladder with the runes to pay for it — P2 gets a
 * THIRD [rainbow] so the "you may pay [rainbow]" at Rebuttal's resolution is affordable.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Bulwark" }, "x")
    .resources(P1, { energy: 8, power: { calm: 2, fury: 2 } })
    .resources(P2, { energy: 8, power: { calm: 2, rainbow: 3 } })
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P1, WIND_WALL, "wall")
    .hand(P2, DEFY, "defy")
    .hand(P2, REBUTTAL, "rebuttal");
}

/** Build the four-deep chain and pass it down to the point where Rebuttal is about to resolve. */
async function ladder(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("seeker", { targets: "x" });
  await game.p1.passPriority();
  await game.p2.cast("defy", { targets: "seeker" });
  await game.p2.passPriority();
  await game.p1.cast("wall", { targets: "defy" });
  await game.p1.passPriority();
  await game.p2.cast("rebuttal", { targets: "wall" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  return game;
}

describe("Rebuttal steals Wind Wall off a four-deep counter ladder", () => {
  test("(a) priority: finalization passes none (337.1.a); the player who just played holds it (337.4); a pass moves it in turn order (339.2)", async () => {
    const game = await board().build();

    await game.p1.cast("seeker", { targets: "x" });
    expect(game.actingSeat()).toBe(P1); // controller of the newest item, not the opponent
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);

    await game.p2.cast("defy", { targets: "seeker" });
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);

    await game.p1.cast("wall", { targets: "defy" });
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);

    await game.p2.cast("rebuttal", { targets: "wall" });
    expect(game.actingSeat()).toBe(P2);
    expect(game.chain().map((i) => [i.name, i.controller])).toEqual([
      ["Void Seeker", P1],
      ["Defy", P2],
      ["Wind Wall", P1],
      ["Rebuttal", P2],
    ]);
  });

  test("(b) Wind Wall IS a legal Rebuttal choice — a counterspell on the chain is a spell (355.9.a.2) and its [calm][calm] are POWER, not Energy (206)", async () => {
    const game = await board().build();
    await game.p1.cast("seeker", { targets: "x" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "seeker" });
    await game.p2.passPriority();
    await game.p1.cast("wall", { targets: "defy" });
    await game.p1.passPriority();

    expect(game.state("wall").energyCost).toBe(3); // ≤ 4
    expect(game.state("wall").powerCost).toEqual(["calm", "calm"]); // pips are Power, they do not count
    const offered = targetsOffered(game, P2, "rebuttal");
    expect(offered).toContain("wall");
    expect(offered).toContain("seeker");
    expect(offered).toContain("defy");
    expect(offered).not.toContain("rebuttal"); // 355.9.c — never itself
  });

  test("(c) P1 answers Rebuttal BLIND: the [rainbow] is paid at RESOLUTION, and once it resolves there is no further window (340.1)", async () => {
    const game = await board().build();
    await game.p1.cast("seeker", { targets: "x" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "seeker" });
    await game.p2.passPriority();
    await game.p1.cast("wall", { targets: "defy" });
    await game.p1.passPriority();
    await game.p2.cast("rebuttal", { targets: "wall" });
    const rainbowAfterPlay = game.p2.power("rainbow");
    await game.p2.passPriority();

    // P1's window: an ordinary action decision, nothing paid yet, no hint which branch is coming.
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, timing: "ACT" });
    expect(game.p2.power("rainbow")).toBe(rainbowAfterPlay);

    await game.p1.passPriority();
    // Only NOW is the payment asked, and it is asked of P2 while Rebuttal is resolving.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, timing: "RES" });
  });

  test("(d) the control change hands priority to P2 (340.4 / 191.2) — P1 does not get it back first", async () => {
    const game = await ladder();
    await game.p2.yes(); // pay [rainbow] → steal
    expect(game.p2.power("rainbow")).toBe(1); // 3 − 1 (play) − 1 (steal)
    expect(game.chain().find((i) => i.cardId === "wall")).toMatchObject({ controller: P2 });
    expect(game.actingSeat()).toBe(P2); // controller of the newest item, which is now the stolen Wind Wall
  });

  // rules 751–755 / 753.2: "you may make new choices for it" offers the stolen Wind Wall's counter
  // target again, with the spells still on the chain as candidates (Void Seeker and Defy; the
  // resolving Rebuttal itself is not offered). Wind Wall's parsed effect is a bare
  // `{type:"counter"}` with no target descriptor, so `abilities/new-choices.ts` reads the chain
  // through `chain/counter-target.ts isLegalCounterTarget` rather than the board target resolver.
  test("(d) the stolen Wind Wall's counter target is re-offered — Void Seeker and Defy, not Rebuttal (751–755)", async () => {
    const game = await ladder();
    await game.p2.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const keys = (d as { options: readonly { card?: string; key: string }[] }).options.map((o) => o.card ?? o.key);
    expect(keys).toContain("seeker");
    expect(keys).toContain("defy"); // the current choice may always be kept
    expect(keys).not.toContain("rebuttal"); // the resolving item is not on offer
  });

  // The whole point of the steal: re-aimed at Void Seeker, Wind Wall counters it (425.1.a — no
  // damage, no draw), and Defy then finds its chosen spell gone from the chain, so it does nothing
  // and is NOT itself countered (359.3.e.5).
  test("(e) steal + re-aim at Void Seeker — X survives undamaged, P1 draws nothing, Defy fizzles UNcountered", async () => {
    const game = await ladder();
    await game.p2.yes();
    await game.p2.pick("seeker"); // re-aim the stolen Wind Wall
    await game.settle();

    expect(game.state("x").damage).toBe(0); // Void Seeker was countered before it dealt anything
    expect(game.p1.hand()).toEqual([]); // …so no "Draw 1" either
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    // 359.3.d — every card goes to its OWNER's trash, Wind Wall included even though P2 controlled it.
    expect(game.p1.trash().sort()).toEqual(["seeker", "wall"]);
    expect(game.p2.trash().sort()).toEqual(["defy", "rebuttal"]);
  });

  test("(e) a stolen spell still ends in its OWNER's trash (359.3.d), and both counters happen exactly once", async () => {
    const game = await ladder();
    await game.p2.yes(); // steal
    await game.settle(); // passive settle KEEPS whatever choices the item holds

    expect(game.chain()).toEqual([]);
    expect(game.p1.trash().sort()).toEqual(["seeker", "wall"]); // P1 owns Wind Wall although P2 controlled it
    expect(game.p2.trash().sort()).toEqual(["defy", "rebuttal"]);
    expect(game.zoneOf("x")).toBe("battlefield-bf1"); // 6 Might: Void Seeker's 4 never kills it
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: 419.4.b would keep every FINALIZED card in the "played this turn" tally, but the
  // engine follows rule 424 (riftjudge 63b57fcabb4818c7): a spell whose control changes never
  // completes its play, so it is struck from the original caster's ledger. Asserted as the engine does
  // it — see `operations/plays-this-turn.ts unnotePlayThisTurn`.
  test("(e) stealing REMOVES Wind Wall from P1's cards-played tally (rule 424); a countered spell keeps its place (419.4.b)", async () => {
    const stolen = await ladder();
    await stolen.p2.yes();
    await stolen.settle();
    const played = (stolen.gameState as unknown as { cardsPlayedThisTurn?: Record<string, number> }).cardsPlayedThisTurn ?? {};
    expect(played[P1]).toBe(1); // Void Seeker only — Wind Wall was stolen out of the tally
    expect(played[P2]).toBe(2);

    const declined = await ladder();
    await declined.p2.no();
    await declined.settle();
    const played2 = (declined.gameState as unknown as { cardsPlayedThisTurn?: Record<string, number> }).cardsPlayedThisTurn ?? {};
    expect(played2[P1]).toBe(2); // countered, but still played (419.4.b)
    expect(played2[P2]).toBe(2);
  });

  test("(e) decline-to-pay: Rebuttal counters Wind Wall, priority goes to P2 (340.4), Defy counters Void Seeker, X survives untouched", async () => {
    const game = await ladder();
    await game.p2.no(); // decline the [rainbow] → "Otherwise, counter it."
    expect(game.p2.power("rainbow")).toBe(2); // nothing spent
    // 340.4 — Defy is now the newest item and P2 controls it.
    expect(game.actingSeat()).toBe(P2);
    expect(game.chain().map((i) => i.name)).toEqual(["Void Seeker", "Defy"]);

    await game.settle();
    expect(game.state("x").damage).toBe(0); // Void Seeker was countered (425.1.a)
    expect(game.p1.hand()).toEqual([]); // no draw
    expect(game.p1.trash().sort()).toEqual(["seeker", "wall"]);
    expect(game.p2.trash().sort()).toEqual(["defy", "rebuttal"]);
    expect(game.violations()).toEqual([]);
  });
});

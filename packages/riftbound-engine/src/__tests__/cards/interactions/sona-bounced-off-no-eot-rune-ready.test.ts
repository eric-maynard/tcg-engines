/**
 * Interaction: Sona, Harmonious (ogn-073-298) · Champion Unit · Calm · 4 + [calm] · 4 Might
 *     "At the end of your turn, if I'm at a battlefield, ready up to 4 friendly runes."          — P1's, ready in base
 *   × Galio, Indefatigable (unl-171-219) · Champion Unit · Order · 3 + [order] · 6 Might
 *     "[Deflect] [Tank] I don't deal combat damage."                                            — P2's, holding bf1 (NO side)
 *   × Shipyard Skulker (ogn-175-298) · Unit · 3 Might (vanilla)                                  — P2's, holding bf1 (YES side)
 *   (+ P2's inline 0-cost Reaction "Test Kill: kill a unit" for the (c) edge.)
 *
 * Question — 456.2 feeding a location-CONDITIONED end-of-turn trigger (383.2.a.1's own Sona example) after a 3d recall.
 * P1 has 5 exhausted runes. (a) NO side: Sona Standard-Moves into Galio's bf1 and attacks. Trace damage, 3c/3d, result;
 * at the end of P1's turn does Sona's ability go on the chain at all, how many runes ready, what state is Sona in, and
 * did any Move happen on the way home? (b) YES side: bf1 held by Skulker (3) — Sona wins and stays; end of turn?
 * (c) Edge: in (b) P2 kills Sona in response to the EOT trigger already on the chain — does it still resolve?
 *
 * Rules: 144.2 (the Standard Move exhausts the unit), 465 / 423-style "I don't deal combat damage" (Galio contributes 0),
 * 466.1.a.1 (3c: heal survivors), 466.1.a.2 (3d: attackers RECALLED if defenders remain), 466.3.d ("No Result"),
 * 455 / 456 / 456.1 / 456.2 (a Recall relocates the permanent to base but is NOT a Move — no move triggers/ledger),
 * 458.1 (damage/statuses unaffected by a recall — Sona stays exhausted), 317.1 (Ending Step), 383.2.a.1 ("if I'm at a
 * battlefield" is part of the CONDITION, evaluated when the end of turn arrives; once on the chain it resolves even if
 * Sona is removed), 466.3.a / 466.5 (sole survivor wins → conquer, +1).
 *
 * Expected: (a) Sona exhausted by the move; combat: Sona 4 → Galio survives (healed to 0), Galio 0 → Sona undamaged;
 * defenders remain → Sona recalled to P1's base, No Result, bf1 stays P2's, no points; the recall is not a move
 * (P1's units-moved ledger stays at 1); Sona: base, EXHAUSTED, 0 damage, 4 Might. Ending Step: Sona is in base → the
 * ability is NEVER placed on the chain, no priority window, 0 runes readied, straight into P2's turn. (b) Skulker dies,
 * Sona survives at bf1 (exhausted, healed), P1 conquers bf1 (+1); end of turn: trigger on the chain under P1 → resolves →
 * 4 of the 5 runes ready going into P2's turn (pool still emptied at 317.2). (c) P2's kill resolves first, Sona → trash;
 * her ability still resolves — 4 runes ready.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SONA = "ogn-073-298";
const GALIO = "unl-171-219";
const SHIPYARD_SKULKER = "ogn-175-298";

/** P2's inline Reaction removal for (c): 0 cost, "Kill a unit." */
const TEST_KILL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Kill",
  rulesText: "[Reaction] Kill a unit.",
  timing: "reaction",
};

const RUNES = ["r1", "r2", "r3", "r4", "r5"];

/**
 * Turn 3, P1 active, Main Phase, Neutral Open. P1: Sona READY in base, five EXHAUSTED calm runes r1..r5, empty pool.
 * P2 holds bf1 with either Galio (NO side) or a Shipyard Skulker (YES side); P2 has Test Kill in hand for (c).
 * Victory score raised so the (b) conquer point never ends anything.
 */
function board(defender: "galio" | "skulker") {
  const b = scenario()
    .turn(3)
    .active(P1)
    .victoryScore(15)
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", SONA, "sona")
    .unit(P2, "bf1", defender === "galio" ? GALIO : SHIPYARD_SKULKER, "def")
    .hand(P2, TEST_KILL, "kill");
  for (const r of RUNES) {
    b.rune(P1, "calm", { alias: r, exhausted: true });
  }
  return b;
}

const ready = (game: Game) => [...game.p1.runes({ ready: true })].sort();

/** Is P1 being asked to choose Sona's runes right now? If so, name r1..r4. */
async function chooseSonaRunesIfAsked(game: Game): Promise<boolean> {
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "sona") {
    await game.p1.pick("r1", "r2", "r3", "r4");
    return true;
  }
  return false;
}

/** Sona Standard-Moves into bf1 and the combat is fought through (both pass Focus, damage, combat cleanup). */
async function sonaAttacks(defender: "galio" | "skulker"): Promise<Game> {
  const game = await board(defender).build();
  await game.p1.move("sona", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // attacker P1 has Focus
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.turnPlayer()).toBe(P1);
  return game;
}

describe("(a) NO side — Sona bounces off Galio: recalled at 3d, so 'if I'm at a battlefield' is false at end of turn", () => {
  test("the Standard Move exhausts Sona (144.2) and opens the combat showdown at bf1 with P1 attacking / holding Focus, Galio defending", async () => {
    const game = await board("galio").build();
    expect(game.state("sona")).toMatchObject({ isReady: true, location: "base", might: 4 });
    expect(game.state("def")).toMatchObject({ location: "bf1", might: 6 });
    await game.p1.move("sona", "bf1");
    expect(game.state("sona")).toMatchObject({ combatRole: "attacker", isExhausted: true, location: "bf1" });
    expect(game.state("def").combatRole).toBe("defender");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({
      attackingPlayer: P1,
      battlefieldId: "bf1",
      defendingPlayer: P2,
      focusPlayer: P1,
      isCombatShowdown: true,
    });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
  });

  test("combat: Sona's 4 does not kill Galio (6) and is healed off at 3c; Galio deals NO combat damage → Sona undamaged; defenders remain → 3d RECALLS the attacker: Sona is in P1's base, 'No Result' — bf1 stays P2's uncontested, nobody scores", async () => {
    const game = await sonaAttacks("galio");
    expect(game.state("def")).toMatchObject({ damage: 0, location: "bf1", zone: "battlefield-bf1" });
    expect(game.state("sona")).toMatchObject({ damage: 0, location: "base", zone: "base" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("458.1 / 456: the recall keeps her state — Sona is home EXHAUSTED (not readied), 0 damage, 4 Might, no combat role — and it was not a Move: P1's units-moved-this-turn ledger still reads 1 (the Standard Move only)", async () => {
    const game = await sonaAttacks("galio");
    expect(game.state("sona")).toMatchObject({ damage: 0, isExhausted: true, isStunned: false, location: "base", might: 4 });
    expect(game.state("sona").combatRole ?? null).toBeNull();
    expect(game.gameState.unitsMovedThisTurn?.[P1]).toBe(1);
    // and she cannot simply walk back this turn: exhausted → no Standard Move offered for her
    expect(game.p1.legal().some((o) => o.verb === "move" && o.variants.some((v) => (v.params.units as string[] | undefined)?.includes("sona")))).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("383.2.a.1 + 456.2: P1 ends the turn with Sona in BASE → her ability is NEVER put on the chain — no chain item, no rune prompt, no priority window for anyone — and the game rolls straight into P2's Main Phase", async () => {
    const game = await sonaAttacks("galio");
    await game.p1.endTurn();
    expect(await chooseSonaRunesIfAsked(game)).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("…so ZERO runes are readied by it: all five of P1's runes are still exhausted on P2's turn; Sona sits in base exhausted and undamaged; Galio still holds bf1 for P2", async () => {
    const game = await sonaAttacks("galio");
    await game.p1.endTurn();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(ready(game)).toEqual([]);
    expect([...game.p1.runes({ ready: false })].sort()).toEqual(RUNES);
    expect(game.state("sona")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    expect(game.state("def")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) YES side — Sona beats a Skulker and STAYS at bf1: the trigger goes on the chain and readies 4 runes", () => {
  test("combat 4 vs 3: Skulker dies, Sona survives (3 damage healed at 3c), no defenders → not recalled; P1 conquers bf1 for +1; Sona remains at bf1 EXHAUSTED", async () => {
    const game = await sonaAttacks("skulker");
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.state("sona")).toMatchObject({ damage: 0, isExhausted: true, location: "bf1", zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.unitsMovedThisTurn?.[P1]).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("end of turn (317.1): the condition holds → Sona's triggered ability IS placed on the chain as P1's item, in P1's Ending Step, with P1 holding priority first; nothing has readied yet", async () => {
    const game = await sonaAttacks("skulker");
    await game.p1.endTurn();
    await chooseSonaRunesIfAsked(game); // (if the engine asks at finalization)
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sona", controller: P1, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(ready(game)).toEqual([]);
  });

  test("both pass → it resolves: P1 readies 4 of the 5 exhausted runes (r1..r4 chosen), r5 stays exhausted; then 317.2 empties the pool and P2's turn opens with those 4 runes STILL READY, Sona still at bf1", async () => {
    const game = await sonaAttacks("skulker");
    await game.p1.endTurn();
    await chooseSonaRunesIfAsked(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    await chooseSonaRunesIfAsked(game); // (if the engine asks at resolution instead)
    expect(ready(game)).toEqual(["r1", "r2", "r3", "r4"]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(ready(game)).toEqual(["r1", "r2", "r3", "r4"]);
    expect(game.state("r5").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("sona")).toMatchObject({ location: "bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("discriminator: the very same endTurn() leaves (b) in P1's Ending Step with [Sona] on the chain but (a) already in P2's turn with an empty chain — (a) is 'no trigger', not 'trigger that fizzled'", async () => {
    const yes = await sonaAttacks("skulker");
    await yes.p1.endTurn();
    await chooseSonaRunesIfAsked(yes);
    expect(yes.chain().map((c) => c.cardId)).toEqual(["sona"]);
    expect(yes.turnPlayer()).toBe(P1);

    const no = await sonaAttacks("galio");
    await no.p1.endTurn();
    expect(no.chain()).toEqual([]);
    expect(no.turnPlayer()).toBe(P2);
  });
});

describe("(c) edge — once on the chain the ability resolves even if Sona is removed in response (383.2.a.1, second sentence)", () => {
  test("P2 responds with a Reaction kill on Sona: it resolves first (LIFO) → Sona in P1's trash while her ability is still on the chain; the ability then resolves anyway → 4 runes ready going into P2's turn", async () => {
    const game = await sonaAttacks("skulker");
    await game.p1.endTurn();
    await chooseSonaRunesIfAsked(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "kill")).toBe(true);
    await game.p2.cast("kill", { targets: "sona" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sona", "kill"]); // bottom → top
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("sona")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sona", triggered: true })]);
    expect(ready(game)).toEqual([]);
    // both pass on the source-less ability → it still resolves
    await game.acting().passPriority();
    await game.acting().passPriority();
    await chooseSonaRunesIfAsked(game);
    expect(ready(game)).toEqual(["r1", "r2", "r3", "r4"]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P2);
    expect(ready(game)).toEqual(["r1", "r2", "r3", "r4"]);
    expect(game.zoneOf("sona")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});

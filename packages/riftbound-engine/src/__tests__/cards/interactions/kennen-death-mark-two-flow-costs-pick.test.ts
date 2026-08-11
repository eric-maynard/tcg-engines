/**
 * Interaction: Kennen, Storm of Shuriken (ven-113-166) · Champion unit · Chaos · 3+[chaos] · 4 Might
 *     "When you play me, [Burn 2]. When I conquer, give a spell in your trash [Flow] equal to its cost this turn."
 *   × Death Mark (ven-144-166) · Spell · Fury/Chaos · 2 + [rainbow] (one power pip)
 *     "[Burn 3]. Play a 0 [Might] Shadow Clone unit token. [Flow] [1][rainbow][rainbow]"
 *   × Defy (ogn-045-298) · Reaction · 1+[calm] — "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Rules: 829.1.b (Flow = "you may play this from your trash for its Flow cost. Then banish it."), 829.1.b.1 / 390.3.a
 * (the banish is a delayed replacement on leaving the chain — resolves OR is countered ⇒ banished), 829.1.b.2 (Flow never
 * changes timing), 829.1.c.1 / 356.1.a (a Flow cost is an ALTERNATE cost replacing the base cost), 829.1.c.3 (several
 * Flow instances with different costs ⇒ the CONTROLLER chooses which to apply as they play it), 206 ("equal to its
 * cost" = PRINTED cost ⇒ granted Flow = [2] + 1 pip), 357.1.a (Add while paying — DESIGN: manual pay, tap first), 155
 * (standard spell: your turn, Open state, no showdown), 185.2.a / 355.2.a (a token PLAYED by a spell goes to your base or
 * a battlefield you control), 185.3.a.1 (token cost 0), 359.2.c (permanents enter exhausted), 182 / 183 (you own and
 * control the token you play), 440.1 (Burn from the top).
 *
 * Question: Death Mark is in P1's trash; Kennen conquers bf1 and grants it "[Flow] equal to its cost" this turn. Death
 * Mark now carries TWO Flow costs — printed [1]+2 pips and granted [2]+1 pip.
 *  (a) Which applies / who chooses / must both be enumerated and either exact payment accepted (and nothing else)?
 *  (b) Timing vs a hand cast?  (c) Burn 3 mid-resolution; where may the Shadow Clone go; exhausted?
 *  (d) Destination under either Flow choice; Flow again?; countered?  (e) Contrast: hand cast same turn; what differs
 *      between electing the granted vs the printed Flow cost.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KENNEN = "ven-113-166";
const DEATH_MARK = "ven-144-166";
const DEFY = "ogn-045-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit — deck filler that is NOT a spell

const clones = (game: Game) => game.p1.units().filter((id) => game.state(id).name === "Shadow Clone");

/**
 * P1's turn. Pool = `energy` + `rainbow` any-domain power. Kennen ready in base; bf1 seeded to P2 with no unit (Kennen
 * walks in and conquers); P2 holds bf2 with a unit. Death Mark "dmTrash" is the ONLY spell in P1's trash (the conquer
 * trigger auto-binds it); a second copy "dmHand" is in hand. Deck top→: d1 (Skulker), dm2 (a third Death Mark), d3, d4,
 * d5 — so Burn 3 mills exactly d1, dm2, d3. P2 has Defy + 1+[calm].
 */
function board(energy: number, rainbow: number) {
  return scenario()
    .resources(P1, { energy, power: { rainbow } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", KENNEN, "kennen")
    .unit(P2, "bf2", { might: 2, name: "Enemy" }, "enemy")
    .trash(P1, DEATH_MARK, "dmTrash")
    .hand(P1, DEATH_MARK, "dmHand")
    .hand(P2, DEFY, "defy")
    .deck(P1, [SKULKER, DEATH_MARK, SKULKER, SKULKER, SKULKER], ["d1", "dm2", "d3", "d4", "d5"]);
}

/** Kennen moves alone onto bf1 and conquers; his trigger's only candidate (dmTrash) is bound and the grant resolves. */
async function conquerAndGrant(game: Game): Promise<void> {
  await game.p1.move("kennen", "bf1");
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = r.decision;
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "dmTrash")) {
      await game.p1.pick("dmTrash");
      continue;
    }
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
      continue;
    }
    break;
  }
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.zoneOf("dmTrash")).toBe("trash");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
}

/** Flow dmTrash, let it resolve, and put the Shadow Clone at `dest` when asked. */
async function flowAndResolve(game: Game, dest: "base" | "bf1" = "base"): Promise<void> {
  await game.p1.cast("dmTrash", { flow: true });
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(dest);
    await game.settle();
  }
  expect(game.chain()).toEqual([]);
}

describe("Kennen grants Death Mark a second Flow — two Flow costs, controller's pick, banished either way", () => {
  // ── setup ───────────────────────────────────────────────────────────────────────────────

  test("setup: Kennen conquers bf1 (P1 +1 point) and his trigger gives the lone trash spell Flow equal to its PRINTED cost (206): dmTrash carries grantedFlow = [2] + one rainbow pip, this turn", async () => {
    const game = await board(3, 3).build();
    expect(game.state("dmTrash").meta.grantedFlow).toBeUndefined();
    await conquerAndGrant(game);
    expect(game.p1.points()).toBe(1);
    expect(game.locationOf("kennen")).toBe("bf1");
    expect(game.state("dmTrash").meta.grantedFlow).toEqual({ duration: "turn", energy: 2, power: ["rainbow"] });
    expect(game.state("dmHand").meta.grantedFlow).toBeUndefined(); // the grant is per card, not per name
  });

  // ── (a) two Flow costs: either exact payment, nothing else ──────────────────────────────

  test("(a) pool EXACTLY [2] + 1 pip: before the grant the trash copy is NOT castable (printed Flow wants 2 pips); after it, it IS — and the Flow play drains the pool to 0/0 (granted cost applied, 829.1.c.1)", async () => {
    const game = await board(2, 1).build();
    expect(game.p1.can("cast", "dmTrash")).toBe(false);
    await conquerAndGrant(game);
    expect(game.p1.can("cast", "dmTrash")).toBe(true);
    expect(game.p1.option("cast", "dmTrash")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
    await game.p1.cast("dmTrash", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("dmTrash")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dmTrash", controller: P1, triggered: false, type: "spell" })]);
  });

  test("(a) pool EXACTLY [1] + 2 pips: castable via the PRINTED Flow both before and after the grant; the play drains the pool to 0/0", async () => {
    const game = await board(1, 2).build();
    expect(game.p1.can("cast", "dmTrash")).toBe(true); // printed Flow alone suffices
    await conquerAndGrant(game);
    expect(game.p1.can("cast", "dmTrash")).toBe(true);
    await game.p1.cast("dmTrash", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("dmTrash")).toBe("chain");
  });

  test("(a) nothing else pays: [1]+1 pip, [3]+0 pips and [0]+3 pips are each short of BOTH Flow costs ⇒ the trash copy is not offered even after the grant (and the hand copy's base 2+pip is a different question)", async () => {
    for (const [e, r] of [
      [1, 1],
      [3, 0],
      [0, 3],
    ] as const) {
      const game = await board(e, r).build();
      await conquerAndGrant(game);
      expect(game.p1.can("cast", "dmTrash")).toBe(false);
      expect((await game.p1.try((p) => p.cast("dmTrash", { flow: true }))).ok).toBe(false);
      expect(game.zoneOf("dmTrash")).toBe("trash");
    }
  });

  // Expected (829.1.c.3 / 356.1.a): with a pool that covers BOTH Flow costs the controller elects one as they play it, so
  // the play-options model must surface two distinct cost elections for the same trash card (printed `flow` = [1]+2 pips
  // and granted `flow-1` = [2]+1 pip). Actual: one variant `{viaFlow:true, costs:{alternativeId:"flow"}}`; the engine
  // silently picks a cost for the player (cheapest energy the pool covers).
  test("(a) rich pool ([3] + 3 pips): the cast option exposes TWO Flow cost elections (printed [1]+2 pips AND Kennen's [2]+1 pip) for the controller to choose between (829.1.c.3)", async () => {
    const game = await board(3, 3).build();
    await conquerAndGrant(game);
    const opt = game.p1.option("cast", "dmTrash");
    expect(opt).toBeDefined();
    const elections = new Set(opt!.variants.map((v) => JSON.stringify((v.params as { costs?: unknown }).costs ?? null)));
    expect(elections.size).toBe(2);
    expect([...elections].sort()).toEqual([JSON.stringify({ alternativeId: "flow" }), JSON.stringify({ alternativeId: "flow-1" })]);
  });

  test("(a) rich pool, electing the PRINTED Flow: `flow` charges exactly [1] + 2 pips (3/3 → 2/1)", async () => {
    const game = await board(3, 3).build();
    await conquerAndGrant(game);
    await game.p1.cast("dmTrash", { costs: { alternativeId: "flow" } });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
    expect(game.zoneOf("dmTrash")).toBe("chain");
  });

  // Expected: electing Kennen's granted Flow charges [2] + 1 pip (3/3 → 1/2) — the controller's choice, not the engine's.
  // Actual: no `flow-1` election is offered (the harness finds no matching variant), and even a raw playSpell naming
  // `costs:{alternativeId:"flow-1"}` is charged the printed [1]+2 pips.
  test("(a) rich pool, electing the GRANTED Flow: `flow-1` charges exactly [2] + 1 pip (3/3 → 1/2) (829.1.c.3)", async () => {
    const game = await board(3, 3).build();
    await conquerAndGrant(game);
    await game.p1.cast("dmTrash", { costs: { alternativeId: "flow-1" } });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 2 } });
    expect(game.zoneOf("dmTrash")).toBe("chain");
  });

  // DESIGN (DESIGN.md § Paying costs): rule 357.1.a's Add-during-payment is manual — the play is offered only once the
  // pool covers a Flow cost; the player exhausts the rune first, then plays.
  test("(a) [Add] to pay (357.1.a, DESIGN manual pay): at [1] + 1 pip the Flow play is not offered; exhausting a ready rune (→ [2] + 1 pip) makes the GRANTED cost payable and the play then takes everything", async () => {
    const game = await board(1, 1).rune(P1, "chaos", { alias: "chaosRune" }).build();
    await conquerAndGrant(game);
    expect(game.p1.can("cast", "dmTrash")).toBe(false);
    await game.p1.tapRune("chaosRune");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
    expect(game.p1.can("cast", "dmTrash")).toBe(true);
    await game.p1.cast("dmTrash", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  // ── (b) timing unchanged ────────────────────────────────────────────────────────────────

  test("(b) Flow does not change timing (829.1.b.2 / 155): the granted-Flow trash copy is NOT playable while a spell is on the chain, nor inside a showdown — exactly like the hand copy", async () => {
    const chain = await board(5, 4).build();
    await conquerAndGrant(chain);
    await chain.p1.cast("dmHand"); // 2 + pip from hand → a chain exists
    expect(chain.chain().map((c) => c.cardId)).toEqual(["dmHand"]);
    expect(chain.p1.can("cast", "dmTrash")).toBe(false);
    expect((await chain.p1.try((p) => p.cast("dmTrash", { flow: true }))).ok).toBe(false);

    const showdown = await board(3, 3).unit(P1, "base", { might: 1, name: "Scout" }, "scout").autoProcedures(false).build();
    await conquerAndGrant(showdown);
    await showdown.p1.move("scout", "bf2"); // into P2's occupied bf2 → combat showdown, P1 (attacker) has Focus
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown.p1.can("cast", "dmTrash")).toBe(false);
    expect(showdown.p1.can("cast", "dmHand")).toBe(false);
  });

  test("(b) … and not on the opponent's turn either: after P1 passes the turn the grant has also lapsed ('this turn'), so on P1's NEXT turn only the printed Flow remains ([2]+1 pip no longer pays)", async () => {
    const game = await board(2, 1).fillDecks({ main: 12, runes: 12 }).build();
    await conquerAndGrant(game);
    expect(game.p1.can("cast", "dmTrash")).toBe(true);
    await game.advanceToTurnOf(P2);
    expect(game.p1.can("cast", "dmTrash")).toBe(false); // not your turn
    await game.advanceToTurnOf(P1);
    expect(game.zoneOf("dmTrash")).toBe("trash");
    expect(game.state("dmTrash").meta.grantedFlow).toBeUndefined();
    expect(game.p1.energy()).toBe(0); // pools emptied at end of turn
    expect(game.p1.power("rainbow")).toBe(0);
    await game.p1.do("addResources", { energy: 2, power: { rainbow: 1 } }); // exactly Kennen's old shape
    expect(game.p1.can("cast", "dmTrash")).toBe(false); // [2]+1 pip is no longer a Flow cost of this card
    await game.p1.do("addResources", { power: { rainbow: 1 } }); // → [2] + 2 pips covers the printed Flow
    expect(game.p1.can("cast", "dmTrash")).toBe(true);
  });

  // ── (c) resolution: Burn 3, token placement ─────────────────────────────────────────────

  test("(c) resolution: Burn 3 mills exactly d1, dm2, d3 from the TOP into P1's trash mid-resolution (irrelevant to this play), then the Shadow Clone's destination prompt offers exactly {base, bf1 (Kennen holds it)} — never the enemy bf2", async () => {
    const game = await board(2, 1).build();
    await conquerAndGrant(game);
    await game.p1.cast("dmTrash", { flow: true });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect((d?.kind === "pick" ? d.options.map((o) => o.key) : []).sort()).toEqual(["base", "battlefield-bf1"]);
    expect(game.p1.trash().sort()).toEqual(["d1", "d3", "dm2"]); // burned already; dmTrash itself is not in the trash
    expect(game.p1.deck()[0]).toBe("d4");
    await game.p1.pick("bf1");
    await game.settle();
    const c = clones(game);
    expect(c).toHaveLength(1);
    expect(game.state(c[0]!)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, location: "bf1", might: 0, owner: P1, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("(c) the token may equally go to base; it costs nothing extra (185.3.a.1) and enters EXHAUSTED (359.2.c)", async () => {
    const game = await board(2, 1).build();
    await conquerAndGrant(game);
    await flowAndResolve(game, "base");
    const c = clones(game);
    expect(c).toHaveLength(1);
    expect(game.state(c[0]!)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, location: "base", might: 0 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("(c) a Death Mark burned INTO the trash by this resolution (dm2) has only its PRINTED Flow — Kennen's grant was to dmTrash alone: with [1]+2 pips left it is castable, with [2]+1 pip left it is not", async () => {
    const printedLeft = await board(3, 3).build();
    await conquerAndGrant(printedLeft);
    await flowAndResolve(printedLeft); // engine applies the printed [1]+2 pips here → [2] + 1 pip left
    expect(printedLeft.zoneOf("dm2")).toBe("trash");
    expect(printedLeft.state("dm2").meta.grantedFlow).toBeUndefined();
    expect(printedLeft.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
    expect(printedLeft.p1.can("cast", "dm2")).toBe(false); // Kennen's [2]+1 pip shape does not exist on dm2
    await printedLeft.p1.do("addResources", { power: { rainbow: 1 } }); // → [2] + 2 pips
    expect(printedLeft.p1.can("cast", "dm2")).toBe(true); // its own printed Flow [1]+2 pips
    await printedLeft.p1.cast("dm2", { flow: true });
    expect(printedLeft.p1.resources()).toEqual({ energy: 1, power: { rainbow: 0 } });
  });

  // ── (d) destination: banishment under either Flow choice; countered too ─────────────────

  test("(d) paid with the GRANTED cost ([2]+1 pip pool): after resolving Death Mark is in P1's BANISHMENT — not in the trash — and cannot be Flowed again (829.1.b.1)", async () => {
    const game = await board(2, 1).build();
    await conquerAndGrant(game);
    await flowAndResolve(game);
    expect(game.zoneOf("dmTrash")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["dmTrash"]);
    expect(game.p1.trash()).not.toContain("dmTrash");
    expect(game.state("dmTrash").owner).toBe(P1);
    await game.p1.do("addResources", { energy: 5, power: { rainbow: 3 } });
    expect(game.p1.can("cast", "dmTrash")).toBe(false); // banishment is not the trash
  });

  test("(d) paid with the PRINTED cost ([1]+2 pips pool): same destination — P1's banishment, no second Flow", async () => {
    const game = await board(1, 2).build();
    await conquerAndGrant(game);
    await flowAndResolve(game);
    expect(game.zoneOf("dmTrash")).toBe("banishment");
    expect(game.p1.trash().sort()).toEqual(["d1", "d3", "dm2"]);
    expect(game.p1.can("cast", "dmTrash")).toBe(false);
  });

  test("(d) countered: Defy (printed 2 + 1 pip ≤ 4 / 1, rule 206) counters the Flowed Death Mark → it is STILL banished (390.3.a), nothing burned, no token, no refund", async () => {
    const game = await board(2, 1).build();
    await conquerAndGrant(game);
    await game.p1.cast("dmTrash", { flow: true });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "dmTrash" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("dmTrash")).toBe("banishment");
    expect(game.p1.trash()).toEqual([]); // no Burn 3
    expect(game.p1.deck()[0]).toBe("d1");
    expect(clones(game)).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // 425.1.c
    expect(game.violations()).toEqual([]);
  });

  // ── (e) contrast: hand cast the same turn; what the election changes ───────────────────

  test("(e) contrast — hard-cast from HAND the same turn: base cost [2] + 1 pip, resolves → P1's TRASH (no rider); from there its own printed Flow ([1]+2 pips) is live and a second play ends in BANISHMENT", async () => {
    const game = await board(3, 3).build();
    await conquerAndGrant(game);
    expect(game.p1.option("cast", "dmHand")?.variants.every((v) => (v.params as { viaFlow?: boolean }).viaFlow !== true)).toBe(true);
    await game.p1.cast("dmHand");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 2 } });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.zoneOf("dmHand")).toBe("trash");
    expect(clones(game)).toHaveLength(1);
    // now a Flow candidate (printed Flow only — Kennen's grant went to dmTrash)
    expect(game.state("dmHand").meta.grantedFlow).toBeUndefined();
    expect(game.p1.can("cast", "dmHand")).toBe(true);
    await game.p1.cast("dmHand", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.zoneOf("dmHand")).toBe("banishment");
    expect(clones(game)).toHaveLength(2);
  });

  test("(e) granted vs printed election changes ONLY what was paid: both lines burn the same 3, make one exhausted 0-Might Clone, banish the card and leave Defy-legality (printed 2+pip) untouched; the energy-spent ledger reads 2 vs 1", async () => {
    const granted = await board(2, 1).build();
    await conquerAndGrant(granted);
    await flowAndResolve(granted);
    const printed = await board(1, 2).build();
    await conquerAndGrant(printed);
    await flowAndResolve(printed);
    for (const g of [granted, printed]) {
      expect(g.zoneOf("dmTrash")).toBe("banishment");
      expect(g.p1.trash().sort()).toEqual(["d1", "d3", "dm2"]);
      expect(clones(g)).toHaveLength(1);
      expect(g.state(clones(g)[0]!)).toMatchObject({ isExhausted: true, might: 0 });
      expect(g.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
      expect(g.state("dmTrash").energyCost).toBe(2); // printed cost is what 206-style checks read
    }
    expect(granted.gameState.spellEnergySpentThisTurn?.[P1]).toBe(2);
    expect(printed.gameState.spellEnergySpentThisTurn?.[P1]).toBe(1);
  });
});

/**
 * Interaction: Chakram Dancer (unl-071-219) · Unit · Mind · 3 · 3 Might
 *     "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *      When you play me, give your other units here [Shield] this turn. (+1 [Might] while they're defenders.)"
 *   × Mystic Vortex (ven-160-166) · Battlefield
 *     "During showdowns here, cards with [Reaction] cost [rainbow] more to play. (Hidden cards have [Reaction].)"
 *
 * Rules: 822.1.b / 822.1.c (Ambush = "I may be played to a battlefield where you control units" AND "I have
 * [Reaction] as long as I'm being played to a battlefield where you control units"), 822.4 + 813.4 / 813.5
 * (a conditionally granted Reaction IS the Reaction characteristic while the condition holds — referencable
 * by other effects such as the Vortex), 813.3.a / 806.3 (Reaction is only timing permission; a unit still
 * goes to base or a battlefield you control), 343.1.a (by default no card can be played in a Showdown state),
 * 355.2.a (valid locations chosen at play time), 356.3 (apply cost increases), 358.4 (unpayable → not a
 * legal play), 337.2 (a unit chain item resolves immediately), 323.2.a / 464.2.c.3.a (a unit arriving
 * mid-combat takes its controller's designation), 814 (Shield: +1 Might while a defender).
 *
 * Q: P2's turn. P1 controls the Vortex with a lone 3-Might Warden W and holds Chakram Dancer with 3 energy
 * + 1 rainbow power. P2 moves a 4-Might attacker A into the Vortex; P2 (Focus) passes; P1 has Focus.
 *   (a) Is the Dancer playable now, to which destinations, and for how much?
 *       → Yes; ONLY to the Vortex (base is not offered — there she'd have no Reaction); while being played
 *         there she HAS Reaction, so the Vortex taxes her: 3 energy + 1 rainbow. She resolves at once,
 *         enters exhausted, her trigger gives W [Shield]; she becomes a Defender.
 *   (b) Same but 0 power → not playable at all at the Vortex; at an ordinary battlefield playable for 3.
 *   (c) P1's own open main phase, no showdown → flat 3 to either the Vortex or base.
 *   (d) Combat in (a): W (3+1) + Dancer 3 = 7 vs A 4 → A dies; P2's 4 kills at most one defender; P1 keeps
 *       the Vortex.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHAKRAM_DANCER = "unl-071-219";
const MYSTIC_VORTEX = "ven-160-166";

type Distribute = Extract<Decision, { kind: "distribute" }>;

/** Legal `to` destinations offered to P1 for playing the Dancer right now ([] when not offered). */
function destinationsOffered(game: Game): string[] {
  const opt = game.p1.option("play", "dancer");
  const field = opt?.fields.find((f) => f.arg === "to");
  return ((field?.options ?? []) as string[]).slice().sort();
}

/**
 * P1 controls battlefield "mv" (the Mystic Vortex unless `vortex:false` → an inert plain battlefield)
 * with a lone 3-Might Warden. P1 holds Chakram Dancer with 3 energy + `power` (default 1 rainbow).
 * P2 has a 4-Might attacker in base. `active` = whose turn it is (default P2).
 */
function board(o: { power?: Record<string, number>; vortex?: boolean; active?: typeof P1 } = {}) {
  return scenario()
    .turn(3)
    .active(o.active ?? P2)
    .resources(P1, { energy: 3, power: o.power ?? { rainbow: 1 } })
    .battlefield("mv", o.vortex === false ? { controller: P1 } : { controller: P1, def: MYSTIC_VORTEX, inert: false, owner: P1 })
    .unit(P1, "mv", { might: 3, name: "Warden" }, "w")
    .unit(P2, "base", { might: 4, name: "Attacker" }, "a")
    .hand(P1, CHAKRAM_DANCER, "dancer");
}

/** P2 attacks the Vortex with A and passes Focus → P1 holds Focus in the combat showdown, empty chain. */
async function p1HasFocus(o: Parameters<typeof board>[0] = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p2.move("a", "mv");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p1.legal()).toEqual([]); // nothing for P1 while P2 holds Focus
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Chakram Dancer [Ambush] into a showdown at Mystic Vortex — the granted Reaction is taxed", () => {
  // ── (a) playable, where, and for how much ───────────────────────────────────────────────────────
  test("(a) with Focus in the showdown the Dancer (no printed Reaction) IS playable — Ambush supplies both the location and the timing (822.1.b)", async () => {
    const game = await p1HasFocus();
    expect(game.state("dancer").keywords).toContain("Ambush");
    expect(game.state("dancer").keywords).not.toContain("Reaction");
    expect(game.p1.can("play", "dancer")).toBe(true);
  });

  test("(a) the ONLY destination offered is the Vortex (where W stands); base is not offered and is rejected — to base she would carry no Reaction (822.1.b, 343.1.a, 813.3.a)", async () => {
    const game = await p1HasFocus();
    expect(destinationsOffered(game)).toEqual(["battlefield-mv"]);
    await expect(game.p1.play("dancer", { to: "base" })).rejects.toThrow();
    expect(game.zoneOf("dancer")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 1 } });
  });

  // Expected: while being played to the Vortex the Dancer HAS [Reaction] (822.1.b second clause, 822.4,
  // 813.4/813.5), so Mystic Vortex's "cards with [Reaction] cost [rainbow] more" applies in step 356.3:
  // total 3 energy + 1 rainbow → pool 0/0. Actual: the engine charges only the printed 3 and leaves the
  // rainbow pip — it does not treat the Ambush-granted Reaction as the Reaction characteristic.
  test("(a) played to the Vortex she costs 3 energy + 1 rainbow — the Ambush-granted Reaction is a characteristic the Vortex sees (822.4, 813.4, 813.5, 356.3)", async () => {
    const game = await p1HasFocus();
    await game.p1.play("dancer", { to: "mv" });
    expect(game.zoneOf("dancer")).toBe("battlefield-mv");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("(a) the unit item resolves immediately (337.2): she is at the Vortex, exhausted, energy spent; only her 'When you play me' trigger sits on the chain with P1 holding priority", async () => {
    const game = await p1HasFocus();
    await game.p1.play("dancer", { to: "mv" });
    expect(game.zoneOf("dancer")).toBe("battlefield-mv");
    expect(game.state("dancer")).toMatchObject({ controller: P1, isExhausted: true, location: "mv" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dancer", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) both pass → the trigger resolves: W ('your other units here') gains [Shield] this turn and reads 4 as a defender; the Dancer herself gets nothing and is a 3-Might Defender (814, 323.2.a / 464.2.c.3.a)", async () => {
    const game = await p1HasFocus();
    await game.p1.play("dancer", { to: "mv" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("w").grantedKeywords).toEqual([expect.objectContaining({ duration: "turn", keyword: "Shield" })]);
    expect(game.state("w")).toMatchObject({ combatRole: "defender", might: 4 });
    expect(game.state("dancer").grantedKeywords).toEqual([]);
    expect(game.state("dancer")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("a")).toMatchObject({ combatRole: "attacker", might: 4 });
    // The showdown goes on — Focus has moved on to P2.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  // ── (b) no power ────────────────────────────────────────────────────────────────────────────────
  // Expected: with 3 energy and 0 power the Vortex surcharge is unpayable, and the Vortex is the Dancer's
  // only legal destination at this timing → she is not a legal play at all (seat.can false, nothing
  // offered). Actual: the engine offers playUnit:dancer → battlefield-mv for a bare 3.
  test("(b) 3 energy but 0 power — the taxed Ambush play is unaffordable, so the Dancer is not offered at all during the Vortex showdown (356.3, 358.4)", async () => {
    const game = await p1HasFocus({ power: {} });
    expect(destinationsOffered(game)).toEqual([]);
    expect(game.p1.can("play", "dancer")).toBe(false);
    expect((await game.p1.try((p) => p.play("dancer", { to: "mv" }))).ok).toBe(false);
    expect(game.zoneOf("dancer")).toBe("hand");
  });

  test("(b) contrast — identical position at an ORDINARY battlefield: with 0 power she is offered (only → that battlefield) and costs exactly 3", async () => {
    const game = await p1HasFocus({ power: {}, vortex: false });
    expect(game.p1.can("play", "dancer")).toBe(true);
    expect(destinationsOffered(game)).toEqual(["battlefield-mv"]);
    await game.p1.play("dancer", { to: "mv" });
    expect(game.zoneOf("dancer")).toBe("battlefield-mv");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  // ── (c) own turn, no showdown ───────────────────────────────────────────────────────────────────
  test("(c) P1's own open main phase: both the Vortex and base are offered (355.2.a + 822.1.b)", async () => {
    const game = await board({ active: P1 }).build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(destinationsOffered(game)).toEqual(["base", "battlefield-mv"]);
  });

  test("(c) → the Vortex in an open state costs a flat 3 — 'during showdowns here' is not met, rainbow untouched", async () => {
    const game = await board({ active: P1 }).build();
    await game.p1.play("dancer", { to: "mv" });
    expect(game.zoneOf("dancer")).toBe("battlefield-mv");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    await game.settle();
    expect(game.state("w").keywords).toContain("Shield"); // trigger still works; W is 'here'
  });

  test("(c) → base costs a flat 3 too (no showdown, and to base she doesn't even carry Reaction); W is not 'here' so gets no Shield", async () => {
    const game = await board({ active: P1 }).build();
    await game.p1.play("dancer", { to: "base" });
    expect(game.zoneOf("dancer")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    await game.settle();
    expect(game.state("w").grantedKeywords).toEqual([]);
  });

  // ── (d) combat outcome of (a) ───────────────────────────────────────────────────────────────────
  test("(d) P2 must assign its 4 as full lethal: the legal lines are exactly 'W 4' (3+Shield) or 'Dancer 3 + W 1' — Shield raises W's lethal threshold to 4 (814, 465.2.c.3)", async () => {
    const game = await p1HasFocus();
    await game.p1.play("dancer", { to: "mv" });
    let seen: Distribute | undefined;
    game.script(P2, [
      (d) => {
        if (d.kind === "distribute") {
          seen = d;
        }
        return undefined;
      },
    ]);
    await game.settle();
    expect(seen).toMatchObject({ kind: "distribute", seat: P2, total: 4 });
    const lethal = Object.fromEntries((seen?.buckets ?? []).map((b) => [b.key, b.lethal]));
    expect(lethal).toEqual({ dancer: 3, w: 4 });
  });

  test("(d) default line (4 → W): defenders 4 + 3 = 7 kill A; W dies at exactly 4, the Dancer survives and P1 KEEPS the Vortex; nobody scores; back to P2's main phase", async () => {
    const game = await p1HasFocus();
    await game.p1.play("dancer", { to: "mv" });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("w")).toBe("trash");
    expect(game.zoneOf("dancer")).toBe("battlefield-mv");
    expect(game.state("dancer").damage).toBe(0);
    expect(game.gameState.battlefields.mv).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) alternative line (3 → Dancer, 1 wasted on W): the Dancer dies, W survives healed, A still dies to 7 — P1 keeps the Vortex either way", async () => {
    const game = await p1HasFocus();
    await game.p1.play("dancer", { to: "mv" });
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { dancer: 3, w: 1 }, kind: "distribute" } : undefined)]);
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("dancer")).toBe("trash");
    expect(game.zoneOf("w")).toBe("battlefield-mv");
    expect(game.state("w").damage).toBe(0);
    expect(game.gameState.battlefields.mv).toMatchObject({ contested: false, controller: P1 });
  });

  test("(d) P2 can never kill both: assigning all 4 to the 3-Might Dancer (leaving W alive AND overkilling) is not a legal resolution", async () => {
    const game = await p1HasFocus();
    await game.p1.play("dancer", { to: "mv" });
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { dancer: 4 }, kind: "distribute" } : undefined)]);
    await expect(game.settle()).rejects.toThrow();
  });
});

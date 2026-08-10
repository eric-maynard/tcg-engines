/**
 * Interaction: Poppy, Defender of the Meek (unl-178-219) · Champion Unit · Order · 6 + [order] · 5 Might
 *     "…[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.) [Tank]…"
 *   × Shen, Kinkou (ogn-241-298) · Champion Unit · Order · 3 + [order] · 3 Might
 *     "[Reaction] (Play any time, even before spells and abilities resolve, including to a battlefield
 *      you control.) [Shield 2] [Tank]"
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1 + [fury] · Action · "Deal 3 to a unit at a battlefield."
 *
 * Question — "Can I Ambush when there is no showdown at all?" P2's turn, main phase, no showdown
 * anywhere. P1 controls bf1 with a lone 2-Might Squire; bf2 is P2's (one P2 unit); P1's base is empty.
 * P1 holds Poppy and Shen with 9 energy + 2 order. P2 plays Hextech Ray at the Squire and passes
 * priority → P1 holds priority in a NEUTRAL CLOSED state (310.2).
 *   (a) Which destinations are offered for Poppy and for Shen right now?
 *   (b) P1 Ambushes Poppy to bf1: does P2 get to respond to Poppy herself? Can the Ray be re-aimed at
 *       Poppy? Who controls bf1 after the Ray resolves?
 *   (c) Contrast: P1 passes instead — bf1 after the Ray.
 *   (d) After (c), at P2's next chain this turn: is Poppy playable anywhere? Is Shen?
 *
 * Rules: 822.1.b / 822.1.c (Ambush = "may be played to a battlefield where you control units" + "has
 * [Reaction] as long as it is being played there"), 813.4 (conditional Reaction grant), 813.1.c.1 /
 * 813.2 (printed Reaction: playable in Closed states on any player's turn — no showdown needed), 813.3.a
 * (Reaction is permission only: a unit still goes to base or a controlled battlefield), 309.1.a (only
 * Reaction in a Closed state), 310.2 (Neutral Closed), 355.2.a (default valid locations), 337.2 (a
 * finalized unit resolves immediately — never a respondable chain item), 340.4 (priority then goes to
 * the controller of the newest remaining item), 355.15 (targets locked at finalization), 323.6 (Open
 * state, no unit there → lose the battlefield), 806.3 (units enter exhausted).
 *
 * Expected: (a) Poppy → [bf1] only; Shen → [base, bf1]; bf2 for neither. (b) Poppy is paid (6+order),
 * lands at bf1 exhausted at once; the chain still holds only the Ray (target Squire) and P2 merely gets
 * priority back with nothing but pass; Ray kills the Squire; Poppy keeps bf1 for P1. (c) Squire dies,
 * bf1 becomes uncontrolled at the cleanup. (d) Poppy: not playable anywhere; Shen: playable, to base only.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POPPY = "unl-178-219";
const SHEN = "ogn-241-298";
const HEXTECH_RAY = "ogn-009-298";

/**
 * P2's turn 3, main phase, nothing on the chain. P1: bf1 with a lone Squire (2), empty base, Poppy +
 * Shen in hand, 9 energy + 2 order (enough for both). P2: bf2 with one Guard, two Hextech Rays in hand
 * and exactly their cost (the second Ray opens "P2's next chain" for (d)).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 9, power: { order: 2 } })
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "bf2", { might: 3, name: "P2 Guard" }, "guard")
    .hand(P1, POPPY, "poppy")
    .hand(P1, SHEN, "shen")
    .hand(P2, HEXTECH_RAY, "ray")
    .hand(P2, HEXTECH_RAY, "ray2");
}

/** Legal `to` destinations P1 is offered for playing `alias` right now ([] when the play is not offered). */
function destinations(game: Game, alias: string): string[] {
  const f = game.p1.option("play", alias)?.fields.find((x) => x.arg === "to");
  return ((f?.options ?? []) as string[]).slice().sort();
}

/** P2 casts the Ray at the Squire and passes → P1 holds priority in Neutral Closed. */
async function rayOnSquireP1HasPriority(): Promise<Game> {
  const game = await board().build();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  await game.p2.cast("ray", { targets: "squire" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2, targets: ["squire"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Poppy [Ambush] vs Shen [Reaction] — responding on the enemy turn with no showdown anywhere", () => {
  test("premise: it is P2's turn, no showdown exists, and after the Ray is cast the state is Neutral Closed with P1 holding priority (310.2)", async () => {
    const game = await rayOnSquireP1HasPriority();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.gameState.interaction?.showdownStack ?? []).toHaveLength(0);
    for (const bf of Object.values(game.gameState.battlefields)) {
      expect(bf.contested).toBe(false);
    }
    expect(game.chain()).toHaveLength(1);
    expect(game.zoneOf("squire")).toBe("battlefield-bf1"); // nothing dealt yet
  });

  // ── (a) destinations offered ────────────────────────────────────────────────────────────────────

  test("(a) Poppy is offered bf1 ONLY — Ambush grants Reaction solely 'to a battlefield where you control units'; base would need real Reaction, bf2 is neither hers nor occupied by a friend (822.1.b, 813.4, 309.1.a, 355.2.a)", async () => {
    const game = await rayOnSquireP1HasPriority();
    expect(game.p1.can("play", "poppy")).toBe(true);
    expect(destinations(game, "poppy")).toEqual(["battlefield-bf1"]);
    await expect(game.p1.play("poppy", { to: "base" })).rejects.toThrow();
    await expect(game.p1.play("poppy", { to: "bf2" })).rejects.toThrow();
    expect(game.zoneOf("poppy")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 9, power: { order: 2 } });
  });

  test("(a) Shen is offered base AND bf1 — printed Reaction is unconditional timing permission and leaves the normal unit destinations intact; bf2 is not P1's (813.1.c.1, 813.2, 813.3.a)", async () => {
    const game = await rayOnSquireP1HasPriority();
    expect(game.p1.can("play", "shen")).toBe(true);
    expect(destinations(game, "shen")).toEqual(["base", "battlefield-bf1"]);
    await expect(game.p1.play("shen", { to: "bf2" })).rejects.toThrow();
    expect(game.zoneOf("shen")).toBe("hand");
  });

  test("(a) neither needs a showdown: both plays are on P1's menu in Neutral Closed on the OPPONENT's turn (813.2)", async () => {
    const game = await rayOnSquireP1HasPriority();
    const labels = game.p1.legal().map((o) => o.key);
    expect(labels).toContain("playUnit:poppy");
    expect(labels).toContain("playUnit:shen");
  });

  // ── (b) P1 Ambushes Poppy to bf1 ────────────────────────────────────────────────────────────────

  test("(b) Poppy is paid for (6 + [order]) and resolves IMMEDIATELY: she is at bf1, exhausted, and never appears on the chain (337.2, 806.3)", async () => {
    const game = await rayOnSquireP1HasPriority();
    await game.p1.play("poppy", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { order: 1 } });
    expect(game.zoneOf("poppy")).toBe("battlefield-bf1");
    expect(game.state("poppy")).toMatchObject({ controller: P1, isExhausted: true, might: 5 });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ray"]); // only the Ray — Poppy is not a respondable item
  });

  test("(b) P2 gets no window 'in response to Poppy': priority simply returns to P2 as controller of the newest remaining item, whose only options are pass/concede (340.4)", async () => {
    const game = await rayOnSquireP1HasPriority();
    await game.p1.play("poppy", { to: "bf1" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    expect(game.zoneOf("poppy")).toBe("battlefield-bf1"); // already a permanent — nothing to counter
  });

  test("(b) the Ray cannot be re-aimed at Poppy: its target was locked on the Squire at finalization and stays so through resolution (355.15)", async () => {
    const game = await rayOnSquireP1HasPriority();
    await game.p1.play("poppy", { to: "bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", targets: ["squire"] })]);
    expect(game.p2.legal().some((o) => o.card === "ray")).toBe(false); // no re-target / re-cast option
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ray resolves
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("trash"); // 3 damage to a 2-Might unit
    expect(game.state("poppy").damage).toBe(0); // Poppy untouched
  });

  test("(b) after the Ray resolves the Squire is dead but Poppy occupies bf1 → the Cleanup leaves bf1 under P1's control; back to P2's open main phase", async () => {
    const game = await rayOnSquireP1HasPriority();
    await game.p1.play("poppy", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual(["poppy"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) contrast: P1 passes ─────────────────────────────────────────────────────────────────────

  test("(c) if P1 passes instead, the Ray kills the Squire and at the Cleanup (Open state, no showdown, no P1 unit there) P1 LOSES bf1 → uncontrolled (323.6)", async () => {
    const game = await rayOnSquireP1HasPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.zoneOf("poppy")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 9, power: { order: 2 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("(c) …and in P2's Open main phase that follows, P1 (not the turn player, no chain) can play neither Poppy nor Shen", async () => {
    const game = await rayOnSquireP1HasPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.can("play", "poppy")).toBe(false);
    expect(game.p1.can("play", "shen")).toBe(false);
  });

  // ── (d) P2's next chain later this turn ─────────────────────────────────────────────────────────

  test("(d) at P2's next chain (second Ray at its own Guard) P1 again holds priority in Neutral Closed — Poppy is NOT playable anywhere: no friendly unit at any battlefield → Ambush offers no location, and base needs real Reaction (822.1.b, 822.3, 309.1.a)", async () => {
    const game = await rayOnSquireP1HasPriority();
    await game.p1.passPriority(); // (c): Squire dies, bf1 uncontrolled
    await game.p2.cast("ray2", { targets: "guard" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("play", "poppy")).toBe(false);
    expect(destinations(game, "poppy")).toEqual([]);
    await expect(game.p1.play("poppy", { to: "bf1" })).rejects.toThrow();
    await expect(game.p1.play("poppy", { to: "base" })).rejects.toThrow();
    expect(game.zoneOf("poppy")).toBe("hand");
  });

  test("(d) …whereas Shen IS playable there — to P1's base only (bf1 is no longer P1's, bf2 never was) — and lands in base exhausted for 3 + [order] (813.1.c.1, 813.3.a)", async () => {
    const game = await rayOnSquireP1HasPriority();
    await game.p1.passPriority();
    await game.p2.cast("ray2", { targets: "guard" });
    await game.p2.passPriority();
    expect(game.p1.can("play", "shen")).toBe(true);
    expect(destinations(game, "shen")).toEqual(["base"]);
    await expect(game.p1.play("shen", { to: "bf1" })).rejects.toThrow();
    await game.p1.play("shen", { to: "base" });
    expect(game.zoneOf("shen")).toBe("base");
    expect(game.state("shen")).toMatchObject({ controller: P1, isExhausted: true, might: 3 });
    expect(game.p1.resources()).toEqual({ energy: 6, power: { order: 1 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ray2"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash"); // P2 rayed its own 3-Might Guard
    expect(game.violations()).toEqual([]);
  });
});

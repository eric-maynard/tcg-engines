/**
 * Ruling 0a72297be490291d — Temporal Portal (SFD-078 → sfd-078-221) · Mind gear · [3]
 *   "[rainbow], [Exhaust]: Give the next spell you play this turn [Repeat] equal to its cost."
 *   × Charm (OGN-043 → ogn-043-298) · Calm spell (no timing keyword) · [1][calm] — "Move an enemy unit."
 *
 * Q: Charm repeated via Temporal Portal moves two enemy units onto my battlefield(s). One showdown with both,
 *    or two showdowns one by one? What if I Charm them to two different battlefields I control?
 * A: Same battlefield ⇒ ONE showdown that opens only after the whole (repeated) spell has resolved; both moved
 *    units are Attackers, I am the Defender. Two different battlefields ⇒ TWO separate showdowns, resolved
 *    one after the other. Moved units keep their state (an exhausted unit stays exhausted). Charm has no
 *    Action/Reaction timing, so this only works in my Main Phase, never inside a showdown.
 * Rules: 442-ish/459–464 (a Contested battlefield opens a showdown at the next cleanup, after the chain
 *        empties), 464.2.c (Attacker = the player whose units arrived), 316.8.b, 820 (Repeat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_PORTAL = "sfd-078-221";
const CHARM = "ogn-043-298";

/**
 * P1's turn. P1 controls bfA (GuardA 2) and bfB (GuardB 2); P2 controls bfC. P2 has Foe1 (3, ready) and
 * Foe2 (3, EXHAUSTED) in base. P1: Temporal Portal (ready) on board, Charm in hand, [2] + 3 calm =
 * Portal's [rainbow] + Charm [1][calm] + one Repeat [1][calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 3 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .battlefield("bfC", { controller: P2 })
    .unit(P1, "bfA", { might: 2, name: "GuardA" }, "guardA")
    .unit(P1, "bfB", { might: 2, name: "GuardB" }, "guardB")
    .unit(P2, "base", { might: 3, name: "Foe One" }, "foe1")
    .unit(P2, "base", { might: 3, name: "Foe Two" }, "foe2", { exhausted: true })
    .gear(P1, TEMPORAL_PORTAL, "portal")
    .hand(P1, CHARM, "charm");
}

/** Activate the Portal, then cast Charm with one Repeat on Foe1 then Foe2, sending them to destA / destB. Leaves Charm on the chain. */
async function portalCharm(destA: string, destB: string): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("portal");
  await game.settle();
  expect(game.state("portal").isExhausted).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 2 } });
  // The Portal granted Repeat: the cast now offers a repeat count and up to 2 targets.
  const fields = game.p1.option("cast", "charm")?.fields ?? [];
  expect(fields.find((f) => f.arg === "repeat")?.options).toEqual([1]);
  expect(fields.find((f) => f.arg === "targets")?.max).toBe(2);
  await game.p1.cast("charm", { repeat: 1, targets: ["foe1", "foe2"] });
  // Repeat cost = Charm's own cost again → everything spent.
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  // Destinations are chosen by P1 (the mover) — surfaced as picks.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  await game.p1.pick(`battlefield-${destA}`);
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  await game.p1.pick(`battlefield-${destB}`);
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
  return game;
}

describe("Ruling 0a72297be490291d — Charm ×2 via Temporal Portal: one showdown (same battlefield) vs two (different battlefields)", () => {
  test("while the repeated Charm is still on the chain nothing has moved and no showdown has begun", async () => {
    const game = await portalCharm("bfA", "bfA");
    expect(game.zoneOf("foe1")).toBe("base");
    expect(game.zoneOf("foe2")).toBe("base");
    expect(game.gameState.battlefields.bfA?.contested).toBe(false);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("1) both to the SAME battlefield: after Charm fully resolves ONE combat showdown opens at bfA with BOTH Foes as Attackers and my Guard as Defender; P2 (attacker) gets Focus first", async () => {
    const game = await portalCharm("bfA", "bfA");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Charm (both executions) resolves, then cleanup opens the showdown
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.zoneOf("foe1")).toBe("battlefield-bfA");
    expect(game.zoneOf("foe2")).toBe("battlefield-bfA");
    expect(game.gameState.battlefields.bfA?.contested).toBe(true);
    const stack = game.gameState.interaction?.showdownStack ?? [];
    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({ active: true, battlefieldId: "bfA", isCombatShowdown: true });
    expect(game.state("foe1").combatRole).toBe("attacker");
    expect(game.state("foe2").combatRole).toBe("attacker");
    expect(game.state("guardA").combatRole).toBe("defender");
    // State is retained: Foe2 is still exhausted inside the showdown.
    expect(game.state("foe2").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    // bfB is untouched.
    expect(game.gameState.battlefields.bfB?.contested).toBe(false);
  });

  test("1) that single combat resolves as one: both Foes (3+3) hit GuardA together", async () => {
    const game = await portalCharm("bfA", "bfA");
    await game.settle();
    expect(game.zoneOf("guardA")).toBe("trash");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P2);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("2) to two DIFFERENT battlefields: both become Contested, but only ONE showdown is open at a time — first bfA (Foe1 attacker), bfB waits (Foe2 has no designation yet)", async () => {
    const game = await portalCharm("bfA", "bfB");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("foe1")).toBe("battlefield-bfA");
    expect(game.zoneOf("foe2")).toBe("battlefield-bfB");
    expect(game.gameState.battlefields.bfA?.contested).toBe(true);
    expect(game.gameState.battlefields.bfB?.contested).toBe(true);
    const stack = (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({ battlefieldId: "bfA", isCombatShowdown: true });
    expect(game.state("foe1").combatRole).toBe("attacker");
    expect(game.state("guardA").combatRole).toBe("defender");
    expect(game.state("foe2").combatRole).toBeNull();
    expect(game.state("guardB").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("2) after the first showdown fully resolves, the SECOND one opens at bfB (Foe2 attacker, still exhausted; GuardB defender), then the turn returns to my Main Phase", async () => {
    const game = await portalCharm("bfA", "bfB");
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Showdown 1 at bfA: both pass focus → combat: Foe1 (3) kills GuardA (2).
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.zoneOf("guardA")).toBe("trash");
    expect(game.gameState.battlefields.bfA?.contested).toBe(false);
    // Now showdown 2 at bfB is the open one.
    const stack = (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({ battlefieldId: "bfB", isCombatShowdown: true });
    expect(game.state("foe2").combatRole).toBe("attacker");
    expect(game.state("foe2").isExhausted).toBe(true);
    expect(game.state("guardB").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.settle();
    expect(game.zoneOf("guardB")).toBe("trash");
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("timing: Charm has no Action/Reaction keyword — it cannot be played during a showdown (a second Charm in hand is not castable while the bfA showdown is open)", async () => {
    const game = await board().hand(P1, CHARM, "charm2").resources(P1, { energy: 3, power: { calm: 4 } }).build();
    await game.p1.activate("portal");
    await game.settle();
    await game.p1.cast("charm", { repeat: 1, targets: ["foe1", "foe2"] });
    await game.p1.pick("battlefield-bfA");
    await game.p1.pick("battlefield-bfA");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } }); // could afford it
    expect(game.p1.can("cast", "charm2")).toBe(false);
  });
});

/**
 * Ruling 07a6ead6a9734548 — Back Off (UNL-042 → unl-042-219) · Calm · [3] · [Hidden] [Action]
 *     "[Stun] a unit. If you played this from your hand, draw 1."
 *
 * Q: Can I play a HIDDEN Back Off into a different battlefield (stun a unit somewhere else)?
 * A: No. A hidden spell's targets must be chosen from that battlefield; Back Off has no restriction that makes this impossible, so
 *    the stunned unit must be at the battlefield where Back Off was hidden.
 * Rules: 811.1.d.2 (targets of a card played from Hidden are limited to that battlefield), 423 (Stun).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BACK_OFF = "unl-042-219";

/**
 * Turn 3, P2's turn. P1 holds bf1 with a Guard (3) and hid Back Off there earlier. P2 holds bf2 with a Far unit (2), keeps a
 * Homebody (2) in base and attacks bf1 with a Raider (4). P1 also has an Idler in base.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 1, name: "Idler" }, "idler")
    .facedown(P1, "bf1", BACK_OFF, "backoff")
    .unit(P2, "bf2", { might: 2, name: "Far" }, "far")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

/** Raider attacks bf1; P2 passes Focus; P1 flips the hidden Back Off → its target prompt. */
async function flipBackOff(game: Game): Promise<PickDecision> {
  await game.p2.move("raider", "bf1");
  for (let i = 0; i < 4 && game.actingSeat() !== P1; i++) {
    await game.acting().pass();
  }
  expect(game.p1.can("reveal", "backoff")).toBe(true);
  const hand0 = game.p1.hand().length;
  await game.p1.reveal("backoff");
  expect(game.p1.hand()).toHaveLength(hand0); // (not from hand — relevant for the "draw 1" rider later)
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d as PickDecision;
}

describe("Ruling 07a6ead6a9734548 — a hidden Back Off can only stun a unit at the battlefield it was hidden at", () => {
  test("the target menu offers exactly the units AT bf1 (Guard, Raider) — not Far at bf2, not either base unit", async () => {
    const game = await board().build();
    const d = await flipBackOff(game);
    const offered = d.options.map((o) => (o.card ?? o.key) as string).toSorted();
    expect(offered).toEqual(["guard", "raider"]);
    expect(offered).not.toContain("far");
    expect(offered).not.toContain("home");
    expect(offered).not.toContain("idler");
  });

  test("naming a unit at another battlefield (Far) or in a base is simply not a legal answer", async () => {
    const game = await board().build();
    await flipBackOff(game);
    expect((await game.p1.try((p) => p.pick("far"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.pick("home"))).ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // still waiting for a legal target
    expect(game.state("far").isStunned).toBe(false);
  });

  test("picking the Raider (here) works: Back Off resolves for [0], the Raider is stunned, and — played from Hidden, not hand — P1 draws nothing", async () => {
    const game = await board().build();
    await flipBackOff(game);
    const hand0 = game.p1.hand().length;
    await game.p1.pick("raider");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "backoff", controller: P1, targets: ["raider"] })]);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("backoff")).toBe("trash");
    expect(game.state("raider").isStunned).toBe(true);
    expect(game.state("far").isStunned).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    // The stunned Raider deals no combat damage: Guard survives and P1 keeps bf1.
    await game.settle();
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control: the same Back Off cast from HAND (P1's own turn) may stun a unit anywhere — Far at bf2 included — and draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P2, "bf2", { might: 2, name: "Far" }, "far")
      .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
      .hand(P1, BACK_OFF, "backoff")
      .build();
    const offered = (game.p1.option("cast", "backoff")?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];
    expect(offered.toSorted()).toEqual(["far", "guard", "home"]);
    const hand0 = game.p1.hand().length;
    await game.p1.cast("backoff", { targets: "far" });
    await game.settle();
    expect(game.state("far").isStunned).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
  });
});

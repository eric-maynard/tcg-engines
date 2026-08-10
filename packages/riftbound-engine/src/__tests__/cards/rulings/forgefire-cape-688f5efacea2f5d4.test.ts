/**
 * Ruling 688f5efacea2f5d4 — Forgefire Cape (SFD-190 → sfd-190-221) · Equipment · Calm/Mind · [4]+2 · +3 Might
 *     "[Unique] [Equip] [rainbow] — When I attack or defend, deal 2 to all enemy units here."
 *
 * Q: When I use Forgefire Cape, do I use the ability every turn?
 * A: No — it has no activated ability to "use". Its effect is a TRIGGERED ability that fires automatically whenever the
 *    equipped unit attacks or defends.
 * Rules: 150.2 / 718.3 (an Equipment's effect text is conferred to the equipped unit), 383 (triggered abilities fire on their
 *        condition, no activation), 375–377 (activated abilities need a "cost:" — the Cape's only one is [Equip]).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FORGEFIRE_CAPE = "sfd-190-221";

/** P1's turn. Ally (2) in base WEARING the Cape (→ 5); P2 holds bf1 with Picket (2) and Wall (9). */
function attackBoard() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 2, mind: 2 } }) // plenty — to prove no activation is even offered
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Picket" }, "picket")
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally", { equippedWith: ["cape"] })
    .card("cape", { def: FORGEFIRE_CAPE, meta: { attachedTo: "ally" }, owner: P1, zone: "base" });
}

/** P2's turn. P1 holds bf1 with the caped Ally (5); P2's Raider (2) and Brute (4) attack together. */
function defendBoard() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally", { equippedWith: ["cape"] })
    .card("cape", { def: FORGEFIRE_CAPE, meta: { attachedTo: "ally" }, owner: P1, zone: "bf1" })
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 4, name: "Brute" }, "brute");
}

describe("Ruling 688f5efacea2f5d4 — Forgefire Cape's damage is a trigger on attack/defend, not something you activate", () => {
  test("nothing to 'use': with the Cape attached (Ally 2 + 3 = 5) and a full pool, no activated ability is offered on the Cape or its wearer in the open main phase", async () => {
    const game = await attackBoard().build();
    expect(game.state("ally")).toMatchObject({ attachments: ["cape"], might: 5 });
    expect(game.p1.can("activate", "cape")).toBe(false);
    expect(game.p1.can("activate", "ally")).toBe(false);
    expect(game.p1.legal().filter((o) => o.verb === "activate")).toEqual([]);
    expect((await game.p1.try((p) => p.activate("cape"))).ok).toBe(false);
  });

  test("ATTACK: moving the wearer into bf1 automatically puts the triggered ability on the chain (source = the wearer, triggered: true) and it deals 2 to every enemy there — Picket dies, Wall takes 2 — before combat", async () => {
    const game = await attackBoard().build();
    await game.p1.move("ally", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ally", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("picket")).toBe("trash");
    expect(game.state("wall").damage).toBe(2);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1"); // 2 + 5 < 9
  });

  test("DEFEND: when P2 attacks the caped Ally, the same trigger fires on its own for the defender — 2 to each attacker here (Raider 2 dies at once, Brute takes 2), then combat", async () => {
    const game = await defendBoard().build();
    await game.p2.move(["raider", "brute"], "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ally", controller: P1, triggered: true })]);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("brute")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    await game.settle(); // Brute (4) vs Ally (5): Brute 2+5 ≥ 4 dies; Ally takes 4 < 5 survives
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("it fires EVERY time the condition happens, with no per-turn 'use' by P1: defended once this turn (Raider alone), and again on P2's NEXT turn (Brute) — a fresh trigger each time", async () => {
    const game = await defendBoard().build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ally", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    await game.advanceTurn(); // → P1
    await game.advanceTurn(); // → P2 again
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("brute").isReady).toBe(true);
    await game.p2.move("brute", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ally", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
  });
});

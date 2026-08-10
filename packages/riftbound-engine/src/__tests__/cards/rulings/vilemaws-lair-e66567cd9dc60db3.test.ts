/**
 * Ruling e66567cd9dc60db3 — Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   × The Syren (OGN-184 → ogn-184-298) · Gear · "[1], [Exhaust]: Move a friendly unit at a battlefield to its base."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) — "…recall it" (a recall, not a move).  (Vilemaw unl-060-219 is listed only by name.)
 *
 * Q: My battlefield is Vilemaw's Lair; my opponent uses The Syren on their unit there. Does the battlefield override the gear?
 * A: Yes. "Can't beats can": the Syren's activation resolves but its Move instruction fails — the unit stays at the Lair. The Lair
 *    blocks MOVES to base only; RECALLS (Zhonya's, combat recall) are not moves and still work.
 * Rules: 105 (can't beats can), 446 (Move) vs recall, 359.3.e.6 (impossible instruction ignored, ability still resolves).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VILEMAWS_LAIR = "ogn-295-298";
const THE_SYREN = "ogn-184-298";
const ZHONYAS = "ogn-077-298";

const BOLT = { abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Test Bolt", timing: "action" };

/**
 * P2's turn. "lair" is P1's Vilemaw's Lair (live text) but currently CONTROLLED by P2, whose 3-Might Spider sits on it.
 * P2 has The Syren in base and [2]. bf2 is a plain battlefield of P1's (Holder).
 */
function board(lairDef: { def?: string; inert?: boolean }) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("lair", { controller: P2, ...lairDef })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "lair", { might: 3, name: "Spider" }, "spider")
    .gear(P2, THE_SYREN, "syren");
}

describe("Ruling e66567cd9dc60db3 — Vilemaw's Lair stops The Syren's move to base", () => {
  test("control (plain battlefield): The Syren works — [1] paid, Syren exhausted, the Spider is moved to P2's base", async () => {
    const game = await board({ inert: true }).build();
    expect(game.p2.can("activate", "syren")).toBe(true);
    await game.p2.activate("syren", 0, { targets: "spider" });
    await game.settle();
    expect(game.state("syren").isExhausted).toBe(true);
    expect(game.p2.energy()).toBe(1);
    expect(game.locationOf("spider")).toBe("base");
  });

  test("at Vilemaw's Lair: the Syren can still be activated on the Spider (cost paid, ability goes on the chain and resolves) but the move FAILS — the Spider stays at the Lair, nothing counted as moved", async () => {
    const game = await board({ def: VILEMAWS_LAIR, inert: false }).build();
    expect(game.state("spider").keywords).toContain("NoMoveToBase"); // the Lair's restriction is live on units there
    expect(game.p2.can("activate", "syren")).toBe(true);
    await game.p2.activate("syren", 0, { targets: "spider" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "syren", controller: P2 })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("syren").isExhausted).toBe(true);
    expect(game.p2.energy()).toBe(1); // no refund — the ability resolved, its instruction was just impossible
    expect(game.locationOf("spider")).toBe("lair");
    expect(game.gameState.unitsMovedThisTurn?.[P2] ?? 0).toBe(0);
    expect(game.gameState.battlefields.lair?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("recall is not a move: a Zhonya's Hourglass save RECALLS the dying Spider from the Lair to base despite the restriction", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: false })
      .unit(P2, "lair", { might: 3, name: "Spider" }, "spider")
      .gear(P2, ZHONYAS, "zhonyas")
      .hand(P1, BOLT, "bolt")
      .build();
    expect(game.state("spider").keywords).toContain("NoMoveToBase");
    await game.p1.cast("bolt", { targets: "spider" });
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.state("spider")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});

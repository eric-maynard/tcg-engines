/**
 * Seal of Rage — ogn-040-298 · Gear · Fury · 0 energy + 1 [fury]
 *
 *   [Exhaust]: [Reaction] — [Add] [fury].
 *   (Abilities that add resources can't be reacted to.)
 *
 * Rules: 429.2 (Add abilities resolve as soon as they are finalized — they do
 * not wait on the chain), 813.1.c.2 (Reaction abilities may be activated in
 * Closed states on any player's turn).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-040-298";
const CLEAVE = "ogn-004-298"; // [Action] spell (1 energy) the opponent casts to open a chain

describe("Seal of Rage (ogn-040-298)", () => {
  test("costs 0 energy + 1 fury power to play; lands in base as gear", async () => {
    const game = await scenario().resources(P1, { energy: 0, power: { fury: 1 } }).hand(P1, CARD, "seal").build();
    await game.p1.play("seal");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.gear()).toContain("seal");
    const noPower = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "seal").build();
    expect(noPower.p1.can("play", "seal")).toBe(false);
  });

  test("[Exhaust]: adds 1 fury power immediately, exhausts the Seal, and never sits on the chain (rule 429.2)", async () => {
    const game = await scenario().gear(P1, CARD, "seal").build();
    expect(game.p1.power("fury")).toBe(0);
    await game.p1.activate("seal");
    expect(game.p1.power("fury")).toBe(1);
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()?.kind).toBe("action");
  });

  test("cannot be activated while exhausted", async () => {
    const game = await scenario().gear(P1, CARD, "seal", { exhausted: true }).build();
    expect(game.p1.can("activate", "seal")).toBe(false);
    const r = await game.p1.try((p) => p.activate("seal"));
    expect(r.ok).toBe(false);
    expect(game.p1.power("fury")).toBe(0);
  });

  test("[Reaction]: usable on the opponent's turn while their spell is on the chain; the spell stays pending", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P2, "base", { might: 2 }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .gear(P1, CARD, "seal")
      .build();
    await game.p2.cast("cleave", { targets: "theirs" });
    expect(game.chain()).toHaveLength(1);
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "seal")).toBe(true);
    await game.p1.activate("seal");
    expect(game.p1.power("fury")).toBe(1);
    expect(game.state("seal").isExhausted).toBe(true);
    // Add resolved at once; Cleave is still the only chain item.
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
  });
});

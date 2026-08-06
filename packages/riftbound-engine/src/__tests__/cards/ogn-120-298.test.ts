/**
 * Seal of Insight — ogn-120-298 · Gear · Mind · 0 energy + 1 [mind]
 *
 *   [Exhaust]: [Reaction] — [Add] [mind]. (Abilities that add resources can't
 *   be reacted to.)
 *
 * Rules: 429.2 (activated abilities that Add resources resolve as soon as they
 * are finalized — nothing lingers on the chain), 429.3 / Reaction (usable any
 * time, including the opponent's turn), Exhaust cost (once per ready cycle).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const SEAL = "ogn-120-298";

describe("Seal of Insight (ogn-120-298)", () => {
  test("cost: 0 energy + 1 mind to play; enters the base ready; unaffordable without the mind", async () => {
    const game = await scenario().resources(P1, { power: { mind: 1 } }).hand(P1, SEAL, "seal").build();
    await game.p1.play("seal");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.gear()).toContain("seal");
    expect(game.state("seal").isReady).toBe(true);
    const noMind = await scenario().resources(P1, { energy: 3 }).hand(P1, SEAL, "seal").build();
    expect(noMind.p1.can("playGear", "seal")).toBe(false);
  });

  test("[Exhaust]: Add [mind] — exhausts the Seal and adds 1 mind power immediately, with nothing on the chain", async () => {
    const game = await scenario().gear(P1, SEAL, "seal").build();
    expect(game.p1.power("mind")).toBe(0);
    await game.p1.activate("seal");
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    expect(game.chain()).toEqual([]); // can't be reacted to: never sits on the chain
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the Exhaust cost: cannot be activated again while exhausted; readies at your next turn", async () => {
    const game = await scenario().gear(P1, SEAL, "seal").build();
    await game.p1.activate("seal");
    expect(game.p1.can("activate", "seal")).toBe(false);
    const t = await game.p1.try((p) => p.activate("seal"));
    expect(t.ok).toBe(false);
    await game.advanceTurn(); // P2's turn — still exhausted
    expect(game.state("seal").isExhausted).toBe(true);
    await game.advanceTurn(); // P1's turn — readied in the Awaken step
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("seal").isReady).toBe(true);
    expect(game.p1.can("activate", "seal")).toBe(true);
  });

  test("Reaction: usable on the opponent's turn", async () => {
    const game = await scenario().active(P2).gear(P1, SEAL, "seal").build();
    expect(game.p1.can("activate", "seal")).toBe(true);
    await game.p1.activate("seal");
    expect(game.p1.power("mind")).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("the added [mind] pays for a mind card (Seal → play a second Seal for its [mind] cost)", async () => {
    const game = await scenario().gear(P1, SEAL, "seal").hand(P1, SEAL, "seal2").build();
    expect(game.p1.can("playGear", "seal2")).toBe(false);
    await game.p1.activate("seal");
    expect(game.p1.can("playGear", "seal2")).toBe(true);
    await game.p1.play("seal2");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("seal2")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});

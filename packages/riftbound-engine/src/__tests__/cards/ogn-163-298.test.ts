/**
 * Seal of Strength — ogn-163-298 · Gear · Body · 0 energy + 1 [body]
 *
 *   [Exhaust]: [Reaction] — [Add] [body]. (Abilities that add resources can't
 *   be reacted to.)
 *
 * Rules: 429.2 (abilities that Add resources resolve as soon as they are
 * finalized — nothing sits on the chain), Reaction timing (usable any time,
 * including the opponent's turn and while a chain is open), Exhaust cost
 * (once per ready cycle; readied in your Awaken step).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const SEAL = "ogn-163-298";
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

describe("Seal of Strength (ogn-163-298)", () => {
  test("cost: 0 energy + 1 body to play; lands in base ready; unaffordable without the body power", async () => {
    const game = await scenario().resources(P1, { power: { body: 1 } }).hand(P1, SEAL, "seal").build();
    await game.p1.play("seal");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.gear()).toContain("seal");
    expect(game.state("seal").isReady).toBe(true);
    const noBody = await scenario().resources(P1, { energy: 5 }).hand(P1, SEAL, "seal").build();
    expect(noBody.p1.can("playGear", "seal")).toBe(false);
  });

  test("[Exhaust]: Add [body] — exhausts the Seal and adds 1 body power at once, with nothing on the chain", async () => {
    const game = await scenario().gear(P1, SEAL, "seal").build();
    expect(game.p1.power("body")).toBe(0);
    await game.p1.activate("seal");
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1 } });
    expect(game.chain()).toEqual([]); // can't be reacted to: it never sits on the chain
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Exhaust cost: not usable again while exhausted; readies in your next Awaken step", async () => {
    const game = await scenario().gear(P1, SEAL, "seal").build();
    await game.p1.activate("seal");
    expect(game.p1.can("activate", "seal")).toBe(false);
    const again = await game.p1.try((p) => p.activate("seal"));
    expect(again.ok).toBe(false);
    await game.advanceTurn(); // P2's turn — still exhausted
    expect(game.state("seal").isExhausted).toBe(true);
    await game.advanceTurn(); // P1's turn — readied
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("seal").isReady).toBe(true);
    expect(game.p1.can("activate", "seal")).toBe(true);
  });

  test("Reaction: usable on the opponent's turn", async () => {
    const game = await scenario().active(P2).gear(P1, SEAL, "seal").build();
    expect(game.p1.can("activate", "seal")).toBe(true);
    await game.p1.activate("seal");
    expect(game.p1.power("body")).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("Reaction: usable while an opponent's spell is on the chain (P1 holds priority), and the spell still resolves", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .gear(P1, SEAL, "seal")
      .unit(P1, "base", { might: 3 }, "ally")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.chain()).toHaveLength(1);
    await game.p1.activate("seal");
    expect(game.p1.power("body")).toBe(1);
    expect(game.chain()).toHaveLength(1); // only the bolt — the Add ability never joined the chain
    await game.settle();
    expect(game.state("ally").damage).toBe(1);
  });

  test("the added [body] pays a body cost (Seal → play a second Seal for its [body])", async () => {
    const game = await scenario().gear(P1, SEAL, "seal").hand(P1, SEAL, "seal2").build();
    expect(game.p1.can("playGear", "seal2")).toBe(false);
    await game.p1.activate("seal");
    expect(game.p1.can("playGear", "seal2")).toBe(true);
    await game.p1.play("seal2");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("seal2")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});

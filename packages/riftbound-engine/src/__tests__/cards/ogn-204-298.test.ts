/**
 * Seal of Discord — ogn-204-298 · Gear · Chaos · 0 energy + 1 [chaos]
 *
 *   [Exhaust]: [Reaction] — [Add] [chaos].
 *   (Abilities that add resources can't be reacted to.)
 *
 * Rules: 429.2 / 429.2.a (Add abilities resolve as soon as they are finalized;
 * priority does not pass), 813.1.c.2 (Reaction abilities may be activated during
 * Closed states on any player's turn), 414.4 (an exhausted permanent can't pay [Exhaust]).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-204-298";
const CLEAVE = "ogn-004-298"; // 1-energy [Action] spell the opponent uses to open a chain

describe("Seal of Discord (ogn-204-298)", () => {
  test("costs 0 energy + 1 chaos to play; lands in base as gear; unaffordable without the chaos power", async () => {
    const game = await scenario().resources(P1, { energy: 0, power: { chaos: 1 } }).hand(P1, CARD, "seal").build();
    await game.p1.play("seal");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.gear()).toContain("seal");
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "seal").build();
    expect(noPower.p1.can("play", "seal")).toBe(false);
    const wrongDomain = await scenario().resources(P1, { power: { fury: 1 } }).hand(P1, CARD, "seal").build();
    expect(wrongDomain.p1.can("play", "seal")).toBe(false);
  });

  test("[Exhaust]: adds 1 chaos power immediately, exhausts the Seal, nothing goes on the chain (rule 429.2)", async () => {
    const game = await scenario().gear(P1, CARD, "seal").build();
    expect(game.p1.power("chaos")).toBe(0);
    await game.p1.activate("seal");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } });
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()?.kind).toBe("action");
  });

  test("cannot be activated while exhausted (rule 414.4)", async () => {
    const game = await scenario().gear(P1, CARD, "seal", { exhausted: true }).build();
    expect(game.p1.can("activate", "seal")).toBe(false);
    const r = await game.p1.try((p) => p.activate("seal"));
    expect(r.ok).toBe(false);
    expect(game.p1.power("chaos")).toBe(0);
  });

  test("readies at the start of your next turn and can be used again", async () => {
    const game = await scenario().gear(P1, CARD, "seal").build();
    await game.p1.activate("seal");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("seal").isExhausted).toBe(false);
    expect(game.p1.can("activate", "seal")).toBe(true);
  });

  test("the printed [Reaction] is on the ABILITY, so the gear itself can't be played during a Closed State (309.1.a / 813.1.c.2)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CLEAVE, "cleave")
      .hand(P1, CARD, "seal")
      .build();
    expect(game.p1.can("play", "seal")).toBe(true);
    await game.p1.cast("cleave", { targets: "ally" });
    // Chain open = Closed State: only cards with the Reaction keyword may be
    // played (309.1.a). Seal of Discord prints [Reaction] inside its activated
    // ability, which grants activation permission only (813.1.c.2).
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("play", "seal")).toBe(false);
  });

  test("[Reaction]: usable on the opponent's turn while their spell is on the chain; the spell stays pending (rule 813.1.c.2)", async () => {
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
    expect(game.p1.power("chaos")).toBe(1);
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
  });
});

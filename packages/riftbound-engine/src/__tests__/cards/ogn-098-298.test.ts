/**
 * Energy Conduit — ogn-098-298 · Gear · Mind · 3 energy
 *
 *   [Exhaust]: [Reaction] — [Add] [1]. (Abilities that add resources can't be reacted to.)
 *
 * Rule 400.2: an ability with [Add] resolves immediately when finalized (never
 * sits on the chain waiting for responses).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-098-298";
const HEXTECH_RAY = "ogn-009-298"; // [Action] Deal 3 to a unit at a battlefield (1 energy + 1 fury)
const EXHAUSTED = { __flags: { exhausted: true } } as const;

describe("Energy Conduit (ogn-098-298)", () => {
  test("costs 3 energy to play; enters the base", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "conduit").build();
    await game.p1.play("conduit");
    await game.settle();
    expect(game.zoneOf("conduit")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "conduit").build();
    expect(poor.p1.can("play", "conduit")).toBe(false);
  });

  test("[Exhaust]: adds 1 energy immediately (no chain, rule 400.2) and exhausts the Conduit", async () => {
    const game = await scenario().gear(P1, CARD, "conduit").build();
    expect(game.p1.energy()).toBe(0);
    await game.p1.activate("conduit");
    expect(game.chain()).toHaveLength(0);
    expect((game.decision() as ActionDecision).context).toBe("main");
    expect(game.p1.energy()).toBe(1);
    expect(game.state("conduit").isExhausted).toBe(true);
  });

  test("cannot be activated while exhausted; usable again on your next turn after it readies", async () => {
    const game = await scenario().gear(P1, CARD, "conduit", EXHAUSTED).build();
    expect(game.p1.can("activate", "conduit")).toBe(false);
    await game.advanceTurn();
    await game.advanceTurn(); // back to P1: permanents readied in the Awaken step
    expect(game.state("conduit").isReady).toBe(true);
    const before = game.p1.energy();
    await game.p1.activate("conduit");
    expect(game.p1.energy()).toBe(before + 1);
  });

  test("[Reaction] timing: usable on the opponent's turn (in a Closed State — rule 316.5.b / 813.1.c)", async () => {
    const game = await scenario().active(P2).gear(P1, CARD, "conduit").hand(P2, { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 0, name: "Slow Draw", timing: "action" }, "theirs").build();
    expect(game.p1.can("activate", "conduit")).toBe(false); // opponent's Neutral Open State
    await game.p2.cast("theirs");
    await game.p2.passPriority();
    expect(game.p1.can("activate", "conduit")).toBe(true);
    await game.p1.activate("conduit");
    expect(game.p1.energy()).toBe(1);
    expect(game.state("conduit").isExhausted).toBe(true);
  });

  test("[Reaction] timing: usable with priority while a spell is on the chain, which stays pending", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4 }, "ally")
      .gear(P1, CARD, "conduit")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    await game.p2.cast("ray", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "conduit")).toBe(true);
    await game.p1.activate("conduit");
    expect(game.p1.energy()).toBe(1);
    // The Add resolved at once; Hextech Ray is still the only chain item.
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
    await game.settle();
    expect(game.state("ally").damage).toBe(3);
  });
});

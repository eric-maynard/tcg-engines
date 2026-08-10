/**
 * Ruling 10162fa305702ee3 — Shadow (UNL-194 → unl-194-219) · Unit · Calm/Chaos · [3] · 3 Might
 *     "If you play me to a battlefield, I enter ready. [Action] — [1][rainbow], [Exhaust]: [Stun] an enemy unit attacking here."
 *
 * Q: Can Shadow use its ability at any time, or only at the start of combat?
 * A: It is an [Action] ability: usable in your Main Phase (Open State) and during SHOWDOWNS on any player's turn — whenever
 *    you have Focus and no chain exists; not restricted to the start of combat. It can't be used in response to a chain
 *    (that needs [Reaction]); once that chain resolves and the state is Open again, you may activate it with your Focus.
 * Rules: 806.1.c.2 ([Action] on abilities ⇒ showdowns on any turn), 145.2 / 381 (activation timing), 347 (Focus),
 *        309–310 (Open/Closed states), 423 (Stun: no combat damage this turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHADOW = "unl-194-219";

/** P2's Action-speed trick (inline): +1 Might this turn — opens a chain during the showdown. */
const RALLY = {
  abilities: [{ effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Rally",
  timing: "action",
} as const;

/** P2's turn 3. P1 (1 energy + 1 chaos) holds bf1 with a READY Shadow (3) + Anchor (4); P2: Raider (3) in base, Rally in hand. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 1, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SHADOW, "shadow")
    .unit(P1, "bf1", { might: 4, name: "Anchor" }, "anchor")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, RALLY, "rally");
}

/** Raider attacks bf1; the showdown opens with the attacker (P2) holding Focus. */
async function raiderAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.state("raider").combatRole).toBe("attacker");
  return game;
}

describe("Ruling 10162fa305702ee3 — Shadow's [Action] ability: any time you have Focus in an Open showdown state, not just at combat start; never onto a live chain", () => {
  test("not while the opponent holds Focus: as the showdown opens P2 (attacker) has Focus and P1 cannot activate", async () => {
    const game = await raiderAttacks();
    expect(game.p1.can("activate", "shadow")).toBe(false);
  });

  test("not in response to a chain: P2 uses its Focus to cast Rally → P1 receives PRIORITY (Closed State) but Shadow's ability is not offered — it has no [Reaction]", async () => {
    const game = await raiderAttacks();
    await game.p2.cast("rally", { targets: "raider" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "shadow")).toBe(false);
    const r = await game.p1.try((p) => p.activate("shadow"));
    expect(r.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 1 } });
  });

  test("LATER in the same showdown — after that chain resolved (Raider now 4) and Focus has come to P1 with the state Open — the ability IS available: pay [1]+chaos, exhaust Shadow, stun the attacking Raider", async () => {
    const game = await raiderAttacks();
    await game.p2.cast("rally", { targets: "raider" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Rally resolves; the showdown continues (well past its start)
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").might).toBe(4);
    // Focus moves on to P1 (an Open showdown state again).
    for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
      await game.acting().passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "shadow")).toBe(true);
    expect(game.p1.option("activate", "shadow")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["raider"]]);
    await game.p1.activate("shadow");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.state("shadow").isExhausted).toBe(true); // exhausting is a cost; a stunned/exhausted state doesn't stop paying it
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shadow", controller: P1, triggered: false })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raider").isStunned).toBe(true);
    await game.settle();
    // Stunned Raider deals no combat damage; it takes 3 + 4 and dies; P1 holds.
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("shadow")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("outside any showdown (P1's own open Main Phase) nothing is 'attacking here', so there is no legal target and the ability is simply not available — the timing permission alone doesn't conjure a target", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SHADOW, "shadow")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "shadow")).toBe(false);
  });
});

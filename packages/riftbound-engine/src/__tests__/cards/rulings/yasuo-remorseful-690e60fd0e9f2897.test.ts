/**
 * Ruling 690e60fd0e9f2897 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Unit · Calm · [6] · 6 Might
 *   "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · Reaction · Mind · [2][mind] — "Give a unit −4 [Might] this turn, min 1."
 *
 * Q: When Yasuo attacks and his trigger goes off, can you react with Smoke Screen to reduce his Might, and does that
 *    reduce the ability's damage?
 * A: Yes and yes. The "when I attack" ability goes on the chain and can be reacted to; it reads Yasuo's CURRENT Might
 *    on resolution, so after Smoke Screen (6 → 2) it deals 2, not 6. (A local ruling of "printed damage regardless"
 *    was wrong.)
 * Rules: triggered abilities are chain items with a reaction window; 340 (LIFO); variable values read at resolution.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const SMOKE_SCREEN = "ogn-093-298";

/** P1's turn. P2 holds bf1 with a 5-Might Guard (6 would kill it, 2 would not). Yasuo ready in P1's base. P2: Smoke Screen + [2][mind]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P2, SMOKE_SCREEN, "smoke")
    .resources(P2, { energy: 2, power: { mind: 1 } });
}

/** Yasuo attacks bf1; answer his target prompt (Guard) if asked; leave P2 holding priority with the trigger on the chain. */
async function yasuoAttacksP2ToRespond(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  for (let i = 0; i < 6; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick("guard");
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.state("yasuo").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["guard"], triggered: true })]);
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 690e60fd0e9f2897 — Smoke Screen in response to Yasuo's attack trigger shrinks the damage it deals", () => {
  test("the 'when I attack' ability is a chain item with a reaction window: P2 CAN cast Smoke Screen on Yasuo in response", async () => {
    const game = await yasuoAttacksP2ToRespond();
    expect(game.state("guard").damage).toBe(0); // nothing dealt on trigger
    expect(game.p2.can("cast", "smoke")).toBe(true);
    await game.p2.cast("smoke", { targets: "yasuo" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "smoke"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });

  test("Smoke Screen resolves first: Yasuo is 2 Might while his trigger is still pending", async () => {
    const game = await yasuoAttacksP2ToRespond();
    await game.p2.cast("smoke", { targets: "yasuo" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.state("yasuo").might).toBe(2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", triggered: true })]);
    expect(game.state("guard").damage).toBe(0);
  });

  test("the trigger then deals Yasuo's CURRENT Might — 2, not the printed 6: Guard (5) takes 2 and survives", async () => {
    const game = await yasuoAttacksP2ToRespond();
    await game.p2.cast("smoke", { targets: "yasuo" });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(2);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — unanswered, the trigger deals the full 6 and kills the Guard", async () => {
    const game = await yasuoAttacksP2ToRespond();
    await game.p2.passPriority();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("guard")).toBe("trash");
  });
});

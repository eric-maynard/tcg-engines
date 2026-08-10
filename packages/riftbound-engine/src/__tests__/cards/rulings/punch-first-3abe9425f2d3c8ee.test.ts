/**
 * Ruling 3abe9425f2d3c8ee — Punch First (SFD-097 → sfd-097-221) · Action spell · Body · [1]+[body][body]
 *     "Give a unit +5 [Might] this turn."
 *   × Vex, Cheerless (SFD-146 → sfd-146-221) · 5 Might · "While I'm in combat, friendly spells cost [1][rainbow] less to a
 *     minimum of [1], and enemy spells cost [1][rainbow] more."
 *   × Yordle Explorer (SFD-100 → sfd-100-221) · "When you play a card with Power cost [rainbow][rainbow] or more, draw 1."
 *
 * Q: If I play Punch First while Vex is in combat (so it costs 1 Power instead of 2), does Yordle Explorer draw?
 * A: Yes. Cost-checking triggers look at the PRINTED cost, not what was actually paid. Punch First's printed Power
 *    cost is 2, so Yordle Explorer triggers even though only 1 Power was paid.
 * Rules: 206.1 (Power cost = printed cost), 357 (cost modifications change what is paid, not the card's cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PUNCH_FIRST = "sfd-097-221";
const VEX_CHEERLESS = "sfd-146-221";
const YORDLE_EXPLORER = "sfd-100-221";

/**
 * P1's turn with EXACTLY [1] + 1 body — one Power short of Punch First's printed cost. P1: Vex + Yordle Explorer in
 * base, Punch First in hand. P2 holds bf1 with a 9-Might Wall (so the combat itself is uneventful).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", VEX_CHEERLESS, "vex")
    .unit(P1, "base", YORDLE_EXPLORER, "yordle")
    .hand(P1, PUNCH_FIRST, "punch");
}

/** Vex attacks bf1 → combat showdown with Vex "in combat"; P1 holds Focus. */
async function vexInCombat(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("vex", "bf1");
  expect(game.state("vex").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 3abe9425f2d3c8ee — Yordle Explorer checks Punch First's PRINTED Power cost (2), not the Vex-discounted 1", () => {
  test("premise: outside combat Punch First is unaffordable with [1] + 1 body (printed [1]+[body][body])", async () => {
    const game = await board().build();
    expect(game.state("vex").combatRole).toBeNull();
    expect(game.p1.can("cast", "punch")).toBe(false);
  });

  test("with Vex in combat the discount applies: Punch First is castable and costs exactly [1] + ONE body", async () => {
    const game = await vexInCombat();
    expect(game.p1.can("cast", "punch")).toBe(true);
    await game.p1.cast("punch", { targets: "vex" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain().some((c) => c.cardId === "punch")).toBe(true);
  });

  test("Yordle Explorer still triggers off the printed 2-Power cost: its draw trigger appears and P1 nets a card (−Punch First, +1 draw); Vex gets +5", async () => {
    const game = await vexInCombat();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("punch", { targets: "vex" });
    let sawYordleTrigger = game.chain().some((c) => c.cardId === "yordle" && c.triggered);
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || d.kind !== "action" || d.context !== "chain") {
        break;
      }
      await game.seat(d.seat).passPriority();
      sawYordleTrigger ||= game.chain().some((c) => c.cardId === "yordle" && c.triggered);
    }
    expect(sawYordleTrigger).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("punch")).toBe("trash");
    expect(game.state("vex").might).toBe(10);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.violations()).toEqual([]);
  });
});

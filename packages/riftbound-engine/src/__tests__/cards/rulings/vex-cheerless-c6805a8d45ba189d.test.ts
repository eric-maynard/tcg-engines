/**
 * Ruling c6805a8d45ba189d — Vex, Cheerless (sfd-146-221) × Find Your Center (ogn-047-298)
 *   Vex — Champion Unit · Chaos · 5 Might: "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum
 *   of [1], and enemy spells cost [1][rainbow] more."
 *   Find Your Center — [Action] · [3]: "If an opponent's score is within 3 points of the Victory Score, this costs
 *   [2] less. Draw 1 and channel 1 rune exhausted."
 *
 * Q: My Vex is in combat and my opponent is at 6 points — can I play Find Your Center for free?
 * A: Yes. Both discounts apply to the total cost and may be ordered freely: [3] → Vex −[1] → [2] → FYC −[2] → [0].
 *    Only for YOUR Vex; an opponent's Vex in combat would instead make it cost more.
 * Rules: 356.3 / 356.4 (total-cost determination, controller orders reductions), 464 (in combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "sfd-146-221";
const FIND_YOUR_CENTER = "ogn-047-298";

/** P1's turn, Victory Score 8, P2 at 6 points. P2 holds bf1 with a stunned blocker; P1's Vex ready in base; FYC in hand. */
function friendlyVexBoard(p1: { energy: number; power?: Record<string, number> }) {
  return scenario()
    .victoryScore(8)
    .points(P2, 6)
    .resources(P1, p1)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Blocker" }, "blocker", { stunned: true })
    .unit(P1, "base", VEX, "vex")
    .hand(P1, FIND_YOUR_CENTER, "fyc");
}

/** Move `attacker` into bf1, drain any initial chain, stop with the showdown open and P1 holding Focus. */
async function attack(game: Game, attacker: string): Promise<void> {
  await game.p1.move(attacker, "bf1");
  expect(game.state(attacker).combatRole).toBe("attacker");
  for (let i = 0; i < 6 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
    await game.acting().passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

describe("Ruling c6805a8d45ba189d — Vex's −[1] and Find Your Center's own −[2] stack to a free spell", () => {
  test("premise: opponent at 6 of 8 but Vex NOT in combat → Find Your Center costs [3]−[2] = [1] (0 energy can't cast it, 1 energy is drained)", async () => {
    const none = await friendlyVexBoard({ energy: 0 }).build();
    expect(none.state("vex").combatRole).toBeNull();
    expect(none.p1.can("cast", "fyc")).toBe(false);
    const one = await friendlyVexBoard({ energy: 1 }).build();
    expect(one.p1.can("cast", "fyc")).toBe(true);
    await one.p1.cast("fyc");
    expect(one.p1.energy()).toBe(0);
  });

  test("Vex in combat + opponent within 3 of the Victory Score: P1 casts Find Your Center with 0 energy and 0 power — it resolves (draw 1, channel 1 exhausted rune)", async () => {
    const game = await friendlyVexBoard({ energy: 0 }).build();
    await attack(game, "vex");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.can("cast", "fyc")).toBe(true);
    const handBefore = game.p1.hand().length;
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("fyc");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // paid nothing
    expect(game.chain().map((c) => c.cardId)).toEqual(["fyc"]);
    await game.settle(); // both pass → FYC resolves (then the showdown/combat closes)
    expect(game.zoneOf("fyc")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1); // −FYC, +1 drawn
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1); // channeled exhausted
  });

  test("contrast — the OPPONENT's Vex in combat surcharges instead: [3]−[2]+[1] = [2] plus 1 power; 2E/1R is drained exactly, 2E/0R can't cast it", async () => {
    const enemyVexBoard = (p1: { energy: number; power?: Record<string, number> }) =>
      scenario()
        .victoryScore(8)
        .points(P2, 6)
        .resources(P1, p1)
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", VEX, "vex", { stunned: true })
        .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
        .hand(P1, FIND_YOUR_CENTER, "fyc");
    const game = await enemyVexBoard({ energy: 2, power: { rainbow: 1 } }).build();
    await attack(game, "scout");
    expect(game.state("vex").combatRole).toBe("defender");
    expect(game.p1.can("cast", "fyc")).toBe(true);
    await game.p1.cast("fyc");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    const short = await enemyVexBoard({ energy: 2 }).build();
    await attack(short, "scout");
    expect(short.p1.can("cast", "fyc")).toBe(false);
  });
});

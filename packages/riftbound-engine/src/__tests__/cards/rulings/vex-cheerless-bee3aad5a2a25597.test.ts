/**
 * Ruling bee3aad5a2a25597 — Vex, Cheerless (SFD-146 → sfd-146-221) × Frigid Touch (SFD-066 → sfd-066-221)
 *   Vex (5, [5][chaos]): "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and enemy spells cost
 *   [1][rainbow] more."   Frigid Touch ([2], Reaction, [Repeat][2]): "Give a unit -2 [Might] this turn."
 *   Deflect: opponents must pay [rainbow] to choose the unit with a spell or ability.
 *
 * Q: Vex is in combat vs a unit with Deflect; I Frigid Touch the Deflect unit — what is the total cost?
 * A: [1]. Base [2] + Deflect's mandatory additional [rainbow] = [2]+1 power; then Vex's discount −[1] −[rainbow] applied to the TOTAL
 *    → [1] + 0 power (the [1] minimum is met). Nuance: paying Repeat and choosing the same Deflect unit again adds [2] and a second
 *    Deflect [rainbow] → ([4]+2) − ([1]+1) = [3] + 1 power.
 * Rules: 356.3 / 356.4 (additional costs first, then reductions on the total), 809.1.c (Deflect surcharge per choosing instance),
 *        735.1.c (Repeat re-chooses), 464 (in combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX_CHEERLESS = "sfd-146-221";
const FRIGID_TOUCH = "sfd-066-221";

/** P2 holds bf1 with a stunned 5-Might Deflect unit; Vex ready in P1's base; Frigid Touch in hand with the given pool. */
function board(p1: { energy: number; power?: Record<string, number> }) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { keywords: ["Deflect"], might: 5, name: "Deflector" }, "deflector", { stunned: true })
    .unit(P1, "base", VEX_CHEERLESS, "vex")
    .resources(P1, p1)
    .hand(P1, FRIGID_TOUCH, "ft");
}

/** Vex attacks bf1 → she is "in combat"; stop with the showdown open and P1 holding Focus. */
async function vexInCombat(game: Game): Promise<void> {
  await game.p1.move("vex", "bf1");
  expect(game.state("vex").combatRole).toBe("attacker");
  for (let i = 0; i < 6 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
    await game.acting().passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

describe("Ruling bee3aad5a2a25597 — Frigid Touch on a Deflect unit with Vex, Cheerless in combat costs exactly [1]", () => {
  test("premise: the target has Deflect and, with Vex NOT in combat, Frigid Touch on it costs the full [2] + 1 power (Deflect's [rainbow])", async () => {
    const game = await board({ energy: 2, power: { rainbow: 1 } }).build();
    expect(game.state("deflector").keywords).toContain("Deflect");
    expect(game.state("vex").combatRole).not.toBe("attacker");
    await game.p1.cast("ft", { targets: "deflector" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    // and [2] alone (no power for Deflect) is not enough
    const short = await board({ energy: 2 }).build();
    expect(short.p1.option("cast", "ft")?.fields.find((f) => f.name === "targets")?.options ?? []).not.toContainEqual(["deflector"]);
  });

  test("Vex in combat: ([2] + Deflect 1 power) − ([1] + 1 power) = [1] + 0 power — P1 casts it on the Deflector holding exactly 1 energy and NO power, and is drained to zero", async () => {
    const game = await board({ energy: 1 }).build();
    await vexInCombat(game);
    expect(game.p1.can("cast", "ft")).toBe(true);
    expect(game.p1.option("cast", "ft")?.fields.find((f) => f.name === "targets")?.options).toContainEqual(["deflector"]);
    await game.p1.cast("ft", { targets: "deflector" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ft", controller: P1, targets: ["deflector"] })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("deflector").might).toBe(3); // −2 this turn landed
  });

  test("the discount never overshoots: with a bigger pool (3 energy + 1 power) the same cast still takes exactly [1] and no power", async () => {
    const game = await board({ energy: 3, power: { rainbow: 1 } }).build();
    await vexInCombat(game);
    await game.p1.cast("ft", { targets: "deflector" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
  });

  test.failing("BUG: nuance — paying Repeat and choosing the same Deflect unit both times: ([2]+[2] + 2 power) − ([1] + 1 power) = [3] + 1 power, drained exactly; the unit gets −4", async () => {
    const game = await board({ energy: 3, power: { rainbow: 1 } }).build();
    await vexInCombat(game);
    await game.p1.cast("ft", { repeat: 1, targets: ["deflector", "deflector"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("deflector").might).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling ec32b55305c69d4f — Challenge (OGN-128 → ogn-128-298) · [Action] · Body · [2][body]
 *     "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *
 * Q: In a showdown, can my STUNNED 3-Might defender still deal its damage through Challenge to the
 *    6-Might attacker, so that my other 3-Might unit can finish it off in combat?
 * A: Yes. [Stun] only removes COMBAT damage; Challenge's exchange is effect damage. The stunned unit deals
 *    its 3 to the attacker (and takes 6, dying), and the surviving 3-Might unit then trades with it.
 * Rules: 703.1 (a stunned unit deals no combat damage), 417.6.b.3 / 465 (only damage dealt in the combat
 *        damage step is combat damage), 428 (lethal damage kills at the next cleanup).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";

/**
 * P2's turn. P1 holds bf1 with a STUNNED 3-Might Sentinel and a ready 3-Might Recruit.
 * P2's 6-Might Brute walks in; P1 holds Challenge with [2][body] to use during the showdown.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Sentinel" }, "sentinel", { stunned: true })
    .unit(P1, "bf1", { might: 3, name: "Recruit" }, "recruit")
    .unit(P2, "base", { might: 6, name: "Brute" }, "brute")
    .hand(P1, CHALLENGE, "challenge")
    .resources(P1, { energy: 2, power: { body: 1 } });
}

/** P2 attacks bf1 with the Brute; we stop inside the showdown. */
async function attack() {
  const game = await board().build();
  await game.p2.move("brute", "bf1");
  expect(game.state("brute").combatRole).toBe("attacker");
  expect(game.state("sentinel")).toMatchObject({ combatRole: "defender", isStunned: true });
  await game.p2.passFocus(); // the attacker has Focus first; the defender acts next
  return game;
}

describe("Ruling ec32b55305c69d4f — a stunned unit still deals damage through Challenge (it is not combat damage)", () => {
  test("Challenge is castable by the defender during the showdown and may name the stunned Sentinel", async () => {
    const game = await attack();
    expect(game.p1.can("cast", "challenge")).toBe(true);
    const targets = (game.p1.option("cast", "challenge")?.fields.find((f) => f.arg === "targets")?.options ?? []) as unknown[][];
    expect(targets.some((t) => t[0] === "sentinel" && t[1] === "brute")).toBe(true);
  });

  test("ruling: the exchange happens both ways — the stunned Sentinel marks 3 on the Brute and dies to its 6", async () => {
    const game = await attack();
    await game.p1.cast("challenge", { targets: ["sentinel", "brute"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("brute").damage).toBe(3); // the STUNNED unit dealt its Might
    expect(game.zoneOf("sentinel")).toBe("trash"); // 6 ≥ 3
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the damaged Brute then trades with the ready 3-Might Recruit in the combat that follows", async () => {
    const game = await attack();
    await game.p1.cast("challenge", { targets: ["sentinel", "brute"] });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash"); // 3 (Challenge) + 3 (Recruit's combat damage) ≥ 6
    expect(game.zoneOf("recruit")).toBe("trash"); // the Brute's 6 combat damage ≥ 3
    expect(game.violations()).toEqual([]);
  });

  test("control: without the Challenge the Brute survives the combat (3 < 6) — the stunned Sentinel contributes nothing in combat", async () => {
    const game = await attack();
    await game.settle();
    expect(game.zoneOf("brute")).not.toBe("trash");
    expect(game.state("brute").damage).toBe(0); // combat cleanup healed the 3 the Recruit dealt
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.zoneOf("sentinel")).toBe("trash"); // stunned: dealt nothing, still took 6
  });
});

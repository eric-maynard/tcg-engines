/**
 * Ruling 3e0d510660662f4f — Challenge (OGN-128 → ogn-128-298) × [Deflect]
 *   Challenge: "[Action] [2][body] — Choose a friendly unit and an enemy unit. They deal damage equal to
 *   their Mights to each other."   Pouty Poro (OGN-013 → ogn-013-298): 2 Might, "[Deflect]".
 *
 * Q: Do you have to pay the Deflect cost when challenging a unit?
 * A: Yes — challenging chooses the unit, and Deflect taxes every choice an opponent makes of that unit.
 * Rules: 809.1.c ("Spells and abilities an opponent controls that target me cost … more to play as an
 *        additional cost for each time they choose me"), 809.1.c.1 (the extra Power may be of any domain),
 *        809.1.d / 349 (a Mandatory Additional Cost on playing), 355.10.d.2 (choosing is choosing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const PORO = "ogn-013-298"; // 2 Might, [Deflect]

/** P1's turn: P1's 4-Might Mine in base; P2 has the Deflect Poro and a plain 2-Might unit. */
function board(rainbow: number) {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1, rainbow } })
    .unit(P1, "base", { might: 4, name: "Mine" }, "mine")
    .unit(P2, "base", PORO, "poro")
    .unit(P2, "base", { might: 2, name: "Plain" }, "plain")
    .hand(P1, CHALLENGE, "challenge");
}

/** The (friendly, enemy) pairs Challenge is offering right now. */
function pairs(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>): string[][] {
  return (game.p1.option("cast", "challenge")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
}

describe("Ruling 3e0d510660662f4f — challenging a [Deflect] unit owes the Deflect surcharge", () => {
  test("with a spare [rainbow] the Deflect Poro is a legal choice — and paying for it costs that extra Power", async () => {
    const game = await board(1).build();
    expect(pairs(game)).toEqual(expect.arrayContaining([["mine", "poro"]]));
    await game.p1.cast("challenge", { targets: ["mine", "poro"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, rainbow: 0 } }); // [2][body] + [rainbow]
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash"); // 4 ≥ 2
    expect(game.state("mine").damage).toBe(2);
  });

  test("without the extra Power the Poro simply is not choosable — only the undefended unit is", async () => {
    const game = await board(0).build();
    expect(pairs(game)).toEqual([["mine", "plain"]]);
    expect((await game.p1.try((p) => p.cast("challenge", { targets: ["mine", "poro"] }))).ok).toBe(false);
  });

  test("choosing an enemy WITHOUT Deflect costs nothing extra — the surcharge is the Poro's, not the spell's", async () => {
    const game = await board(1).build();
    await game.p1.cast("challenge", { targets: ["mine", "plain"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, rainbow: 1 } }); // the [rainbow] is untouched
    await game.settle();
    expect(game.zoneOf("plain")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling 9fd893d9261bf73f — Challenge (OGN-128 → ogn-128-298) · Action [2][body]
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Unyielding Spirit (OGN-145 → ogn-145-298) · Reaction [1][body] · "Prevent all spell and ability damage this turn."
 *
 * Q: Can I combine Challenge with Unyielding Spirit to kill the enemy unit and keep mine?
 * A: No. Challenge deals no damage itself — the UNITS deal their Might to each other — so it is not spell/ability damage
 *    and Unyielding Spirit does not prevent it. Your unit still takes the enemy unit's damage (and vice versa).
 * Rules: 437.2 (the source of damage is the object instructed to deal it), Unyielding Spirit prevents only spell/ability
 *        damage, 140.3 (lethal damage).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const UNYIELDING_SPIRIT = "ogn-145-298";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P1: 3-Might Mine in base; P2: 3-Might Theirs at P2's bf2. P1 holds Spirit, Challenge and Hextech Ray, all affordable. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 2, fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
    .unit(P2, "bf2", { might: 3, name: "Theirs" }, "theirs")
    .hand(P1, UNYIELDING_SPIRIT, "spirit")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P1, HEXTECH_RAY, "ray");
}

describe("Ruling 9fd893d9261bf73f — Unyielding Spirit does not stop Challenge's unit-dealt damage", () => {
  test("control: Unyielding Spirit IS active — it blanks Hextech Ray (spell damage) on Theirs this turn", async () => {
    const game = await board().build();
    await game.p1.cast("spirit");
    await game.settle();
    expect(game.zoneOf("spirit")).toBe("trash");
    await game.p1.cast("ray", { targets: "theirs" });
    await game.settle();
    expect(game.state("theirs")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
  });

  test("ruling: with Spirit already resolved, Challenge [Mine ↔ Theirs] still has both 3-Might units deal 3 to each other — BOTH die; my unit is not protected", async () => {
    const game = await board().build();
    await game.p1.cast("spirit");
    await game.settle();
    await game.p1.cast("challenge", { targets: ["mine", "theirs"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "challenge", targets: ["mine", "theirs"] })]);
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("trash");
    const hits = (game.gameState.damageLog ?? []).filter((r) => !r.combat).map((r) => ({ amount: r.amount, target: r.target }));
    expect(hits).toEqual(expect.arrayContaining([{ amount: 3, target: "mine" }, { amount: 3, target: "theirs" }]));
    expect(game.violations()).toEqual([]);
  });

  test("same outcome if Spirit is cast in RESPONSE to Challenge (Spirit resolves first, then Challenge): both units still die", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["mine", "theirs"] });
    await game.p1.cast("spirit");
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge", "spirit"]);
    await game.settle();
    expect(game.zoneOf("spirit")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("trash");
  });
});

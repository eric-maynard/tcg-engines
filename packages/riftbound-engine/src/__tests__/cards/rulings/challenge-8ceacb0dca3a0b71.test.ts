/**
 * Ruling 8ceacb0dca3a0b71 — Challenge (OGN-128 → ogn-128-298) · Action · Body · [2][body]
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *
 * Q: Do characters heal after a Challenge is resolved?
 * A: No. Nothing about Challenge heals: it is not a combat effect, so no end-of-combat heal applies and the
 *    damage simply stays marked on the survivor for the rest of the turn.
 * Rules: 466.4 (end-of-COMBAT heal only for units in that combat), 317.2.3.c (the Expiration Step's heal),
 *        355 (playing a spell in an open main phase — no showdown, no combat).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";

/** P1's turn, open main phase, no showdown anywhere. A 3-Might ally and a 5-Might enemy, both in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 5, name: "Enemy" }, "enemy")
    .hand(P1, CHALLENGE, "challenge");
}

describe("Ruling 8ceacb0dca3a0b71 — Challenge deals real, lingering damage; nothing heals when it resolves", () => {
  test("both sides deal their Might: the 3-Might Ally dies to 5, the 5-Might Enemy keeps 3 marked damage", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["ally", "enemy"] });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("enemy")).toBe("base");
    expect(game.state("enemy").damage).toBe(3);
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("no combat took place, so no end-of-combat heal: the damage is still there after further actions this turn", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Runner" }, "runner").battlefield("bf1", { controller: null }).build();
    await game.p1.cast("challenge", { targets: ["ally", "enemy"] });
    await game.settle();
    expect(game.state("enemy").damage).toBe(3);
    // A completely separate showdown elsewhere finishes; the challenged unit is not in it and is not healed.
    await game.p1.move("runner", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("enemy").damage).toBe(3);
  });

  // RULING-CONFLICT: riftjudge 8ceacb0dca3a0b71 says units "do not heal after combat OR AT END OF TURN";
  // CR 317.2.3.c makes the Expiration Step heal every unit on the board every turn — engine follows CR.
  // Only the "no heal when Challenge resolves / no end-of-combat heal" half of the ruling is a real rule.
  test("at the END OF TURN the marked damage is healed by the Expiration Step (CR 317.2.3.c)", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["ally", "enemy"] });
    await game.settle();
    expect(game.state("enemy").damage).toBe(3);
    await game.advanceTurn();
    expect(game.state("enemy").damage).toBe(0);
    expect(game.trace().expiration.some((p) => p.healed.includes("enemy"))).toBe(true);
  });
});

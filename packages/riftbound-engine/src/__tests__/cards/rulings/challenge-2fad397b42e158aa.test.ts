/**
 * Ruling 2fad397b42e158aa — Challenge (OGN-128 → ogn-128-298) · [Action] · Body · [2][body]
 *     "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Vi, Peacekeeper (UNL-176 → unl-176-219) · 5 Might · "When I attack, [Stun] an enemy unit here."
 *
 * Q: Does playing Challenge initiate combat?
 * A: No. Challenge is a non-combat damage exchange: no Showdown opens, no Attacker/Defender designations
 *    are made, and nothing that keys on attacking / defending / winning a combat triggers.
 * Rules: 454 / 456 (combat begins from opposing units at a battlefield), 442.1.a (designations),
 *        417.6.b.3 (a unit dealing damage from an effect is not combat damage).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const VI_PEACEKEEPER = "unl-176-219";

/**
 * Everyone is at home: P1's Vi (5 Might) in base, P2's Foe (4) and Bystander (6) in base.
 * If Challenge made Vi an attacker, her "When I attack, [Stun] an enemy unit here" would fire and
 * the Bystander standing in base would be the visible casualty.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", VI_PEACEKEEPER, "vi")
    .unit(P2, "base", { might: 4, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 6, name: "Bystander" }, "bystander")
    .hand(P1, CHALLENGE, "challenge");
}

describe("Ruling 2fad397b42e158aa — Challenge is not combat", () => {
  test("both units deal their Might to each other: Vi (5) kills the 4-Might Foe, Foe marks 4 on Vi", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["vi", "foe"] });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.state("vi").damage).toBe(4);
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: no showdown opens and no combat designations are handed out", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["vi", "foe"] });
    await game.settle();
    expect(game.state("vi").combatRole).toBeFalsy();
    expect(game.state("bystander").combatRole).toBeFalsy();
    expect(game.gameState.battlefields.bf1?.contested).toBeFalsy();
    expect(game.decision()).toMatchObject({ context: "main", seat: P1 });
  });

  test("ruling: Vi's 'When I attack' never fires — the Bystander is not stunned", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["vi", "foe"] });
    await game.settle();
    expect(game.state("bystander").isStunned).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("contrast: a real attack DOES fire the same trigger — Vi moving into an occupied battlefield stuns", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Defender" }, "defender")
      .unit(P1, "base", VI_PEACEKEEPER, "vi")
      .build();
    await game.p1.move("vi", "bf1");
    expect(game.state("vi").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("defender").isStunned).toBe(true);
  });
});

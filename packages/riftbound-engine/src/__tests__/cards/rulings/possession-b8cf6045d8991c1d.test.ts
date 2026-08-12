/**
 * Ruling b8cf6045d8991c1d — Possession (OGN-203 → ogn-203-298) · Spell · [8][chaos][chaos][chaos] · [Action]
 *   "Choose an enemy unit at a battlefield. Take control of it and recall it."
 *   × Ruined Rex (UNL-067 → unl-067-219) · "[Deathknell][>] Deal 4 to an enemy unit."
 *   × Vengeance (OGN-229 → ogn-229-298) · [4][order][order] · "Kill a unit." (how the stolen unit dies)
 *
 * Q: A unit with Deathknell is stolen with Possession and then dies — who gets the trigger, and where does
 *    the card go?
 * A: The CONTROLLER (the thief) gets the Deathknell and makes its choices — so "an enemy unit" is read from
 *    the thief's side of the table. The card itself goes to its OWNER's trash: cards always move to their
 *    owner's zones when owner and controller differ.
 * Rules: 190.6 / 383 (the controller of an ability makes its choices), 421 (cards go to owner's zones).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const RUINED_REX = "unl-067-219";
const VENGEANCE = "ogn-229-298";

/** P2 owns Ruined Rex at their own battlefield; P1 has the spells and the pool for both. */
function stealTheRex() {
  return scenario()
    .resources(P1, { energy: 12, power: { chaos: 3, order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", RUINED_REX, "rex")
    .unit(P2, "base", { might: 9, name: "Bystander" }, "bystander")
    .unit(P2, "base", { might: 9, name: "Second Bystander" }, "bystander2")
    .unit(P1, "base", { might: 9, name: "Thief's Body" }, "mine")
    .hand(P1, POSSESSION, "possession")
    .hand(P1, VENGEANCE, "vengeance");
}

describe("Ruling b8cf6045d8991c1d — the thief gets the Deathknell, the owner gets the card", () => {
  test("Possession leaves P1 as controller and P2 as owner, with the unit recalled to P1's base", async () => {
    const game = await stealTheRex().build();
    await game.p1.cast("possession", { targets: "rex" });
    await game.settle();
    expect(game.state("rex")).toMatchObject({ controller: P1, owner: P2 });
    expect(game.locationOf("rex")).toBe("base");
    expect(game.p1.units("base")).toContain("rex");
    expect(game.gameState.battlefields.bf1?.controller).toBeFalsy(); // P2's last unit there left
  });

  test("when the stolen Rex dies, P1 (the controller) makes the Deathknell's choice — among P1's enemies", async () => {
    const game = await stealTheRex().build();
    await game.p1.cast("possession", { targets: "rex" });
    await game.settle();
    await game.p1.cast("vengeance", { targets: "rex" });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 }); // the THIEF is asked
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).toSorted() : []).toEqual([
      "bystander",
      "bystander2",
    ]); // "an enemy unit" read from P1's seat: only P2's units
    await game.p1.pick("bystander");
    await game.settle();
    expect(game.state("bystander").damage).toBe(4);
    expect(game.state("mine").damage).toBe(0); // never P1's own body
  });

  test("the card itself goes to its OWNER's trash, not the thief's", async () => {
    const game = await stealTheRex().build();
    await game.p1.cast("possession", { targets: "rex" });
    await game.settle();
    await game.p1.cast("vengeance", { targets: "rex" });
    await game.settle();
    await game.p1.pick("bystander");
    await game.settle();
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.p2.trash()).toContain("rex");
    expect(game.p1.trash()).toEqual(["possession", "vengeance"]);
    expect(game.violations()).toEqual([]);
  });
});

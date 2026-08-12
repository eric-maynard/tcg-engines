/**
 * Ruling 32b80df767c870e4 — (no specific card) the state of Gear after its wearer dies
 *   Exercised with Serrated Dirk (SFD-009 → sfd-009-221) · Equipment · "[Equip] [fury] · [Assault 2]".
 *
 * Q: When a unit with attached gear is killed, is the gear ready?
 * A: Yes. The gear detaches, comes back to your base READY, and you can pay its Equip cost again to attach
 *    it to another unit.
 * Rules: 435.1 (detach when the wearer leaves the board), 435.4/435.4.a (the detached gear is at the
 *        wearer's location and is Recalled to its controller's base during the next Cleanup), 458/458.1
 *        (a Recall does not change its state — it never became exhausted), 434 ([Equip] may be paid again).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIRK = "sfd-009-221";
const VENGEANCE = "ogn-229-298"; // [4][order][order] — "Kill a unit."

/** P1's turn: a Squire and a Page in base, the Dirk in P1's base, and [fury][fury] worth of runes. */
function board() {
  return scenario()
    .rune(P1, "fury", { alias: "fury1" })
    .rune(P1, "fury", { alias: "fury2" })
    .unit(P1, "base", { might: 3, name: "Squire" }, "squire")
    .unit(P1, "base", { might: 3, name: "Page" }, "page")
    .gear(P1, DIRK, "dirk");
}

/** Recycle a fury rune for [fury] and attach the Dirk to `unit`. */
async function equip(game: Game, rune: string, unit: string): Promise<void> {
  await game.p1.recycleRune(rune);
  await game.p1.choose("equipCard", { params: { equipmentId: "dirk", unitId: unit } });
  await game.settle();
  expect(game.state("dirk").attachedTo).toBe(unit);
}

describe("Ruling 32b80df767c870e4 — gear from a dead wearer comes back to base, ready and re-equippable", () => {
  test("wearer killed by a spell in base: the Dirk detaches, sits in P1's base READY, and is attached to nobody", async () => {
    const game = await board().resources(P1, { energy: 4, power: { order: 2 } }).hand(P1, VENGEANCE, "vengeance").build();
    await equip(game, "fury1", "squire");
    expect(game.state("squire").might).toBe(3); // [Assault 2] is only for attackers

    await game.p1.cast("vengeance", { targets: "squire" });
    await game.settle();

    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("dirk")).toBe("base");
    expect(game.p1.base()).toContain("dirk");
    expect(game.state("dirk")).toMatchObject({ attachedTo: undefined, isExhausted: false, isReady: true });
    expect(game.state("dirk").attachments).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("…and the Equip cost can simply be paid again to move it onto the next unit", async () => {
    const game = await board().resources(P1, { energy: 4, power: { order: 2 } }).hand(P1, VENGEANCE, "vengeance").build();
    await equip(game, "fury1", "squire");
    await game.p1.cast("vengeance", { targets: "squire" });
    await game.settle();
    await equip(game, "fury2", "page");
    expect(game.state("dirk").attachedTo).toBe("page");
    expect(game.state("page").might).toBe(3);
  });

  test("wearer killed in combat AT a battlefield: the Dirk detaches there and is Recalled to base ready (435.4.a)", async () => {
    const game = await scenario()
      .rune(P1, "fury", { alias: "fury1" })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 3, name: "Squire" }, "squire")
      .gear(P1, DIRK, "dirk")
      .build();
    await equip(game, "fury1", "squire");
    await game.p1.move("squire", "bf1");
    expect(game.state("squire").might).toBe(5); // 3 + [Assault 2] while attacking
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash"); // 9 damage
    expect(game.zoneOf("dirk")).toBe("base");
    expect(game.state("dirk")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.violations()).toEqual([]);
  });
});

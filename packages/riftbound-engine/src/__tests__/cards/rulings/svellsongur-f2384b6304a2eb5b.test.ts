/**
 * Ruling f2384b6304a2eb5b — Svellsongur (SFD-059 → sfd-059-221) · Equipment · [3][calm]
 *   "[Equip] [1][calm]. As this is attached to a unit, copy that unit's text to this Equipment's effect text
 *    for as long as this is attached to it."
 *   × Skyfall of Areion (SFD-030 → sfd-030-221) "[Equip] [1][fury]. My hold effects are also conquer
 *     effects, and vice versa."
 *   × Trinity Force (SFD-115 → sfd-115-221) "[Equip] [body]. When I hold, score 1 point."
 *
 * Q: Will a unit with both Skyfall and Trinity equipped score an additional point on conquest?
 * A: Yes. Equipment effect text is appended to the unit's rules text, so Equipment can reference one
 *    another: Skyfall converts Trinity's hold trigger into a conquer trigger as well, and the conquer pays
 *    its own point plus Trinity's. (Svellsongur is the deliberate exception — it copies only a unit's
 *    PRINTED text, not what other Equipment adds.)
 * Rules: 136.2 / 719.1 (attached Equipment's effect text is appended to the unit's text),
 *        467 / 471.2 (Conquer and Hold scoring).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SVELLSONGUR = "sfd-059-221";
const SKYFALL = "sfd-030-221";
const TRINITY = "sfd-115-221";

async function equip(game: Game, equipmentId: string, unitId: string): Promise<void> {
  await game.p1.choose("equipCard", { params: { equipmentId, unitId } });
  await game.settle();
}

/** P1's turn: a 2-Might Bearer in base, the named Equipment loose in base, and every Equip cost floating. */
function board(gears: readonly [string, string][], bearerAt: "base" | "bf2" = "base", active: string = P1) {
  let s = scenario()
    .turn(active === P1 ? 4 : 3)
    .active(active)
    .victoryScore(20)
    .resources(P1, { energy: 3, power: { body: 1, fury: 1, calm: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, bearerAt, { might: 2, name: "Bearer" }, "bearer")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander");
  for (const [def, alias] of gears) s = s.gear(P1, def, alias);
  return s;
}

describe("Ruling f2384b6304a2eb5b — Equipment text stacks: Skyfall turns Trinity's hold point into a conquer point too", () => {
  test("premise: both Equipment attach to the same Bearer (2 + 2 + 2 = 6 Might)", async () => {
    const game = await board([
      [TRINITY, "tf"],
      [SKYFALL, "sky"],
    ]).build();
    await equip(game, "tf", "bearer");
    await equip(game, "sky", "bearer");
    expect(game.state("bearer").attachments.toSorted()).toEqual(["sky", "tf"]);
    expect(game.state("bearer").might).toBe(6);
  });

  test("ruling: conquering an empty battlefield with BOTH scores 2 — 1 for the conquer, 1 from Trinity via Skyfall", async () => {
    const game = await board([
      [TRINITY, "tf"],
      [SKYFALL, "sky"],
    ]).build();
    await equip(game, "tf", "bearer");
    await equip(game, "sky", "bearer");
    await game.p1.move("bearer", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("control: Trinity ALONE scores only the conquer point — its trigger is a hold trigger", async () => {
    const game = await board([[TRINITY, "tf"]]).build();
    await equip(game, "tf", "bearer");
    await game.p1.move("bearer", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
  });

  test("control: Skyfall ALONE scores only the conquer point — there is no hold effect for it to convert", async () => {
    const game = await board([[SKYFALL, "sky"]]).build();
    await equip(game, "sky", "bearer");
    await game.p1.move("bearer", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
  });

  test("'and vice versa' does not remove the hold half: holding bf2 with both still scores 2 (1 Hold + 1 Trinity)", async () => {
    const game = await board(
      [
        [TRINITY, "tf"],
        [SKYFALL, "sky"],
      ],
      "bf2",
    ).build();
    await equip(game, "tf", "bearer");
    await equip(game, "sky", "bearer");
    const before = game.p1.points();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1, the Hold is scored
    expect(game.p1.points()).toBe(before + 2);
  });

  test("Svellsongur copies only the unit's PRINTED text: alongside Trinity it adds no second point on a hold", async () => {
    const game = await board(
      [
        [TRINITY, "tf"],
        [SVELLSONGUR, "svell"],
      ],
      "bf2",
    ).build();
    await equip(game, "tf", "bearer");
    await equip(game, "svell", "bearer");
    expect(game.state("bearer").attachments.toSorted()).toEqual(["svell", "tf"]);
    const before = game.p1.points();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(before + 2); // 1 Hold + 1 Trinity — Svellsongur did not copy Trinity's text
    expect(game.violations()).toEqual([]);
  });
});

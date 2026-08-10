/**
 * Ruling 69880fdccc4bd956 — Mournful Witness (VEN-028 → ven-028-166) · 2 Might
 *     "When a combat that I was in ends, empower me. [Empowered] I have +2 [Might]."
 *   × Flash (OGS-011 → ogs-011-024) · [Reaction] "Move up to 2 friendly units to base."
 *
 * Q: Does Mournful Witness still empower if it Flashes out of the combat before it ends?
 * A: Yes. "A combat that I WAS in" is a historical check: once it held an Attacker/Defender designation in that combat,
 *    moving to base (still the board) doesn't erase that; when that combat ends the trigger fires and it is empowered.
 *    It would only miss out if it never gained a designation in that combat at all.
 * Rules: 384.2 (triggers evaluate while on the board — base counts), 464.2 (combat designations), Empower.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MOURNFUL_WITNESS = "ven-028-166";
const FLASH = "ogs-011-024";

/** P1's turn, exactly [2] for Flash. P1: Witness (2) + Bruiser (5) in base; P2 holds bf1 with Guard (1 — hurts nobody). */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", MOURNFUL_WITNESS, "witness")
    .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser")
    .unit(P2, "bf1", { might: 1, name: "Guard" }, "guard")
    .hand(P1, FLASH, "flash");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 69880fdccc4bd956 — Mournful Witness Flashed out mid-combat still empowers when that combat ends", () => {
  test("Witness attacks alongside Bruiser and gains the ATTACKER designation; P1 then Flashes it to base while the showdown continues", async () => {
    const game = await board().build();
    expect(game.state("witness")).toMatchObject({ isEmpowered: false, might: 2 });
    await game.p1.move(["witness", "bruiser"], "bf1");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("witness").combatRole).toBe("attacker"); // the historical fact the trigger keys off
    await game.p1.cast("flash", { targets: "witness" });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("witness")).toBe("base");
    expect(showdown(game)?.active).toBe(true); // combat not over yet
    expect(game.state("witness").isEmpowered).toBe(false); // nothing has ended yet
  });

  test("reference: a Witness that stays in the combat until it ends is empowered (4 Might)", async () => {
    const game = await board().build();
    await game.p1.move(["witness", "bruiser"], "bf1");
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("witness")).toMatchObject({ isEmpowered: true, location: "bf1", might: 4 });
  });

  // Expected (ruling): the Flashed-out Witness WAS in this combat (it held the attacker designation), so when the combat
  // ends its trigger fires from base and it becomes Empowered (4 Might). Actual (engine): the combat-end trigger only
  // considers units still designated/at the battlefield when combat ends — the Witness in base stays un-empowered (2).
  test("ruling 69880fdccc4bd956 — engine forgets the Witness 'was in' the combat once it is Flashed to base; no empower at combat end", async () => {
    const game = await board().build();
    await game.p1.move(["witness", "bruiser"], "bf1");
    await game.p1.cast("flash", { targets: "witness" });
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("witness")).toBe("base");
    expect(game.state("witness")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(game.violations()).toEqual([]);
  });

  test("control: a Witness that never entered the combat (stayed home while Bruiser fought) is NOT empowered when it ends", async () => {
    const game = await board().build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("witness")).toMatchObject({ isEmpowered: false, might: 2 });
  });
});

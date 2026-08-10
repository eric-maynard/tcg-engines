/**
 * Ruling 91e92b27208720f6 — Block (OGN-057 → ogn-057-298) × Svellsongur (SFD-059 → sfd-059-221)
 *
 *   Block — Spell · Calm · 2 · [Hidden] [Action]: "Give a unit [Shield 3] and [Tank] this turn."
 *   Svellsongur — Equipment · Calm · 3 · +0: "[Equip] [1][calm] … As this is attached to a unit, copy that unit's text
 *     to this Equipment's effect text for as long as this is attached to it."
 *
 * Q: Does Block's Shield 3 get copied by Svellsongur for an extra Shield 3 on the defender?
 * A: No. Svellsongur copies only the unit's PRINTED text, never keywords granted by spells/gear/battlefields — a
 *    Blocked, Svellsongur-equipped defender gets +3, not +6. (Separately: a unit's own printed Shield and Block's
 *    Shield DO stack additively — two sources, not a copy.)
 * Rules: 814 (Shield: +X Might while a defender; 814.2 values stack), 718 (Equipment effect text), Svellsongur text.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLOCK = "ogn-057-298";
const SVELLSONGUR = "sfd-059-221";
const STALWART_PORO = "ogn-052-298"; // 2 Might, printed [Shield]

/**
 * P1's turn first (to Equip). P1: Holder (2, vanilla) at bf1, Stalwart Poro (2, [Shield]) at bf2, Svellsongur loose in
 * base with exactly [1][calm]; Block in hand. P2: Raider (4) ready in base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "bf2", STALWART_PORO, "poro")
    .gear(P1, SVELLSONGUR, "svell")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, BLOCK, "block");
}

/** Equip Svellsongur onto Holder on P1's turn, then pass to P2's turn and give P1 Block money. */
async function equippedThenP2Turn(): Promise<Game> {
  const game = await board().build();
  await game.p1.do("equipCard", { equipmentId: "svell", unitId: "holder" });
  await game.settle();
  expect(game.state("svell").attachedTo).toBe("holder");
  expect(game.state("svell").meta.copiedFromCardId).toBe("holder");
  expect(game.state("holder").might).toBe(2); // +0 equipment
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p1.do("addResources", { energy: 2, power: { calm: 1 } });
  return game;
}

/** P2's Raider attacks `bf`; P2 passes Focus; P1 Blocks `unit`; the spell resolves (stop before combat damage). */
async function attackAndBlock(game: Game, bf: string, unit: string): Promise<void> {
  await game.p2.move("raider", bf);
  expect(game.state(unit).combatRole).toBe("defender");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "block")).toBe(true);
  await game.p1.cast("block", { targets: unit });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Block resolves
  expect(game.zoneOf("block")).toBe("trash");
  expect(game.state(unit).grantedKeywords).toEqual(
    expect.arrayContaining([expect.objectContaining({ keyword: "Shield", value: 3 }), expect.objectContaining({ keyword: "Tank" })]),
  );
}

describe("Ruling 91e92b27208720f6 — Svellsongur does not copy Block's granted Shield", () => {
  test("Blocked, Svellsongur-equipped Holder (2) defends at 2 + 3 = 5 — NOT 8: the equipment copies no granted Shield", async () => {
    const game = await equippedThenP2Turn();
    await attackAndBlock(game, "bf1", "holder");
    expect(game.state("holder").combatRole).toBe("defender");
    expect(game.state("holder").might).toBe(5);
    expect(game.state("svell").grantedKeywords ?? []).toEqual([]);
    // Combat confirms it: Raider (4) into a 5-Might defender dies; Holder survives and P1 keeps bf1.
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("stacking note: a unit's own PRINTED Shield and Block's Shield 3 add up — Stalwart Poro (2, [Shield]) Blocked defends at 2 + 1 + 3 = 6", async () => {
    const game = await equippedThenP2Turn();
    expect(game.state("poro").keywords).toContain("Shield");
    await attackAndBlock(game, "bf2", "poro");
    expect(game.state("poro").might).toBe(6);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-bf2");
  });
});

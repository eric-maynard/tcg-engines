/**
 * Ruling 7d6419e790ec956f — Warmog's Armor (SFD-108 → sfd-108-221) · Equipment · Body · +1 Might
 *   Effect text (the wearer's while attached): "When I conquer, buff me."
 *   × Veteran Poro (sfd-099-221) · 2-Might [Weaponmaster] — the "detach" (takes the Armor off the first wearer).
 *
 * Q: When Warmog's Armor detaches from a unit, does that unit keep the buff it got from conquering while equipped?
 * A: Yes — the buff already gained stays. But the unit no longer has the Armor's text, so its FUTURE conquers do not
 *    trigger "buff me" any more; unattached, the equipment's effect text is inactive.
 * Rules: 150.2 / 718.3 (effect text is conferred on the wearer only while attached; "me" = the wearer), 702 (a buff is
 *        a marker on the unit — it is not tied to its source), 821 (Weaponmaster may take an Equipment you control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARMOGS = "sfd-108-221";
const VETERAN_PORO = "sfd-099-221";

/** P1's turn with [2]. P2 holds bf1 and bf2 with 1-Might Walls. P1's Ganking Champ (3) in base WEARS Warmog's (+1 → 4); Poro in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Wall One" }, "wall1")
    .unit(P2, "bf2", { might: 1, name: "Wall Two" }, "wall2")
    .unit(P1, "base", { keywords: ["Ganking"], might: 3, name: "Champ" }, "champ", { equippedWith: ["wm"] } as Record<string, unknown>)
    .card("wm", { def: WARMOGS, meta: { attachedTo: "champ" } as Record<string, unknown>, owner: P1, zone: "base" })
    .hand(P1, VETERAN_PORO, "poro");
}

/** Champ (4) attacks bf1 and conquers; the conferred "When I conquer, buff me" resolves. */
async function conquerWhileEquipped(): Promise<Game> {
  const game = await board().build();
  expect(game.state("champ")).toMatchObject({ attachments: ["wm"], isBuffed: false, might: 4 });
  await game.p1.move("champ", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus(); // 4 vs 1 → Wall One dies, P1 conquers bf1
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  // The wearer's conquer trigger (sourced from the Champ — "me" is the wearer) is on the chain.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "champ", controller: P1, triggered: true })]);
  await game.settle();
  return game;
}

/** …then P1 plays Veteran Poro and its Weaponmaster takes the Armor off the Champ. */
async function detached(): Promise<Game> {
  const game = await conquerWhileEquipped();
  await game.p1.play("poro", { to: "base" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "equip" });
  await game.p1.pick("wm");
  await game.settle();
  expect(game.state("wm").attachedTo).toBe("poro");
  return game;
}

describe("Ruling 7d6419e790ec956f — a buff earned through Warmog's stays after the Armor leaves; future conquers no longer buff", () => {
  test("while equipped: conquering bf1 resolves 'buff me' on the WEARER — Champ is buffed (3 base +1 buff +1 Armor = 5); the Armor itself is not buffed", async () => {
    const game = await conquerWhileEquipped();
    expect(game.state("champ")).toMatchObject({ isBuffed: true, location: "bf1", might: 5 });
    expect(game.state("wm").isBuffed).toBe(false);
    expect(game.p1.points()).toBe(1);
  });

  test("the Armor detaches (Weaponmaster moves it onto the Poro): Champ KEEPS its buff — 3 base + 1 buff = 4, no Armor bonus any more; the Poro now has the +1 (2 → 3)", async () => {
    const game = await detached();
    expect(game.state("champ")).toMatchObject({ attachments: [], isBuffed: true, might: 4 });
    expect(game.state("poro")).toMatchObject({ attachments: ["wm"], might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("future conquers by the ex-wearer trigger nothing: next turn Champ ganks bf1 → bf2 and conquers it — NO triggered item from Champ appears on the chain (the text left with the Armor)", async () => {
    const game = await detached();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 again; Champ readies
    expect(game.state("champ")).toMatchObject({ isBuffed: true, isReady: true, location: "bf1" });
    await game.p1.gank("champ", "bf2");
    await game.p1.passFocus();
    await game.p2.passFocus(); // 4 vs 1 → conquers bf2
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.chain().some((c) => c.cardId === "champ" && c.triggered)).toBe(false);
    await game.settle();
    expect(game.state("champ")).toMatchObject({ isBuffed: true, location: "bf2", might: 4 }); // still just the one old buff
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("contrast: if the Armor had stayed on, the same second conquer DOES put Champ's 'When I conquer' on the chain again", async () => {
    const game = await conquerWhileEquipped();
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.gank("champ", "bf2");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "champ", controller: P1, triggered: true })]);
  });
});

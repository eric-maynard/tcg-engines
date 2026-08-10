/**
 * Ruling 46c13f74635f9446 — Zenith Blade (OGN-262 → ogn-262-298) · Action · [3][rainbow][rainbow]
 *     "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *   × Rune Prison (OGN-050 → ogn-050-298) · Action · [2][calm] "Stun a unit."
 *
 * Q: In a staged combat where BOTH units got stunned during the preceding non-combat showdown, which units are recalled?
 * A: Only the attacker's. A moves onto an open battlefield (non-combat showdown, A is the attacker — A applied Contested);
 *    B Zenith Blades (stuns A's unit, moves B's unit in → combat is staged); A Rune Prisons B's unit. In the combat neither
 *    deals damage; the ATTACKER (A) is recalled, B gains control of the battlefield and scores a point.
 * Rules: 459.2.b.1 (who applied Contested attacks), 344/464 (staged combat after the showdown), 466 (stunned units deal
 *        no combat damage; surviving attackers are recalled when defenders remain), 467 (conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";
const RUNE_PRISON = "ogn-050-298";

/** P1's turn (A). bf1 open. P1: Scout (3) in base, Rune Prison + [2][calm]. P2 (B): Brawler (3) in base, Zenith Blade + [3]+2 rainbow. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .resources(P2, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 3, name: "Brawler" }, "brawler")
    .hand(P1, RUNE_PRISON, "prison")
    .hand(P2, ZENITH_BLADE, "zenith");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick("battlefield-bf1");
      continue;
    }
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

/** A moves in (non-combat showdown), passes focus; B Zenith Blades (stun Scout, Brawler → bf1); A Rune Prisons the Brawler. */
async function bothStunned(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
  expect(showdown(game)?.isCombatShowdown ?? false).toBe(false); // open battlefield → NON-combat showdown
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "zenith")).toBe(true);
  await game.p2.cast("zenith", { targets: ["scout", "brawler"] });
  await resolveChain(game);
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("battlefield-bf1");
  }
  expect(game.state("scout")).toMatchObject({ isStunned: true, location: "bf1" });
  expect(game.locationOf("brawler")).toBe("bf1");
  // Focus comes back around to A, who Rune Prisons B's Brawler.
  for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
    await game.acting().pass();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "prison")).toBe(true);
  await game.p1.cast("prison", { targets: "brawler" });
  await resolveChain(game);
  expect(game.state("brawler")).toMatchObject({ isStunned: true, location: "bf1" });
  return game;
}

describe("Ruling 46c13f74635f9446 — both units stunned before a staged combat: only the ATTACKER's unit is recalled; the other player conquers", () => {
  test("setup facts: A (P1) applied Contested and is the attacker; after Zenith Blade + Rune Prison both units at bf1 are stunned, still inside A's showdown", async () => {
    const game = await bothStunned();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(showdown(game)?.active).toBe(true);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("everyone passes → the staged combat runs with no damage either way; the attacker's Scout is recalled to base, B's Brawler stays, B controls bf1 and scores 1", async () => {
    const game = await bothStunned();
    await game.settle();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("scout")).toMatchObject({ damage: 0, location: "base" });
    expect(game.state("brawler")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling f310351a52fe2802 — Minotaur Reckoner (SFD-014 → sfd-014-221) · Unit · Fury · [5] · 5 Might — "Units can't move to base."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield — "When you defend here, you may move a friendly unit here to base."
 *
 * Q: Does a Minotaur Reckoner stop Reaver's Row from being used at all?
 * A: No. The Reckoner forbids the MOVE, not the ability. Reaver's Row still triggers when you defend there and still resolves;
 *    you may opt in and name a unit — the "move it to base" instruction simply can't be followed and is ignored, so the unit
 *    stays at the battlefield.
 * Rules: 359.3.e.6 (instructions that can't be followed are ignored), 383 (the trigger still goes on the chain), 450 (Move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MINOTAUR_RECKONER = "sfd-014-221";
const REAVERS_ROW = "ogn-285-298";

/**
 * P2's turn (turn 3). P1 holds the live Reaver's Row with a Scout (3) and a Buddy (2). P2 has a 4-Might Raider ready in
 * base and — when `reckoner` — a Minotaur Reckoner standing in P2's base (its static is board-wide).
 */
function board(reckoner: boolean) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 3, name: "Scout" }, "scout")
    .unit(P1, "row", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
  return reckoner ? s.unit(P2, "base", MINOTAUR_RECKONER, "mino") : s;
}

/** Raider attacks the Row → P1 defends: the Row's "you may" is asked at once; accept and name Buddy; resolve the trigger only. */
async function defendAndUseRow(game: Game): Promise<void> {
  await game.p2.move("raider", "row");
  // The ability TRIGGERS regardless of the Reckoner: P1 is offered the opt-in from the battlefield.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" } });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  const d = game.decision();
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["buddy", "scout"]);
  await game.p1.pick("buddy");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, targets: ["buddy"], triggered: true })]);
  // Resolve just that item (both pass priority), staying inside the showdown.
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling f310351a52fe2802 — Minotaur Reckoner doesn't stop Reaver's Row from triggering/resolving; only the move fails", () => {
  test("with the Reckoner on the board P1's units carry the 'can't move to base' restriction (premise)", async () => {
    const game = await board(true).build();
    expect(game.state("buddy").keywords).toContain("NoMoveToBase");
    expect(game.state("scout").keywords).toContain("NoMoveToBase");
  });

  test("Reckoner present: the Row still triggers on defend, P1 may accept and name Buddy, the item resolves — but Buddy stays at the Row", async () => {
    const game = await board(true).build();
    await defendAndUseRow(game);
    expect(game.zoneOf("buddy")).toBe("battlefield-row");
    expect(game.zoneOf("scout")).toBe("battlefield-row");
    expect(game.state("buddy").combatRole).toBe("defender"); // still in the combat
    expect(game.violations()).toEqual([]);
  });

  test("control without the Reckoner: the identical sequence moves Buddy to P1's base", async () => {
    const game = await board(false).build();
    await defendAndUseRow(game);
    expect(game.zoneOf("buddy")).toBe("base");
    expect(game.zoneOf("scout")).toBe("battlefield-row");
  });

  test("Reckoner present, full combat afterwards: Buddy never left, so Scout 3 + Buddy 2 = 5 defend together and kill the Raider 4; P1 keeps the Row", async () => {
    const game = await board(true).build();
    await defendAndUseRow(game);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 5 damage from two defenders ≥ 4
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    // Raider's 4 must be assigned lethally first to one defender: whichever took it died, the other lives — Buddy was a legal recipient because it stayed.
    const alive = ["scout", "buddy"].filter((u) => game.zoneOf(u) === "battlefield-row");
    expect(alive.length).toBeGreaterThanOrEqual(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});

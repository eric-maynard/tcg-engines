/**
 * Ruling 3ebe88b6b3dae467 — Void Seeker (OGN-024 → ogn-024-298) · Spell · Fury · [3][fury] · [Action]
 *   "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: Can I use Void Seeker on a unit that moves into an open (unoccupied) battlefield?
 * A: Yes. Moving into an open battlefield starts a showdown (but not a combat). The mover has Focus and
 *    priority first and may play [Action] or [Reaction] cards; once they pass Focus you may play [Action]
 *    spells such as Void Seeker to start a chain.
 * Rules: 344 / 446.1 (the move begins a showdown), 310.3 ([Action] speed inside a Showdown Open state),
 *        345 (Focus order), 464 (no combat without an opposing unit).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";

/** P2's turn. bf1 is empty and uncontrolled; P2 has a 4-Might Scout in base. P1 holds Void Seeker with [3]+fury. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 4, name: "Scout" }, "scout")
    .hand(P1, VOID_SEEKER, "seeker")
    .deck(P1, ["ogn-175-298"], ["d1"]);
}

async function walkedIn(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("scout", "bf1");
  return game;
}

describe("Ruling 3ebe88b6b3dae467 — Void Seeker can be cast in the showdown a move onto an empty battlefield opens", () => {
  test("a showdown starts but no combat: the Scout has no combat designation and P2 (the mover) holds Focus", async () => {
    const game = await walkedIn();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
    expect(game.state("scout").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.decision()).toBeNull();
  });

  test("P1 gets the window only after P2 passes Focus — and then the [Action] Void Seeker is legal", async () => {
    const game = await walkedIn();
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "seeker")).toBe(true);
    const targets = (game.p1.option("cast", "seeker")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["scout"]); // "a unit at a battlefield" — the Scout is now at one
  });

  test("ruling: it resolves for 4, killing the 4-Might Scout, and P1 draws 1; the emptied battlefield stays uncontrolled", async () => {
    const game = await walkedIn();
    await game.p2.passFocus();
    await game.p1.cast("seeker", { targets: "scout" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "seeker", controller: P1 })]);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — before the move there is no showdown at all, so P1 has no window and the Scout is not even a legal target", async () => {
    const game = await board().build();
    expect(game.p1.decision()).toBeNull();
    expect(game.p1.can("cast", "seeker")).toBe(false); // an [Action] on the opponent's turn outside a showdown
  });
});

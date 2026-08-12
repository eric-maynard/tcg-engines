/**
 * Ruling b55ef1cbba8d9320 — Kharox (VEN-114 → ven-114-166) · Unit · Chaos · 5 Might
 *   "[Empower] [6][chaos][chaos]. When I become [Empowered], choose an opponent. They [Burn 3]. Then you
 *    may do this: Choose a unit in their trash and play it, ignoring its cost."
 *
 * Q: When you play a unit out of the opponent's trash with Kharox's Empower and it later dies, does it go
 *    to your trash or theirs?
 * A: To THEIRS. You gain control of the unit, but ownership never changes, and a card can never end up in
 *    another player's non-board zone — so it goes home to its owner's trash. This is true of anything you
 *    play out of an opponent's trash, not just with Kharox.
 * Rules: 056 (a card only ever enters ITS OWNER's non-board zones), 191.1 (playing it makes you its
 *        controller, not its owner), 124.1 (it enters as a fresh object).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KHAROX = "ven-114-166";
const SKULKER = "ogn-175-298"; // 3-Might vanilla unit, seeded into P2's trash

/** A plain kill spell so the stolen unit can be sent to a trash on demand. */
const ASSASSINATE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Assassinate",
  timing: "action",
} as const;

/** P1's turn. Kharox is ready in P1's base with the Empower cost available; P2 has a unit in their trash. */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { chaos: 2, fury: 1 } })
    .unit(P1, "base", KHAROX, "kharox")
    .trash(P2, SKULKER, "victim")
    .hand(P1, ASSASSINATE, "kill");
}

/** Empower Kharox and play P2's trashed unit with the reflexive trigger. */
async function stealFromTheirTrash() {
  const game = await board().build();
  await game.p1.activate("kharox", 0);
  await game.settle(); // Burn 3 resolves, then the "choose a unit in their trash" pick
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
  await game.p1.pick("victim");
  await game.settle();
  return game;
}

describe("Ruling b55ef1cbba8d9320 — a unit played from the opponent's trash goes back to THEIR trash when it dies", () => {
  test("Kharox's Empower puts the opponent's trashed unit onto the board under P1's control", async () => {
    const game = await stealFromTheirTrash();
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.locationOf("victim")).toBe("base");
    expect(game.state("kharox").isEmpowered).toBe(true);
  });

  test("ruling: control changed, ownership did not", async () => {
    const game = await stealFromTheirTrash();
    expect(game.state("victim").controller).toBe(P1);
    expect(game.state("victim").owner).toBe(P2);
  });

  test("ruling: when it dies it is put into its OWNER's trash — P2's, never P1's", async () => {
    const game = await stealFromTheirTrash();
    await game.p1.cast("kill", { targets: "victim" });
    await game.settle();

    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.trash()).toContain("victim");
    expect(game.p1.trash()).not.toContain("victim");
    expect(game.p1.trash()).toEqual(["kill"]); // only P1's own spent spell
    expect(game.violations()).toEqual([]);
  });
});

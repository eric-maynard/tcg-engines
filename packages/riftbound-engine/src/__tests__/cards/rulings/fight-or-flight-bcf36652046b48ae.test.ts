/**
 * Ruling bcf36652046b48ae — Fight or Flight (OGN-168 → ogn-168-298) · [Hidden][Action] · "Move a unit from a battlefield to its base."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield · "When you defend here, you may move a friendly unit here to base."
 *
 * Q: During a showdown at my Reaver's Row I answer the Row trigger with Fight or Flight, sending the opponent's ATTACKER home. Do I
 *    still get the Row's defend effect?
 * A: Yes. The trigger condition ("when you defend here") is checked when it triggers, not again on resolution. FoF resolves first
 *    (attacker to base), then the Row's effect resolves and still moves your unit home; you remain the defender until the combat's
 *    special cleanup. The showdown does not abort mid-chain.
 * Rules: 383.2 (trigger conditions checked at trigger time), 340 (LIFO), 465 (attacker/defender status cleared only in combat
 *        resolution), 811 (a face-down card is played at Reaction speed, acting "here").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const REAVERS_ROW = "ogn-285-298";

/**
 * P2's turn 3. P1 holds the live Reaver's Row with Keeper (3) + Runner (2) and has Fight or Flight face down there (hidden on an
 * earlier turn). P2's Raider (4) attacks the Row.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false, owner: P1 })
    .unit(P1, "row", { might: 3, name: "Keeper" }, "keeper")
    .unit(P1, "row", { might: 2, name: "Runner" }, "runner")
    .facedown(P1, "row", FIGHT_OR_FLIGHT, "fof")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

const row = (game: Game) => game.gameState.battlefields.row;

/** Raider attacks; P1 opts into the Row naming the Runner; P1 then flips FoF on the Raider in response. */
async function rowThenFof(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "row");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.state("keeper").combatRole).toBe("defender");
  // The Row triggered for the defender (P1): opt in, name the Runner.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" } });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "row" } });
  await game.p1.pick("runner");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, targets: ["runner"], triggered: true })]);
  // In response (P1 holds priority) P1 plays the face-down Fight or Flight on the attacking Raider (a unit at this battlefield).
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.p1.can("reveal", "fof")).toBe(true);
  await game.p1.reveal("fof", { answers: ["raider"] });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("raider");
  }
  expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([
    ["row", ["runner"]],
    ["fof", ["raider"]],
  ]);
  return game;
}

/** Both players pass once → the top item resolves. */
async function resolveTop(game: Game): Promise<void> {
  const before = game.chain().length;
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.chain()).toHaveLength(before - 1);
}

describe("Ruling bcf36652046b48ae — FoF-ing the attacker away doesn't switch off your already-triggered Reaver's Row", () => {
  test("FoF resolves first (LIFO): the Raider is back in P2's base while the Row item still waits; the showdown has NOT ended and P1 is still the defender in control", async () => {
    const game = await rowThenFof();
    await resolveTop(game); // Fight or Flight
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("raider")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["row"]);
    expect(row(game)).toMatchObject({ contested: true, controller: P1 });
    expect(game.state("keeper").combatRole).toBe("defender"); // defender status persists until combat resolution's cleanup
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("then the Row's effect STILL resolves — the trigger condition was met when it triggered — and the Runner is moved home", async () => {
    const game = await rowThenFof();
    await resolveTop(game); // FoF
    await resolveTop(game); // Reaver's Row
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("runner")).toBe("base");
    expect(game.locationOf("keeper")).toBe("row");
    // Still inside the showdown: it only ends through the normal steps.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(row(game)).toMatchObject({ contested: true, controller: P1 });
  });

  test("the combat then completes its steps with no attacker left: P1 keeps the Row uncontested, nobody died, roles are cleared only now", async () => {
    const game = await rowThenFof();
    await game.settle();
    expect(row(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.locationOf("raider")).toBe("base");
    expect(game.locationOf("runner")).toBe("base");
    expect(game.locationOf("keeper")).toBe("row");
    expect(game.state("keeper").combatRole).toBeNull();
    expect(game.state("raider").combatRole).toBeNull();
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});

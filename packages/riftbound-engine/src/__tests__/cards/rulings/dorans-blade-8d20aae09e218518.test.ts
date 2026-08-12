/**
 * Ruling 8d20aae09e218518 — exhausting a unit does not exhaust its attachments.
 *   Cards: Doran's Blade (SFD-095 → sfd-095-221) Equipment "[Equip] [body]" (vanilla — +2 Might while
 *     attached, no other text), attached to an inline filler unit.
 *
 * Q: When a unit is exhausted (e.g. by moving), does its attachment become exhausted too?
 * A: No. Ready/exhausted state is tracked per object: the unit exhausting leaves the attachment ready,
 *    and readying the unit does not touch the attachment either.
 * Rules: 176 (Ready/Exhausted is a state of one object), 144.2 (exhausting the MOVING UNIT is the cost
 *    of a Standard Move), 150.4 (attached Equipment is its own gear object).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DORANS_BLADE = "sfd-095-221";

/** P1's turn: a ready wielder in base carrying a ready Doran's Blade, and an empty battlefield to walk to. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "Wielder" }, "wielder", { equippedWith: ["blade"] })
    .gear(P1, DORANS_BLADE, "blade", { attachedTo: "wielder" });
}

async function movedOut(): Promise<Game> {
  const game = await board().build();
  expect(game.state("wielder")).toMatchObject({ attachments: ["blade"], isExhausted: false });
  expect(game.state("blade")).toMatchObject({ attachedTo: "wielder", isExhausted: false });
  await game.p1.move("wielder", "bf1");
  return game;
}

describe("Ruling 8d20aae09e218518 — a unit and its attachment keep separate ready/exhausted states", () => {
  test("moving exhausts the UNIT (the move's cost)", async () => {
    const game = await movedOut();
    expect(game.state("wielder")).toMatchObject({ isExhausted: true, isReady: false });
    expect(game.locationOf("wielder")).toBe("bf1");
  });

  test("the attachment stays READY — it is not dragged along into the exhausted state", async () => {
    const game = await movedOut();
    expect(game.state("blade")).toMatchObject({ isExhausted: false, isReady: true });
    expect(game.state("blade").attachedTo).toBe("wielder");
  });

  test("the attachment travels with the unit but its state is untouched by the trip", async () => {
    const game = await movedOut();
    await game.settle();
    expect(game.locationOf("blade")).toBe("bf1");
    expect(game.state("wielder").attachments).toEqual(["blade"]);
    expect(game.state("blade").isExhausted).toBe(false);
  });

  test("and vice versa across a turn boundary: readying the unit changes nothing about the blade", async () => {
    const game = await movedOut();
    await game.settle();
    expect(game.state("wielder").isExhausted).toBe(true);
    await game.advanceTurn(); // P2's turn
    await game.advanceTurn(); // back to P1 — the wielder readies
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("wielder").isExhausted).toBe(false);
    expect(game.state("blade").isExhausted).toBe(false);
    expect(game.state("blade").attachedTo).toBe("wielder");
    expect(game.violations()).toEqual([]);
  });

  test("the Might bonus is independent of any of this — the blade keeps granting it while attached", async () => {
    const game = await board().build();
    const withBlade = game.state("wielder").might;
    await game.p1.move("wielder", "bf1");
    await game.settle();
    expect(game.state("wielder").might).toBe(withBlade);
    expect(game.seat(P2).units("bf1")).toEqual([]);
  });
});

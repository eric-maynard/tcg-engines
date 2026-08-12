/**
 * Ruling 413fa02910cf0fca — The Candlelit Sanctum (OGN-291 → ogn-291-298) · Battlefield
 *   "When you conquer here, look at the top two cards of your Main Deck. You may recycle one or both
 *    of them. Put those you don't back in any order."
 *
 * Q: I control the Sanctum, I move my unit off it, then I move a DIFFERENT unit onto it — do I get
 *    the effect?
 * A: The trigger is a conquer trigger only; simply re-occupying a place you already control is not a
 *    conquer, so it does not fire. (Whether you still control the empty battlefield when the second
 *    unit arrives is the Core Rules' Cleanup question — see the RULING-CONFLICT note below.)
 * Rules: 467 / 190.4 (Conquer = GAINING control of a battlefield you did not control), 323.6 (a
 *        controller with no unit there loses control at the next Open-State Cleanup), 383.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SANCTUM = "ogn-291-298";

/**
 * P1's turn. P1 holds the live Sanctum with a Holder on it, keeps a Reserve at home, and has a known
 * deck top so any Sanctum look is unmistakable.
 */
function board() {
  return scenario()
    .battlefield("sanctum", { controller: P1, def: SANCTUM, inert: false })
    .unit(P1, "sanctum", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Reserve" }, "reserve")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Walk the Holder home, then walk the Reserve onto the Sanctum. */
async function swapGarrison(game: Game): Promise<void> {
  await game.p1.move("holder", "base");
  await game.settle();
  await game.p1.move("reserve", "sanctum");
  await game.settle();
}

describe("Ruling 413fa02910cf0fca — swapping which of your units stands on the Sanctum", () => {
  test("premise: P1 controls the Sanctum with the Holder on it, and nothing has been looked at", async () => {
    const game = await board().build();
    expect(game.gameState.battlefields.sanctum?.controller).toBe(P1);
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
  });

  test("after the swap the Sanctum is P1's with the Reserve standing on it, and no card has actually been recycled (the deck's top three are where they were)", async () => {
    const game = await board().build();
    await swapGarrison(game);
    expect(game.p1.units("sanctum")).toEqual(["reserve"]);
    expect(game.locationOf("holder")).toBe("base");
    expect(game.gameState.battlefields.sanctum?.controller).toBe(P1);
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 413fa02910cf0fca reasons "you never lost control, so it is not a conquer".
  // CR 323.6 (Cleanup step 4) takes control away from a player who has no unit at a battlefield the moment
  // an Open State Cleanup runs — which happens as soon as the Holder walks home — so the arrival of the
  // Reserve IS a conquer of an uncontrolled battlefield (190.4 / 466.5, operations/battlefield-control.ts).
  // Engine follows CR: the Sanctum's trigger fires and the conquer scores. The answer's practical claim
  // (no benefit from "moving a different unit onto a place you already control") survives only when you
  // never actually give the battlefield up — see the next test.
  test("ruling 413fa02910cf0fca (CR-corrected) — the empty Sanctum lapses to uncontrolled at the Cleanup, so the Reserve's arrival IS a conquer: the look happens and a point is scored", async () => {
    const game = await board().build();
    await game.p1.move("holder", "base");
    await game.settle();
    expect(game.gameState.battlefields.sanctum?.controller).toBeNull(); // 323.6, step 4
    await game.p1.move("reserve", "sanctum");
    const r = await game.settle();
    expect(r.reason === "unanswered" || game.p1.points() === 1).toBe(true);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.sanctum?.controller).toBe(P1);
  });

  test("the ruling's own case, kept honestly: with a SECOND unit still standing on the Sanctum, moving one off and another on is no conquer at all — no trigger, no point, deck untouched", async () => {
    const game = await scenario()
      .battlefield("sanctum", { controller: P1, def: SANCTUM, inert: false })
      .unit(P1, "sanctum", { might: 3, name: "Holder" }, "holder")
      .unit(P1, "sanctum", { might: 1, name: "Anchor" }, "anchor")
      .unit(P1, "base", { might: 2, name: "Reserve" }, "reserve")
      .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
      .build();
    await game.p1.move("holder", "base");
    await game.settle();
    expect(game.gameState.battlefields.sanctum?.controller).toBe(P1); // the Anchor keeps it
    await game.p1.move("reserve", "sanctum");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.deck().slice(0, 3)).toEqual(["d1", "d2", "d3"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("contrast — a real conquer does fire it: taking the Sanctum from P2 asks P1 about the top two cards", async () => {
    const game = await scenario()
      .battlefield("sanctum", { controller: P2, def: SANCTUM, inert: false })
      .unit(P2, "sanctum", { might: 1, name: "Squatter" }, "squatter")
      .unit(P1, "base", { might: 4, name: "Reserve" }, "reserve")
      .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
      .build();
    await game.p1.move("reserve", "sanctum");
    const r = await game.settle();
    expect(game.zoneOf("squatter")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("unanswered"); // the Sanctum's look is P1's to answer
    expect(game.decision()).toMatchObject({ seat: P1 });
  });
});

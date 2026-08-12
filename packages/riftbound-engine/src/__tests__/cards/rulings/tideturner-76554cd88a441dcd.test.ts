/**
 * Ruling 76554cd88a441dcd — Tideturner (OGN-199 → ogn-199-298) · Unit · Chaos · [2] · 2 Might · [Hidden]
 *   "When you play me, you may choose a unit you control at another location. Move me to its location and it to my
 *    original location."
 *
 * Q: My opponent attacks the battlefield where my unit stands. Can I flip a Hidden Tideturner at my OTHER
 *    battlefield and swap the two?
 * A: Yes. A Hidden card may be played from any battlefield whenever you may legally react, and Tideturner's clause
 *    explicitly wants a unit at ANOTHER location, so the usual "hidden cards target only where they are" limit
 *    cannot apply to it. Tideturner enters where it was hidden and then the two units trade places.
 * Rules: 811.1.d.2 (the "another location" clause overrides the hidden targeting restriction), 336/347 (reactions
 *        while a showdown is open), 383.3.a (the leading "you may" is answered as the trigger is finalized).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";

/** P2's turn. P1 holds bf1 with a Guard and has Tideturner face down at bf2; P2 sends a Raider at bf1. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 1, name: "Scout" }, "scout")
    .facedown(P1, "bf2", TIDETURNER, "tide")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

/** P2 attacks bf1 and hands Focus over; P1 may now react from anywhere. */
async function attacked(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
  await game.p2.passFocus();
  return game;
}

describe("Ruling 76554cd88a441dcd — a Hidden Tideturner at the OTHER battlefield may answer an attack and swap in", () => {
  test("the hidden card is playable although the showdown is at a different battlefield", async () => {
    const game = await attacked();
    expect(game.zoneOf("tide")).toBe("facedown-bf2");
    expect(game.p1.can("reveal", "tide")).toBe(true);
  });

  test("it enters at bf2 (where it was hidden) and the 'you may' is offered before anything resolves", async () => {
    const game = await attacked();
    await game.p1.reveal("tide");
    expect(game.locationOf("tide")).toBe("bf2");
    // The clause wants a unit at ANOTHER location — the Guard at the attacked bf1 is the candidate.
    expect(game.p1.units("bf2").toSorted()).toEqual(["scout", "tide"]);
  });

  test("choosing the Guard swaps them across battlefields: Tideturner to bf1, the Guard to bf2", async () => {
    const game = await attacked();
    game.script(P1, ["yes", "guard"]);
    await game.p1.reveal("tide");
    // resolve just the swap trigger — a full settle would run the combat the 2-Might Tideturner then loses
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.locationOf("tide")).toBe("bf1");
    expect(game.locationOf("guard")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("declining the optional leaves both where they were", async () => {
    const game = await attacked();
    game.script(P1, ["decline"]);
    await game.p1.reveal("tide");
    expect(game.locationOf("tide")).toBe("bf2");
    expect(game.locationOf("guard")).toBe("bf1");
  });
});

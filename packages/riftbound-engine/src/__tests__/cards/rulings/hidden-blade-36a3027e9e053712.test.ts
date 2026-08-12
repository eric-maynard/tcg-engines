/**
 * Ruling 36a3027e9e053712 — Hidden Blade (OGN-213 → ogn-213-298) · Action · [2][order] ·
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].)
 *      Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: When Hidden Blade is played from hiding, must it kill a unit at the battlefield it is hidden at — and
 *    what happens to a hidden card if I lose control of that battlefield?
 * A: Both as the ruling says: every choice a card played from a Facedown Zone makes is restricted to that
 *    battlefield, so only units there are legal; and a hidden card at a battlefield its hider no longer
 *    controls is put into the trash at the next cleanup.
 * Rules: 811.1.d.2 (a card played from a Facedown Zone chooses only among objects at that battlefield),
 *        323.7 (cleanup: hidden cards at battlefields not controlled by their hider go to the trash),
 *        190.4.c/323.6 (control lapses once you have no units there in an Open State).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";

/** P1's turn. P1 holds bf1 with a Holder; P2 holds bf2 with a Stranger and keeps a Raider in base. P1 has [rainbow] to hide with. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Stranger" }, "stranger")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P1, HIDDEN_BLADE, "blade");
}

/** Hide the Blade at bf1. */
async function hideAtBf1(): Promise<Game> {
  const game = await board().build();
  await game.p1.hide("blade", "bf1");
  await game.settle();
  expect(game.zoneOf("blade")).toBe("facedown-bf1");
  expect(game.p1.facedown("bf1")).toEqual(["blade"]);
  return game;
}

describe("Ruling 36a3027e9e053712 — a hidden card is bound to its battlefield, for its choices and for its survival", () => {
  test("it can only be hidden at a battlefield P1 controls — bf2 (P2's) is not on offer", async () => {
    const game = await board().build();
    expect((await game.p1.try((p) => p.hide("blade", "bf2"))).ok).toBe(false);
    expect(game.zoneOf("blade")).toBe("hand");
  });

  test("revealed from hiding, its kill may only choose units AT bf1 — the enemy Stranger at bf2 is not a legal choice", async () => {
    const game = await hideAtBf1();
    // P2 attacks bf1 so that there is an enemy unit there to compare against the one at bf2.
    await game.p1.endTurn();
    await game.settle();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.reveal("blade");
    // The kill is chosen as the card is played from hiding — and only bf1's units are offered.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const keys = d && d.kind === "pick" ? d.options.map((o) => String(o.card ?? o.key)) : [];
    expect(keys.toSorted()).toEqual(["holder", "raider"]); // never the Stranger at bf2
    await game.p1.pick("raider");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("stranger")).toBe("battlefield-bf2");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.energy()).toBe(0); // played from hiding for [0]
    expect(game.violations()).toEqual([]);
  });

  test("losing control of bf1 trashes the hidden card: P1 walks the Holder home and the Blade is gone at the cleanup", async () => {
    const game = await hideAtBf1();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.p1.move("holder", "base");
    await game.settle();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.facedown("bf1")).toEqual([]);
  });
});

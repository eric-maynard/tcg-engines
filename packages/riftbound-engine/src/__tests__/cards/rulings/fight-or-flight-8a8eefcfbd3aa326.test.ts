/**
 * Ruling 8a8eefcfbd3aa326 — Fight or Flight (OGN-168 → ogn-168-298) · [Hidden] Action [2] "Move a unit from a battlefield to its base."
 *   (Zhonya's Hourglass ogn-077-298 is only cited as a card with its own quirk around the restriction.)
 *
 * Q: My Fight or Flight is hidden at battlefield A. On the opponent's turn they move units into battlefield B — can I flip it
 *    to bounce one of THOSE units?
 * A: No. A card played from facedown may only choose units at the battlefield it was hidden at, whoever's turn it is. Units at
 *    B are simply not legal choices for the hidden copy (a copy cast from hand has no such restriction).
 * Rules: 811.1.d.2 (hidden ⇒ implicit "here" on chosen units/locations), 811.6 (gains Reaction), 341 (Focus in a showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";

/**
 * Turn 3, P2's turn. bfA: P1's, held by Sentinel (2) with P2's Lurker (2) also standing there, and P1's Fight or Flight
 * facedown. bfB: P1's, held by Keeper (3). P2's Raider (4) is about to move into bfB. P1 also has a hand copy + [2].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfA", { might: 2, name: "Sentinel" }, "sentinel")
    .unit(P2, "bfA", { might: 2, name: "Lurker" }, "lurker")
    .facedown(P1, "bfA", FIGHT_OR_FLIGHT, "fofHidden")
    .hand(P1, FIGHT_OR_FLIGHT, "fofHand")
    .unit(P1, "bfB", { might: 3, name: "Keeper" }, "keeper")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

/** P2 marches the Raider into bfB → showdown there; P2 passes Focus to P1. */
async function raiderIntoB(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bfB");
  expect(game.locationOf("raider")).toBe("bfB");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 8a8eefcfbd3aa326 — a hidden Fight or Flight at A cannot reach units that moved into B", () => {
  test("the facedown copy at A may be flipped during the showdown at B (it is a Reaction), but it only ever offers units AT A — the Raider/Keeper at B are not choices", async () => {
    const game = await raiderIntoB();
    expect(game.p1.can("reveal", "fofHidden")).toBe(true);
    const pre = game.p1.option("reveal", "fofHidden")?.fields.find((f) => f.name === "targets");
    if (pre?.options) {
      const offered = [...new Set(pre.options.flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
      expect(offered).not.toContain("raider");
      expect(offered).not.toContain("keeper");
    }
    await game.p1.reveal("fofHidden");
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const offered = d.options.map((o) => o.card ?? o.key).toSorted();
      expect(offered).toEqual(["lurker", "sentinel"]); // units HERE (bfA) only, friend or foe
      expect(offered).not.toContain("raider");
      const r = await game.p1.try((p) => p.pick("raider"));
      expect(r.ok).toBe(false);
      await game.p1.pick("lurker");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fofHidden", controller: P1 })]);
    expect(game.chain()[0]?.targets ?? []).not.toContain("raider");
    await game.settle();
    expect(game.zoneOf("fofHidden")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bfB"); // untouched
    expect(game.locationOf("lurker")).toBe("base"); // the unit at A went home instead
  });

  test("contrast: the copy cast from HAND with Focus has no 'here' restriction — it can pick the Raider at B and sends it back to base", async () => {
    const game = await raiderIntoB();
    const field = game.p1.option("cast", "fofHand")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).toContain("raider");
    await game.p1.cast("fofHand", { targets: "raider" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("fofHand")).toBe("trash");
    expect(game.locationOf("raider")).toBe("base");
    expect(game.locationOf("keeper")).toBe("bfB");
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling 74f18694e4dafe23 — Tideturner (OGN-199 → ogn-199-298) · Unit · Chaos · [2] · 2 Might · [Hidden]
 *     "When you play me, you may choose a unit you control at another location. Move me to its location and it to
 *      my original location."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · [Hidden] [Action] [2] · "Move a unit from a battlefield to its base."
 *
 * Q: Do hidden cards have to target at the battlefield they are hidden at, and does their targeting text change
 *    while hidden?
 * A: Yes — the rules add a "Here" restriction to every hidden card when it is played from facedown, even though
 *    nothing on the card says so. Tideturner is the one exception: its own text names a unit at ANOTHER location,
 *    so it can never choose at its own battlefield.
 * Rules: 811.1.d.2 (a card played from a hidden state may only choose at that battlefield),
 *        355.8 (only legal choices are offered), 359.2 (the choice is made as the card is played).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P1's turn. P1 holds bf1 (two bodies) and bf2 (one body), plus a body at home. [2] in pool. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "One A" }, "onea")
    .unit(P1, "bf1", { might: 2, name: "One B" }, "oneb")
    .unit(P1, "bf2", { might: 2, name: "Two" }, "two")
    .unit(P1, "base", { might: 2, name: "Homey" }, "homey")
    .unit(P2, "base", { might: 2, name: "Their Body" }, "theirs");
}

const pickCards = (game: Game): (string | undefined)[] => {
  const d = game.decision();
  return d?.kind === "pick" ? (d as PickDecision).options.map((o) => o.card) : [];
};

describe("Ruling 74f18694e4dafe23 — hidden cards are restricted to 'Here'; Tideturner is the exception", () => {
  test("a Fight or Flight revealed from bf1 may only choose at bf1 — the bf2 body is not on the menu, though the printed text says 'a unit at a battlefield'", async () => {
    const game = await board().facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof").build();
    await game.p1.reveal("fof");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickCards(game).toSorted()).toEqual(["onea", "oneb"]);
    expect(pickCards(game)).not.toContain("two");
  });

  test("control — the very same card cast from HAND has no such restriction: units at both battlefields are legal targets", async () => {
    const game = await board().hand(P1, FIGHT_OR_FLIGHT, "fofhand").build();
    const targets = (game.p1.option("cast", "fofhand")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets.toSorted()).toEqual(["onea", "oneb", "two"]);
  });

  test("Tideturner is the exception: revealed at bf2, its partner may NOT be a unit at bf2 — only units elsewhere are offered", async () => {
    const game = await board().facedown(P1, "bf2", TIDETURNER, "tide").build();
    await game.p1.reveal("tide");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // "you may choose…"
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickCards(game)).not.toContain("two"); // its own location is excluded
    expect(pickCards(game).toSorted()).toEqual(["homey", "onea", "oneb"]);
  });

  test("… and the swap happens across locations: Tideturner ends up where the chosen unit was, and that unit at bf2", async () => {
    const game = await board().facedown(P1, "bf2", TIDETURNER, "tide").build();
    await game.p1.reveal("tide");
    await game.p1.yes();
    await game.p1.pick("onea");
    await game.settle();
    expect(game.locationOf("tide")).toBe("bf1");
    expect(game.locationOf("onea")).toBe("bf2");
    expect(game.locationOf("two")).toBe("bf2"); // untouched
    expect(game.violations()).toEqual([]);
  });

  test("declining Tideturner's optional swap leaves it where it was revealed", async () => {
    const game = await board().facedown(P1, "bf2", TIDETURNER, "tide").build();
    await game.p1.reveal("tide");
    await game.p1.no();
    await game.settle();
    expect(game.locationOf("tide")).toBe("bf2");
    expect(game.locationOf("onea")).toBe("bf1");
  });
});

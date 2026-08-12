/**
 * Ruling 779ea5ae65dde7d1 — Fight or Flight (OGN-168 → ogn-168-298) · Spell · Chaos · [2] · [Action] [Hidden]
 *     "Move a unit from a battlefield to its base."
 *
 * Q: Does Fight or Flight need a valid target?
 * A: Yes. "Move a unit from a battlefield to its base" targets that unit, so a legal choice must exist to put the
 *    spell on the chain, and the target is declared at that moment — before the opponent may react. With no unit
 *    at any battlefield the spell cannot be played at all. Units in a base are not "at a battlefield".
 * Rules: 352.7 / 355.8 (valid choices for all targets are required to put a spell on the chain),
 *        352.10 (mentioning a game object targets it), 355.9 (targets declared as it is put on the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P1's turn, two open battlefields, [2] in pool and Fight or Flight in hand. `occupied` seeds units at bf1. */
function board(occupied: boolean) {
  const s = scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 2, name: "Home Guard" }, "home")
    .unit(P2, "base", { might: 2, name: "Their Guard" }, "theirs")
    .hand(P1, FIGHT_OR_FLIGHT, "fof");
  if (occupied) {
    s.unit(P1, "bf1", { might: 3, name: "Outpost" }, "outpost");
  }
  return s;
}

const targetOptions = (game: Game): unknown[] =>
  (game.p1.option("cast", "fof")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();

describe("Ruling 779ea5ae65dde7d1 — Fight or Flight targets, so it needs a legal unit at a battlefield", () => {
  test("nothing at any battlefield: the spell is simply not playable, and naming a base unit is rejected", async () => {
    const game = await board(false).build();
    expect(game.p1.units("base")).toEqual(["home"]);
    expect(game.p1.can("cast", "fof")).toBe(false);
    expect((await game.p1.try((p) => p.cast("fof", { targets: "home" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("fof", { targets: "theirs" }))).ok).toBe(false);
    expect(game.p1.energy()).toBe(2); // nothing was paid
    expect(game.zoneOf("fof")).toBe("hand");
  });

  test("with a unit at bf1 it becomes playable — and ONLY that unit is offered (base units are not 'at a battlefield')", async () => {
    const game = await board(true).build();
    expect(game.p1.can("cast", "fof")).toBe(true);
    expect(targetOptions(game)).toEqual(["outpost"]);
    expect(targetOptions(game)).not.toContain("home");
    expect(targetOptions(game)).not.toContain("theirs");
  });

  test("the target is declared as it goes on the chain, before anyone may respond", async () => {
    const game = await board(true).build();
    await game.p1.cast("fof", { targets: "outpost" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", controller: P1, targets: ["outpost"] })]);
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.settle();
    expect(game.locationOf("outpost")).toBe("base");
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("a bare cast with no target argument is refused as ambiguous/illegal rather than silently picking one", async () => {
    const game = await board(false).build();
    expect((await game.p1.try((p) => p.cast("fof"))).ok).toBe(false);
  });
});

/**
 * Ruling 1f2aede9dec98c00 — Star-Crossed (UNL-128 → unl-128-219) · Chaos · [3] · [Reaction]
 *   "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Must I return one of my own units too, or may I choose only an enemy unit?
 * A: Both targets are mandatory — the text has no "up to", so a friendly unit AND an enemy unit must both be
 *    available and both be named as the spell is played. With no friendly unit on the board the spell cannot be
 *    played at all. Once it is on the chain, though, losing one target does not stop it: it resolves on the rest.
 * Rules: 355.8 (a spell needs legal targets for every target requirement to be played), 355.5 (two target roles),
 *        359.3.e.5 (targets re-checked on resolution; the remaining legal ones still get the effect).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";

/** P1's turn. P1 has a Squire at bf1; P2 has a Rival at bf1 and a Reserve in base. `friendly` = give P1 a unit. */
function board(friendly: boolean) {
  const s = scenario()
    .resources(P1, { energy: 3, power: { chaos: 3 } })
    .resources(P2, { energy: 3, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Rival" }, "rival")
    .unit(P2, "base", { might: 2, name: "Reserve" }, "reserve")
    .hand(P1, STAR_CROSSED, "sc");
  return friendly ? s.unit(P1, "bf1", { might: 2, name: "Squire" }, "squire") : s;
}

describe("Ruling 1f2aede9dec98c00 — Star-Crossed needs BOTH a friendly and an enemy unit; you cannot take only the enemy", () => {
  test("with no friendly unit on the board the spell cannot be played at all (355.8)", async () => {
    const game = await board(false).build();
    expect(game.p1.can("cast", "sc")).toBe(false);
    const only = await game.p1.try((p) => p.cast("sc", { targets: "rival" }));
    expect(only.ok).toBe(false);
    expect(game.zoneOf("sc")).toBe("hand");
    expect(game.p1.energy()).toBe(3); // nothing paid
  });

  test("with both present the play offers a two-role target pair and naming only the enemy is rejected", async () => {
    const game = await board(true).build();
    expect(game.p1.can("cast", "sc")).toBe(true);
    const field = game.p1.option("cast", "sc")?.fields.find((f) => f.name === "targets");
    expect(field?.options?.every((o) => Array.isArray(o) && o.length === 2)).toBe(true);
    expect((await game.p1.try((p) => p.cast("sc", { targets: "rival" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("sc", { targets: ["rival", "reserve"] }))).ok).toBe(false); // two enemies
    expect(game.zoneOf("sc")).toBe("hand");
  });

  test("ruling: played with both, it returns the friendly unit as well as the enemy one — the friendly return is not optional", async () => {
    const game = await board(true).build();
    await game.p1.cast("sc", { targets: ["squire", "rival"] });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("hand");
    expect(game.zoneOf("rival")).toBe("hand");
    expect(game.zoneOf("reserve")).toBe("base"); // untouched, still in P2's base
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("but once it is ON the chain, a target that goes away does not stop it — P2's own Star-Crossed bounces the Squire first, and P1's still returns the Rival", async () => {
    const game = await board(true).hand(P2, STAR_CROSSED, "sc2").build();
    await game.p1.cast("sc", { targets: ["squire", "rival"] });
    await game.p1.passPriority();
    // P2 answers with their own copy: their "friendly" is the Reserve, their "enemy" is P1's Squire.
    await game.p2.cast("sc2", { targets: ["reserve", "squire"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sc", "sc2"]);
    await game.settle();
    expect(game.zoneOf("squire")).toBe("hand"); // bounced by P2's copy
    expect(game.zoneOf("reserve")).toBe("hand");
    expect(game.zoneOf("rival")).toBe("hand"); // P1's spell still resolved on its surviving target
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});

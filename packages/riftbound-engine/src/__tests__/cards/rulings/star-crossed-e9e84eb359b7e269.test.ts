/**
 * Ruling e9e84eb359b7e269 — Star-Crossed (UNL-128 → unl-128-219) · Reaction · [3][chaos] · "Return a friendly unit and an enemy
 *     unit to their owners' hands."
 *   (Back to Back OGN-206 is cited as the precedent for "multiple required targets".)
 *
 * Q: Do I need BOTH targets to be able to play Star-Crossed?
 * A: Yes. Both the friendly unit and the enemy unit are required targets (no "up to"); without a valid one of each the spell
 *    cannot be played at all.
 * Rules: 355.10 (objects named in a spell's text are targets), 355.8 (a spell with no legal target set can't be played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";

/** P1's turn with exactly [3][chaos] and Star-Crossed in hand; units added per case. */
function base() {
  return scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, STAR_CROSSED, "sc");
}

describe("Ruling e9e84eb359b7e269 — Star-Crossed needs both a friendly AND an enemy unit to be playable", () => {
  test("only an ENEMY unit on the board (no friendly unit): Star-Crossed is not playable — not offered, and forcing it is refused", async () => {
    const game = await base().unit(P2, "base", { might: 3, name: "Foe" }, "foe").build();
    expect(game.p1.can("cast", "sc")).toBe(false);
    const r = await game.p1.try((p) => p.cast("sc", { targets: ["foe"] }));
    expect(r.ok).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sc")).toBe("hand");
    expect(game.p1.energy()).toBe(3);
  });

  test("only a FRIENDLY unit on the board (no enemy unit): likewise not playable", async () => {
    const game = await base().unit(P1, "base", { might: 3, name: "Friend" }, "friend").build();
    expect(game.p1.can("cast", "sc")).toBe(false);
    const r = await game.p1.try((p) => p.cast("sc", { targets: ["friend"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("friend")).toBe("base");
    expect(game.zoneOf("sc")).toBe("hand");
  });

  test("no units at all: not playable", async () => {
    const game = await base().build();
    expect(game.p1.can("cast", "sc")).toBe(false);
  });

  test("with one of each it IS playable: targets [friendly, enemy] are both required on the cast, and on resolution both go back to their owners' hands", async () => {
    const game = await base()
      .unit(P1, "base", { might: 3, name: "Friend" }, "friend")
      .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
      .build();
    expect(game.p1.can("cast", "sc")).toBe(true);
    const targets = game.p1.option("cast", "sc")?.fields.find((f) => f.name === "targets");
    expect(targets?.required).toBe(true);
    expect(targets?.options).toEqual([["friend", "foe"]]); // the only legal set: one friendly + one enemy
    // A lone target is not a legal way to cast it either.
    expect((await game.p1.try((p) => p.cast("sc", { targets: ["foe"] }))).ok).toBe(false);
    await game.p1.cast("sc", { targets: ["friend", "foe"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", targets: ["friend", "foe"] })]);
    await game.settle();
    expect(game.zoneOf("friend")).toBe("hand");
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.p1.hand()).toContain("friend");
    expect(game.p2.hand()).toContain("foe");
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});

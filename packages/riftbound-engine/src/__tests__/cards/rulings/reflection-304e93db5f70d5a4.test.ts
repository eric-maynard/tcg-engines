/**
 * Ruling 304e93db5f70d5a4 — Reflection (UNL-T06 → unl-t06) · 0-Might token ·
 *     "(I become a copy of something when played. I don't get that card's play effects.)"
 *   × Mirror Image (unl-200-219) · [3][rainbow][rainbow] · "Choose a unit. Play a ready Reflection unit token
 *     to your base. It becomes a copy of that unit. Give it [Temporary]."
 *   × Gust (ogn-169-298) · Reaction · [1] · "Return a unit at a battlefield with 3 [Might] or less to its
 *     owner's hand."
 *
 * Q: Do Reflections copy the buffs/Might increases on the card they copy, can they be reacted to before they
 *    copy, and can damage kill them at 0 Might first?
 * A: (1) No — only printed/copiable traits are copied; buffs and Might modifiers are neither. (2) Yes — the
 *    spell that makes the token sits on the chain, so opponents get a Reaction window before the copy
 *    happens. (3) Removing the chosen unit in that window makes the copy fail: the token stays a 0-Might
 *    Reflection.
 * Rules: 477.1 (copy effects take copiable traits only — printed or copied, never granted/appended),
 *        336/340 (a spell on the chain grants Reaction windows before it resolves), 359.3.e.5 (an effect
 *        whose chosen object is gone at resolution does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const GUST = "ogn-169-298";

/** P1's turn with exactly [3][rainbow][rainbow]; P2 holds bf1 with a 3-Might unit and Gust plus [1]. */
function board(buffed: boolean) {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Original" }, "original", buffed ? { buffed: true } : {})
    .hand(P1, MIRROR_IMAGE, "mirror")
    .hand(P2, GUST, "gust");
}

const reflection = (game: Game) => game.findAll({ owner: P1, zone: "base" })[0];

describe("Ruling 304e93db5f70d5a4 — Reflections copy printed traits only, and the copy can be spoiled in the Reaction window", () => {
  test("(1) the buff on the chosen unit is not copied: the Original is a 4 (3 + buff) but the Reflection enters as a 3", async () => {
    const game = await board(true).build();
    expect(game.state("original")).toMatchObject({ baseMight: 3, isBuffed: true, might: 4 });
    await game.p1.cast("mirror", { targets: "original" });
    await game.settle();
    const token = reflection(game);
    expect(game.zoneOf(token)).toBe("base");
    expect(game.state(token)).toMatchObject({ isBuffed: false, might: 3 });
    expect(game.state(token).keywords).toContain("Temporary");
    expect(game.violations()).toEqual([]);
  });

  test("(2) the copy can be reacted to: while Mirror Image is on the chain P2 has priority and Gust is legal", async () => {
    const game = await board(false).build();
    await game.p1.cast("mirror", { targets: "original" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["mirror"]);
    expect(reflection(game)).toBeUndefined(); // nothing has been created yet
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
  });

  test("(3) Gusting the chosen unit away in that window makes the copy fail: the token is left a 0-Might Reflection", async () => {
    const game = await board(false).build();
    await game.p1.cast("mirror", { targets: "original" });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "original" });
    await game.settle();
    expect(game.zoneOf("original")).toBe("hand");
    const token = reflection(game);
    expect(game.zoneOf(token)).toBe("base");
    expect(game.state(token).might).toBe(0); // never became a copy of anything
    expect(game.violations()).toEqual([]);
  });
});

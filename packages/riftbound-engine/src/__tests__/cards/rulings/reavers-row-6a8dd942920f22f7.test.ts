/**
 * Ruling 6a8dd942920f22f7 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *   "When you defend here, you may move a friendly unit here to base."
 *
 * Q: Can a player move their ready units out of a battlefield during the opponent's turn when a showdown starts there?
 * A: No — players cannot move units (even ready ones) during another player's turn. The exception is Reaver's Row,
 *    whose defend trigger moves exactly one unit.
 * Rules: 141/446 (the Standard Move is a discretionary action of the turn player in an Open State), 383.4.f (defend
 *        trigger), the Row's "a friendly unit" (one).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";

/** P2's turn. P1 holds `bf` (plain, or the live Row) with two READY units A (3) and B (2), plus an empty bf2 to flee to. P2's Raider (6) attacks. */
function board(row: boolean) {
  const s = scenario().active(P2);
  (row ? s.battlefield("bf", { controller: P1, def: REAVERS_ROW, inert: false }) : s.battlefield("bf", { controller: P1 }))
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf", { might: 3, name: "A" }, "a")
    .unit(P1, "bf", { might: 2, name: "B" }, "b")
    .unit(P2, "base", { might: 6, name: "Raider" }, "raider");
  return s;
}

const moveVerbs = (game: Game) => game.p1.legal().filter((o) => o.verb === "move" || o.verb === "gank" || o.verb === "recall").map((o) => o.key);

describe("Ruling 6a8dd942920f22f7 — no moving out of a showdown on the opponent's turn; Reaver's Row moves exactly one", () => {
  test("plain battlefield: A and B are ready, yet when the Raider attacks on P2's turn P1 has no move of any kind — not before Focus, not with Focus — and both must stay and fight", async () => {
    const game = await board(false).build();
    expect(game.state("a").isReady).toBe(true);
    expect(game.state("b").isReady).toBe(true);
    expect(moveVerbs(game)).toEqual([]); // P2's open state: not P1's turn
    await game.p2.move("raider", "bf");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(moveVerbs(game)).toEqual([]);
    const sneak = await game.p1.try((p) => p.move("a", "base"));
    expect(sneak.ok).toBe(false);
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // P1 holds Focus …
    expect(moveVerbs(game)).toEqual([]); // … and still cannot move
    expect((await game.p1.try((p) => p.move("b", "bf2"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.move(["a", "b"], "base"))).ok).toBe(false);
    await game.p1.passFocus();
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash"); // 6 vs 3+2: both defenders die
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.gameState.battlefields.bf?.controller).toBe(P2);
  });

  test("the exception — at Reaver's Row the defend trigger lets P1 move ONE friendly unit there to base (a single-target pick: A or B, max 1); the other stays", async () => {
    const game = await board(true).build();
    await game.p2.move("raider", "bf");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "bf", pendingChoiceType: "opt-in" }, timing: "FIN" });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1, semantics: "target", source: { cardId: "bf" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["a", "b"]);
    const both = await game.p1.try((p) => p.pick("a", "b"));
    expect(both.ok).toBe(false); // only one
    await game.p1.pick("b");
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("b")).toBe("base");
    expect(game.locationOf("a")).toBe("bf");
    expect(moveVerbs(game)).toEqual([]); // and still no ordinary move for A
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash"); // A (3) alone vs 6
    expect(game.state("b")).toMatchObject({ damage: 0, location: "base" });
    expect(game.gameState.battlefields.bf?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});

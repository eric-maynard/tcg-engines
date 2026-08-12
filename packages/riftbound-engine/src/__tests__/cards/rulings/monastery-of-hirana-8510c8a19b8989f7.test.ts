/**
 * Ruling 8510c8a19b8989f7 — Monastery of Hirana (OGN-282 → ogn-282-298) · Battlefield
 *   "When you conquer here, you may spend a buff to draw 1."
 *
 * Q: Can you spend several buffs on Monastery of Hirana when you conquer, to draw several cards?
 * A: No. The ability triggers ONCE per conquer and reads "a buff", not "buffs": one buff spent, one card drawn,
 *    however many buffed units you control.
 * Rules: 383 (one trigger per event), 355.10.d (the object set is what the text says — "a buff" is exactly one),
 *        383.3.a/b + 204.3.a (the "you may spend a buff to" cost is decided and paid at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const MONASTERY_OF_HIRANA = "ogn-282-298";

/** P1's turn. The Monastery is empty and uncontrolled; P1 has THREE buffed units to tempt with. */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .battlefield("mon", { controller: null, def: MONASTERY_OF_HIRANA, inert: false })
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner", { buffed: true })
    .unit(P1, "base", { might: 3, name: "Monk A" }, "monkA", { buffed: true })
    .unit(P1, "base", { might: 3, name: "Monk B" }, "monkB", { buffed: true });
}

const buffedCount = (game: Game) => ["runner", "monkA", "monkB"].filter((id) => game.state(id).isBuffed).length;

describe("Ruling 8510c8a19b8989f7 — the Monastery trigger spends ONE buff and draws ONE card per conquer", () => {
  test("conquering raises exactly one offer, and it belongs to the conquering player", async () => {
    const game = await board().build();
    expect(buffedCount(game)).toBe(3);
    await game.p1.move("runner", "mon");
    await game.settle();
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.source?.cardId).toBe("mon");
  });

  test("accepting draws exactly 1 and spends exactly 1 buff, with two buffed units left untouched", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    game.script(P1, ["yes", "monkA"]);
    await game.p1.move("runner", "mon");
    await game.settle();
    expect(game.p1.hand().length).toBe(handBefore + 1);
    expect(buffedCount(game)).toBe(2);
    expect(game.gameState.battlefields.mon?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("there is no second offer — the chain is empty and nothing more can be spent", async () => {
    const game = await board().build();
    game.script(P1, ["yes", "monkA"]);
    await game.p1.move("runner", "mon");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("declining costs nothing: no card drawn, every buff still there", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    game.script(P1, ["decline"]);
    await game.p1.move("runner", "mon");
    await game.settle();
    expect(game.p1.hand().length).toBe(handBefore);
    expect(buffedCount(game)).toBe(3);
  });
});

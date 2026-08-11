/**
 * Ruling 01e28429b9925108 — (general; the "each player kills one of their units" family, e.g. Cull the Weak OGN-209 → ogn-209-298 · 2+[order]
 *     "Each player kills one of their units.")
 *
 * Q: Can you play such a card if the player playing it does not have a unit?
 * A: Yes. Players do as much as they can: a player with no unit simply kills nothing, but the card is still playable and the other
 *    player(s) still kill one of theirs.
 * Rules: 359.3.e (perform as much of an instruction as possible), 355.10.e (per-player instructions choose on resolution, no play-time
 *        target is required).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";

/** P1's turn with exactly 2+[order] and Cull the Weak; `mine` P1 units and `theirs` P2 units, all 1-Might in base. */
function board(mine: number, theirs: number) {
  let b = scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, CULL_THE_WEAK, "cull");
  for (let i = 0; i < mine; i++) {
    b = b.unit(P1, "base", { might: 1, name: `Mine ${i}` }, `mine${i}`);
  }
  for (let i = 0; i < theirs; i++) {
    b = b.unit(P2, "base", { might: 1, name: `Theirs ${i}` }, `theirs${i}`);
  }
  return b;
}

/** Cast Cull the Weak and drive it to the open main phase; P2 answers its own kill pick with `p2Pick` when asked. */
async function cull(game: Game, p2Pick?: string): Promise<{ p2WasAsked: boolean }> {
  expect(game.p1.can("cast", "cull")).toBe(true);
  await game.p1.cast("cull");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  let p2WasAsked = false;
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick" && d.seat === P2) {
      p2WasAsked = true;
      expect(d.min).toBe(1); // P2, who HAS units, must kill one
      await game.p2.pick(p2Pick ?? d.options[0]!.key);
    } else if (d.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else {
      break;
    }
  }
  return { p2WasAsked };
}

describe("Ruling 01e28429b9925108 — 'each player kills one of their units' is playable even when its caster has no unit", () => {
  test("caster P1 has NO unit, P2 has one: Cull the Weak is castable, resolves, P2's unit dies, P1 loses nothing (there was nothing to kill)", async () => {
    const game = await board(0, 1).build();
    expect(game.p1.units("base")).toEqual([]);
    await cull(game);
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.zoneOf("theirs0")).toBe("trash");
    expect(game.p1.trash()).toEqual(["cull"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("caster has no unit, P2 has TWO: P2 still has to choose and kill one of its own (its decision), the other survives", async () => {
    const game = await board(0, 2).build();
    const { p2WasAsked } = await cull(game, "theirs1");
    expect(p2WasAsked).toBe(true);
    expect(game.zoneOf("theirs1")).toBe("trash");
    expect(game.zoneOf("theirs0")).toBe("base");
    expect(game.p1.trash()).toEqual(["cull"]);
  });

  test("mirror: the OPPONENT has no unit — still playable; only the caster's unit dies", async () => {
    const game = await board(1, 0).build();
    await cull(game);
    expect(game.zoneOf("mine0")).toBe("trash");
    expect(game.p2.trash()).toEqual([]);
    expect(game.zoneOf("cull")).toBe("trash");
  });

  test("nobody has a unit at all: the card can STILL be played — it resolves doing nothing and goes to the trash, cost spent", async () => {
    const game = await board(0, 0).build();
    await cull(game);
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.p1.trash()).toEqual(["cull"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });
});

/**
 * Ruling 1e9829e7a54e08f7 — Salvage (OGN-224 → ogn-224-298) · [Action] · Order · [2][order]
 *     "You may kill up to one gear. Draw 1."
 *
 * Q: After the errata to "up to one gear", can Salvage be played when there is no gear anywhere?
 * A: Yes. "Up to one" lets you choose ZERO gear, so the spell is playable with no gear in the game:
 *    play it, choose nothing, draw 1. Cards WITHOUT "up to" wording still need a legal target
 *    (rule 355.8) and stay unplayable.
 * Rules: 355.8 (a play needs a legal choice), 355.13 ("up to N" is satisfied by zero), 419.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SALVAGE = "ogn-224-298";
const PACK_OF_WONDERS = "ogn-181-298"; // a plain gear, used as the "there IS a gear" control

/** P1's main phase with exactly the [2][order] Salvage costs and Salvage in hand. */
function board() {
  return scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, SALVAGE, "salvage");
}

describe("Ruling 1e9829e7a54e08f7 — Salvage with no gear in the game: playable, kill nothing, still draw 1", () => {
  test("premise: there is no gear anywhere on the board", async () => {
    const game = await board().build();
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual([]);
  });

  test("ruling: Salvage is a legal play even with zero gear in the game", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "salvage")).toBe(true);
  });

  test("…it resolves, kills nothing, and draws 1 (hand: Salvage out, one card in)", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("salvage");
    await game.settle();
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.p1.hand().length).toBe(handBefore); // -1 Salvage, +1 drawn
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("control: with a gear on the board the empty set is STILL an offered choice (the kill is optional)", async () => {
    const game = await board().gear(P2, PACK_OF_WONDERS, "pack").build();
    const field = game.p1.option("cast", "salvage")?.fields.find((f) => f.arg === "targets");
    expect(field).toMatchObject({ min: 0, max: 1 });
    expect(field?.options).toEqual([[], ["pack"]]);
    const handBefore = game.p1.hand().length;
    await game.p1.cast("salvage", { targets: [] });
    await game.settle();
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.zoneOf("pack")).toBe("base"); // declined — the gear lives
    expect(game.p1.hand().length).toBe(handBefore);
  });

  test("control: choosing the gear kills it and still draws 1", async () => {
    const game = await board().gear(P2, PACK_OF_WONDERS, "pack").build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("salvage", { targets: "pack" });
    await game.settle();
    expect(game.zoneOf("pack")).toBe("trash");
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.p1.hand().length).toBe(handBefore);
    expect(game.violations()).toEqual([]);
  });
});

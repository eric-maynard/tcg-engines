/**
 * Ruling 28c120b0e18aab8e — Salvage (OGN-224 → ogn-224-298) · Action · [2][order]
 *   (errata'd text) "You may kill UP TO ONE gear. Draw 1."
 *
 * Q: Can Salvage be played with no target?
 * A: Yes. "Up to one" lets the caster choose zero gear, so the spell is playable purely for the
 *    "Draw 1" — even with no gear anywhere on the board. (Under the pre-errata "You may kill a gear"
 *    wording it needed a gear to exist before it could be put on the chain.)
 * Rules: 352.13 / 355.13 ("any number" / "up to N" may be zero, and zero needs no target),
 *        355.8 (a spell with a satisfiable target set is playable).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SALVAGE = "ogn-224-298";
const FILLER = "ogn-175-298";

/** P1's turn with exactly [2][order] and a known deck; `withGear` puts a Trinket on P2's board. */
function board(withGear: boolean) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .deck(P1, [FILLER, FILLER], ["d1", "d2"])
    .hand(P1, SALVAGE, "salvage");
  return withGear ? s.gear(P2, { cardType: "gear", energyCost: 1, name: "Trinket" }, "trinket") : s;
}

describe("Ruling 28c120b0e18aab8e — Salvage is playable with zero gear chosen", () => {
  test("with no gear anywhere, Salvage is still a legal play and its target field offers the EMPTY set", async () => {
    const game = await board(false).build();
    expect(game.p1.can("cast", "salvage")).toBe(true);
    const field = game.p1.option("cast", "salvage")?.fields.find((f) => f.name === "targets");
    expect(field?.min).toBe(0);
    expect(field?.options).toEqual([[]]);
  });

  test("ruling: it resolves for the draw alone — P1 draws 1, nothing is killed, and no pick is ever asked", async () => {
    const game = await board(false).build();
    const stop0 = await game.p1.cast("salvage");
    expect(stop0.ok).toBe(true);
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.zoneOf("salvage")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("with a gear on the board the caster may still choose zero — the Trinket survives and P1 draws anyway", async () => {
    const game = await board(true).build();
    const field = game.p1.option("cast", "salvage")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).map((o) => (Array.isArray(o) ? o : [o]))).toEqual([[], ["trinket"]]);
    await game.p1.cast("salvage", { targets: [] });
    await game.settle();
    expect(game.zoneOf("trinket")).toBe("base");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("salvage")).toBe("trash");
  });

  test("…and naming the gear still kills it, so the zero choice really is a choice", async () => {
    const game = await board(true).build();
    await game.p1.cast("salvage", { targets: "trinket" });
    await game.settle();
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations()).toEqual([]);
  });
});

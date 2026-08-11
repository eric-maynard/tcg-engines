/**
 * Interaction: Captain Farron (ogn-015-298) · Unit · Fury · 4 + [fury] · 5 Might
 *     "Other friendly units here have [Assault]."                       — CONTINUOUS (static)
 *   × Lord Broadmane (unl-012-219) · Unit · Fury · 5 + [fury] · 5 Might
 *     "[Ambush] … When you play me, give your other units here [Assault] this turn."  — ONE-SHOT
 *   × Pouty Poro (ogn-013-298) — "[Deflect] (Opponents must pay [rainbow] to choose me…)"
 *
 * Board: bf1 holds P1's Farron, P1's U and P2's E; P1's V waits in base.
 *
 * Question — the same three scope words ("other", "friendly/your", "here") on a continuous
 * grant and on a one-shot grant:
 *   (a) Under Farron alone, which of U / Farron / V / E have Assault?
 *   (b) P1 plays Lord Broadmane to bf1: whom does its play trigger affect, and does it TARGET
 *       anything (would a [Deflect] unit at bf1 tax it)? Does it still go on the chain when
 *       there is nobody to affect?
 *   (c) After Broadmane resolves, V walks base → bf1: does V have Assault, and from which source?
 *   (d) After Broadmane resolves, U ganks bf1 → bf2: does U keep Assault this turn?
 *   (e) Does E ever get Assault from either card?
 *
 * Expected:
 *  (a) U only. "Other" excludes Farron himself (053.1); "here" is Farron's OWN current location
 *      (053.3), so V in base is out; "friendly" excludes E (740.1.a / 740.1.b). The grant is a
 *      passive continuous effect in the keyword layer (477.1.c / 477.2.b) — re-evaluated from the
 *      current board every time, never snapshotted.
 *  (b) Farron and U — P1's OTHER units at bf1 when the trigger resolves. Broadmane is excluded by
 *      "other", V by "here", E by "your". It TARGETS NOTHING: the recipients are selected
 *      programmatically by their characteristics rather than chosen (355.10.d), so there is no
 *      target for [Deflect] to tax (no [rainbow] surcharge) and no per-unit legality check. 355.8's
 *      valid-choice gate never bites either: with no other friendly unit "here" the trigger still
 *      goes on the chain and simply affects nobody.
 *  (c) V has Assault from FARRON but NOT from Broadmane. Farron's static re-reads "here"
 *      continuously (477.2.b), so V gains it the instant it arrives. Broadmane's grant was applied
 *      once at resolution with the stated duration "this turn"; a non-passive effect is applied and
 *      then held at that level (477.3.b), so a later arrival is not retroactively included.
 *  (d) YES — U keeps Broadmane's Assault at bf2 for the rest of the turn while losing Farron's.
 *      Broadmane's instruction used "here" only to pick the recipients once; the resulting grant
 *      carries its own stated duration (801.3.a.3 supplies one only when none is stated) and is not
 *      location-conditioned afterwards. Farron's is location-conditioned for as long as it applies.
 *      Same three words, opposite behaviour on the same unit in the same turn.
 *  (e) Never. "Friendly" (Farron, 740.1.a) and "your" (Broadmane) both exclude E in a 1v1; the two
 *      words only diverge in 2v2, where "friendly" reaches a teammate's units and "your" does not.
 *
 * Rules: 053.1 (other), 053.3 (here), 355.8, 355.10.d, 477.1.c, 477.2.b, 477.3.b, 740.1.a,
 *        740.1.b, 801.3.a.3, 807.1.b.3 (bare [Assault] = 1), 822.1 ([Ambush]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FARRON = "ogn-015-298";
const BROADMANE = "unl-012-219";
const POUTY_PORO = "ogn-013-298"; // [Deflect]

/** Broadmane's one-shot grant: `duration: "turn"`. */
function hasTurnAssault(game: Game, alias: string): boolean {
  return game.state(alias).grantedKeywords.some((k) => k.keyword === "Assault" && k.duration === "turn");
}
/** Farron's continuous grant: re-applied every static recalculation with `duration: "static"`. */
function hasStaticAssault(game: Game, alias: string): boolean {
  return game.state(alias).grantedKeywords.some((k) => k.keyword === "Assault" && k.duration === "static");
}

/**
 * bf1: P1's Farron + P1's U (Ganking, so it can walk out to bf2 later) + P2's E.
 * base: P1's V. P1 holds Lord Broadmane with [5]+[fury] and a spare [rainbow] to prove no
 * [Deflect] surcharge is ever charged. `r1` is a channeled rune — tapping it is a cheap move that
 * forces a state-based static recalculation (statics are not recalculated at scenario build).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1, rainbow: 1 } })
    .rune(P1, "fury", { alias: "r1" })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", FARRON, "farron")
    .unit(P1, "bf1", { keywords: ["Ganking"], might: 2, name: "U" }, "u")
    .unit(P1, "base", { might: 2, name: "V" }, "v")
    .unit(P2, "bf1", { might: 2, name: "E" }, "e")
    .hand(P1, BROADMANE, "lb");
}

describe("Broadmane's one-shot 'here' vs Farron's continuous 'here'", () => {
  test("(a)+(e) Farron alone grants Assault to U only — not himself (other), not V (here), not E (friendly)", async () => {
    const game = await board().build();
    await game.p1.tapRune("r1"); // any move → static recalculation
    expect(hasStaticAssault(game, "u")).toBe(true);
    expect(game.state("u").keywords).toContain("Assault");
    expect(hasStaticAssault(game, "farron")).toBe(false); // 053.1 "other"
    expect(hasStaticAssault(game, "v")).toBe(false); // 053.3 "here" = Farron's own location
    expect(hasStaticAssault(game, "e")).toBe(false); // 740.1.a "friendly"
    expect(game.state("e").keywords).not.toContain("Assault");
    expect(game.violations()).toEqual([]);
  });

  test("(b)+(e) Broadmane's play trigger hits Farron and U only — not itself, not V in base, not enemy E", async () => {
    const game = await board().build();
    await game.p1.play("lb", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("lb")).toBe("bf1");
    expect(hasTurnAssault(game, "farron")).toBe(true); // Farron is one of "your other units here"
    expect(hasTurnAssault(game, "u")).toBe(true);
    expect(hasTurnAssault(game, "lb")).toBe(false); // "other"
    expect(hasTurnAssault(game, "v")).toBe(false); // "here"
    expect(hasTurnAssault(game, "e")).toBe(false); // "your"
    expect(game.state("e").keywords).not.toContain("Assault");
  });

  test("(b) the trigger TARGETS NOTHING (355.10.d): no target prompt, and an enemy [Deflect] unit at bf1 levies no [rainbow] surcharge", async () => {
    const game = await board().unit(P2, "bf1", POUTY_PORO, "poro").build();
    expect(game.state("poro").keywords).toContain("Deflect");
    await game.p1.play("lb", { to: "bf1" });
    // The play effect is on the chain; nothing is asked of P1 (a chosen target would be a FIN pick).
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lb", controller: P1, triggered: true })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
    // Only the printed cost was paid — no [Deflect] surcharge (809.1.c never engages: nothing was chosen).
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 1 } });
    await game.settle();
    expect(hasTurnAssault(game, "poro")).toBe(false);
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("(b) 355.8 does not gate it: with no other friendly unit 'here' the trigger still goes on the chain and affects nobody", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .unit(P2, "base", { might: 2 }, "theirs")
      .hand(P1, BROADMANE, "lb")
      .build();
    await game.p1.play("lb", { to: "base" }); // P1's only unit in base
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lb", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("lb")).toBe("base");
    expect(hasTurnAssault(game, "theirs")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(c) V arriving after Broadmane resolved gains Farron's continuous Assault but NOT Broadmane's 'this turn' grant", async () => {
    const game = await board().build();
    await game.p1.play("lb", { to: "bf1" });
    await game.settle();
    expect(hasTurnAssault(game, "v")).toBe(false); // in base at resolution
    await game.p1.move("v", "bf1");
    expect(game.locationOf("v")).toBe("bf1");
    expect(hasStaticAssault(game, "v")).toBe(true); // 477.2.b — re-read from the current board
    expect(game.state("v").keywords).toContain("Assault");
    expect(hasTurnAssault(game, "v")).toBe(false); // 477.3.b — applied once, held at that level
  });

  test("(d) U ganking out to bf2 keeps Broadmane's 'this turn' Assault and loses Farron's location-conditioned one", async () => {
    const game = await board().build();
    await game.p1.play("lb", { to: "bf1" });
    await game.settle();
    expect(hasTurnAssault(game, "u")).toBe(true);
    expect(hasStaticAssault(game, "u")).toBe(true);
    await game.p1.gank("u", "bf2");
    expect(game.locationOf("u")).toBe("bf2");
    expect(hasTurnAssault(game, "u")).toBe(true); // 801.3.a.3 — stated duration, not location-bound
    expect(hasStaticAssault(game, "u")).toBe(false); // no longer "here" for Farron
    expect(game.state("u").keywords).toContain("Assault");
  });

  test("(d) and it really expires with the turn, not with the location", async () => {
    const game = await board().build();
    await game.p1.play("lb", { to: "bf1" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(hasTurnAssault(game, "u")).toBe(false);
    expect(hasStaticAssault(game, "u")).toBe(true); // Farron's is still live — it is not a duration
  });
});

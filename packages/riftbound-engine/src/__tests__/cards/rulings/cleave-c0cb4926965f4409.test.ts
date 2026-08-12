/**
 * Ruling c0cb4926965f4409 — Cleave (OGN-004 → ogn-004-298) · Spell · Fury · [1][fury] · [Action]
 *   "Give a unit [Assault 3] this turn."
 *   × Hand of Noxus (ogn-253-298) · Legend — "[Legion] — [Exhaust]: [Reaction] — [Add] [1]." (the oracle:
 *     the ability is usable only while you have played another card this turn)
 *   × Gust (ogn-169-298) / Defy (ogn-045-298) — the answers that take the target away or counter the spell.
 *
 * Q: If a spell loses its target (the target is removed in response), does it still count towards [Legion]?
 * A: Yes — a spell that loses its target was still played, so [Legion] is on. (The ruling adds that a
 *    COUNTERED spell does not count; see the RULING-CONFLICT facet below.) You cannot play Cleave with no
 *    legal target just to switch [Legion] on, but a spell whose targets are all "up to" may be played with
 *    zero and still counts.
 * Rules: 419.4.b/812.1.c (a card Finalized by you counts as played this turn, counters notwithstanding),
 *        355.8 (no legal target ⇒ the play is not offered), 359.3.e.5 (a lost target simply does nothing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const HAND_OF_NOXUS = "ogn-253-298";
const GUST = "ogn-169-298";
const DEFY = "ogn-045-298";
const SHURIKEN_FLIP = "ven-140-166"; // "Deal 2 to UP TO ONE enemy unit …"

/** P1's turn. P1's Legend is the [Legion] oracle; P2 holds the answers. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2, rainbow: 1 } })
    .resources(P2, { energy: 3, power: { calm: 1, chaos: 1 } })
    .legend(P1, HAND_OF_NOXUS, "noxus")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, GUST, "gust")
    .hand(P2, DEFY, "defy");
}

/** [Legion] is on iff the Legend's [Legion]-gated ability is available. */
const legionOn = (game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) => game.p1.can("activate", "noxus");

describe("Ruling c0cb4926965f4409 — what counts as 'played' for [Legion]", () => {
  test("baseline: with nothing played yet, [Legion] is off", async () => {
    const game = await board().build();
    expect(legionOn(game)).toBe(false);
  });

  test("ruling: a spell that LOSES its target was still played — [Legion] is on", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "foe" }); // the target leaves the battlefield
    await game.settle();

    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(legionOn(game)).toBe(true);
  });

  // RULING-CONFLICT: riftjudge c0cb4926965f4409 says a countered spell does NOT count towards [Legion];
  // CR 419.4.b + 812.1.c say a countered card was still Finalized by you, so every non-triggered
  // "cards played this turn" check (Legion included) still counts it — 419.4.b's own example is a
  // Defy-countered spell leaving Legion active. Engine follows CR.
  test("RULING-CONFLICT: a Defy-countered Cleave still counts as played, so [Legion] stays on", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cleave" });
    await game.settle();

    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("foe").grantedKeywords.map((k) => k.keyword)).not.toContain("Assault"); // countered
    expect(legionOn(game)).toBe(true);
  });

  test("nuance: you cannot play Cleave with no legal target just to switch [Legion] on", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 2 } })
      .legend(P1, HAND_OF_NOXUS, "noxus")
      .battlefield("bf1", { controller: null })
      .hand(P1, CLEAVE, "cleave")
      .build();
    expect(game.p1.units().length).toBe(0);
    expect(game.p2.units().length).toBe(0);
    expect(game.p1.can("cast", "cleave")).toBe(false);
    const r = await game.p1.try((p) => p.cast("cleave", { targets: "foe" }));
    expect(r.ok).toBe(false);
    expect(game.p1.can("activate", "noxus")).toBe(false);
  });

  test("nuance: a spell whose targeting is all 'up to' may be played choosing zero — and it counts for [Legion]", async () => {
    const game = await board().hand(P1, SHURIKEN_FLIP, "flip").build();
    await game.p1.cast("flip", { targets: [] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["flip"]);
    expect(legionOn(game)).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});

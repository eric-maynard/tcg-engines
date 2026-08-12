/**
 * Ruling 910abd833731acb7 — [Legion] and a COUNTERED first spell.
 *   Cards: Hand of Noxus (OGN-253 → ogn-253-298) legend "[Exhaust]: [Reaction], [Legion][>] [Add] [1]" (the
 *     [Legion] oracle — usable only while you have played another card this turn)
 *   × Noxus Hopeful (OGN-012 → ogn-012-298) unit, 4 "[Legion][>] I cost [2] less"
 *   × Wind Wall (OGN-064 → ogn-064-298) "[Reaction] Counter a spell."
 *   × Cleave (OGN-004 → ogn-004-298) as the first spell played.
 *
 * Q: If my first spell of the turn is countered, has it been "played" for [Legion]?
 * A (riftjudge): no — a countered spell does not count, even when it was your first card that turn.
 * ENGINE / CR: yes it counts. 812.1.c turns [Legion] on "as long as a card different than the one with
 *    the Legion ability has been FINALIZED by you on the same turn"; 419.4.b keeps a countered play in
 *    every non-triggered "cards played this turn" tally. Same question as sibling ruling
 *    c0cb4926965f4409 (cleave-c0cb4926965f4409.test.ts), which is already settled against the ruling.
 * Rules: 812.1.b.1/812.1.c ([Legion]), 419.4.b (a countered card was still played), 425.1 (countering).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HAND_OF_NOXUS = "ogn-253-298";
const NOXUS_HOPEFUL = "ogn-012-298";
const WIND_WALL = "ogn-064-298";
const CLEAVE = "ogn-004-298";

/** P1's turn: the [Legion] legend, Cleave as the first spell, Noxus Hopeful behind it. P2 holds Wind Wall. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 2 } })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .legend(P1, HAND_OF_NOXUS, "noxus")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, NOXUS_HOPEFUL, "hopeful")
    .hand(P2, WIND_WALL, "windwall");
}

/** [Legion] is on iff the Legend's [Legion]-gated ability is available. */
const legionOn = (game: Game) => game.p1.can("activate", "noxus");

describe("Ruling 910abd833731acb7 — a countered first spell and [Legion]", () => {
  test("baseline: before anything is played [Legion] is off and Noxus Hopeful costs its printed 4", async () => {
    const game = await board().build();
    expect(legionOn(game)).toBe(false);
    expect(game.state("hopeful").energyCost).toBe(4);
  });

  test("the first spell goes on the chain and P2 counters it — the spell never resolves", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.cast("windwall", { targets: "cleave" });
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    // countered ⇒ its own effect did not happen
    expect(game.state("foe").grantedKeywords.map((k) => k.keyword)).not.toContain("Assault");
  });

  // RULING-CONFLICT: riftjudge 910abd833731acb7 says a countered spell was never "played", so it does not
  // switch [Legion] on. CR 812.1.c keys [Legion] to a card having been FINALIZED by you this turn, and
  // 419.4.b keeps a countered play in the non-triggered "cards played this turn" tally — engine follows CR.
  // Settled already by sibling ruling c0cb4926965f4409; do not flip back.
  test("RULING-CONFLICT: the countered Cleave still counts — [Legion] turns on", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.cast("windwall", { targets: "cleave" });
    await game.settle();
    expect(legionOn(game)).toBe(true);
  });

  test("RULING-CONFLICT: and the [Legion] cost reduction applies — Noxus Hopeful costs 2, not 4", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "foe" });
    await game.p1.passPriority();
    await game.p2.cast("windwall", { targets: "cleave" });
    await game.settle();
    const energyBefore = game.p1.energy();
    await game.p1.play("hopeful");
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("base");
    expect(game.p1.energy()).toBe(energyBefore - 2);
  });

  test("control: the opponent's Wind Wall is THEIR play, not P1's — it alone would not switch P1's [Legion] on", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 2 } })
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .legend(P1, HAND_OF_NOXUS, "noxus")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .hand(P1, NOXUS_HOPEFUL, "hopeful")
      .build();
    expect(legionOn(game)).toBe(false);
    expect(game.state("hopeful").energyCost).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});

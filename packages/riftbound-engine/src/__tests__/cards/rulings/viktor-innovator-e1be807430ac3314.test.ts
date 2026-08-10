/**
 * Ruling e1be807430ac3314 — Viktor, Innovator (OGN-117 → ogn-117-298) · [4]+[mind] · 3 Might
 *     "When you play a card on an opponent's turn, play a 1 [Might] Recruit unit token in your base."
 *   × Miss Fortune, Buccaneer (OGN-193 → ogn-193-298) · 4 Might
 *     "You may play me to an open battlefield. Friendly units may be played to open battlefields."
 *
 * Q: Can Viktor's Recruit token enter at an open battlefield through Miss Fortune's permission instead of the base?
 * A: No. Viktor specifies the token is created "in your base"; a location named by the creating effect takes precedence
 *    over effects that widen where units may be played. The Recruit is created in base.
 * Rules: 186 (tokens), 419.3 / 354 (an effect that plays a card to a stated location), 366 (play permissions widen
 *        options only where a choice exists).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VIKTOR = "ogn-117-298";
const MF_BUCCANEER = "ogn-193-298";
const DISCIPLINE = "ogn-058-298"; // Reaction [2] "Give a unit +2 [Might] this turn. Draw 1."
/** A 1-cost spell for P2 to open a chain on P2's own turn. */
const POKE = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Poke",
  timing: "action",
} as const;

/** P2's turn. P1: Viktor + Miss Fortune, Buccaneer in base, holds bf1 with a Holder; bf2 is OPEN (no units, no controller). */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", VIKTOR, "viktor")
    .unit(P1, "base", MF_BUCCANEER, "mf")
    .unit(P2, "base", { might: 3, name: "Idle" }, "idle")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, POKE, "poke");
}

const recruits = (game: Game) => game.findAll({ owner: P1 }).filter((id) => game.has(id) && game.state(id).isToken && game.state(id).name === "Recruit");

describe("Ruling e1be807430ac3314 — Viktor's Recruit is created in base even with Miss Fortune, Buccaneer's open-battlefield permission", () => {
  test("premise: Miss Fortune's permission is live — on P1's own turn a hand unit IS offered the open bf2 as a play location", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", MF_BUCCANEER, "mf")
      .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Grunt" }, "grunt")
      .build();
    const locs = (game.p1.option("play", "grunt")?.fields.find((f) => f.arg === "to" || f.name === "location")?.options ?? []) as string[];
    expect(locs.some((l) => String(l).includes("bf2"))).toBe(true);
    await game.p1.play("grunt", { to: "bf2" });
    await game.settle();
    expect(game.locationOf("grunt")).toBe("bf2");
  });

  test("P1 plays Discipline on P2's turn → Viktor triggers → the Recruit token appears in P1's BASE: no destination prompt ever offers bf1/bf2, and nothing lands at the open battlefield", async () => {
    const game = await board().script(P1, [], { strict: true }).build();
    // P2 casts a spell on P2's own turn and passes priority → P1 may respond with the Reaction Discipline.
    await game.p2.cast("poke", { targets: "idle" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "discipline")).toBe(true);
    await game.p1.cast("discipline", { targets: "viktor" });
    // Strict P1: any choose-destination prompt for the token would throw UNSCRIPTED_DECISION during settle().
    await game.settle();
    expect(game.zoneOf("discipline")).toBe("trash");
    const toks = recruits(game);
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ controller: P1, isToken: true, might: 1, zone: "base" });
    expect(game.locationOf(toks[0]!)).toBe("base");
    expect(game.p1.units("bf2")).toEqual([]);
    expect(game.p1.units("bf1")).toEqual(["holder"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling 326edb46daba62d2 — Spirit's Refuge (OGN-063 → ogn-063-298)
 *   "When you play this, buff a friendly unit. Friendly buffed units have [Deflect] if they didn't already."
 *   × Allay, Eager Admirer (UNL-041 → unl-041-219) — an unrestricted Deflect grant
 *   × a Bird token (unl-t02) — printed [Deflect]
 *   × Void Seeker (OGN-024 → ogn-024-298) "Deal 4 to a unit at a battlefield. Draw 1." (the taxed spell)
 *
 * Q: Does Deflect stack when several sources grant it to the same unit?
 * A: In general yes. Spirit's Refuge is the written exception: "if they didn't already" means it adds
 *    nothing to a unit that already has Deflect — from its own second copy, or from a printed
 *    Deflect. A grant from another, unrestricted source does stack on top of it.
 * Rules: 809.1.b.3, 809.1.c (the surcharge), 809.2 (values sum), 741 (a grant conditioned on the
 *        object not already having the keyword).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPIRITS_REFUGE = "ogn-063-298";
const ALLAY = "unl-041-219";
const BIRD = "unl-t02";
const VOID_SEEKER = "ogn-024-298";

const SPARE = 4;

function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1, mind: SPARE } })
    .battlefield("bf1", { controller: P1 })
    .hand(P2, VOID_SEEKER, "voidSeeker");
}

/** Cast Void Seeker at `target`; return the Power spent beyond its own [fury] pip. */
async function surcharge(game: Game, target: string): Promise<number> {
  await game.p2.cast("voidSeeker", { targets: target });
  return SPARE - game.p2.power("mind");
}

describe("Ruling 326edb46daba62d2 — Spirit's Refuge's 'if they didn't already' blocks it from stacking", () => {
  test("one Spirit's Refuge grants Deflect to a buffed friendly unit: +1 Power to choose it", async () => {
    const game = await board()
      .unit(P1, "bf1", { might: 5, name: "Hero" }, "hero", { buffed: true })
      .gear(P1, SPIRITS_REFUGE, "refuge")
      .build();
    expect(game.state("hero").keywords).toContain("Deflect");
    expect(await surcharge(game, "hero")).toBe(1);
  });

  test("an UNBUFFED unit gets nothing from it — the grant is conditioned on being buffed", async () => {
    const game = await board()
      .unit(P1, "bf1", { might: 5, name: "Plain" }, "plain")
      .gear(P1, SPIRITS_REFUGE, "refuge")
      .build();
    expect(game.state("plain").keywords).not.toContain("Deflect");
    expect(await surcharge(game, "plain")).toBe(0);
  });

  test("a SECOND Spirit's Refuge adds nothing: the buffed unit is still Deflect 1", async () => {
    const game = await board()
      .unit(P1, "bf1", { might: 5, name: "Hero" }, "hero", { buffed: true })
      .gear(P1, SPIRITS_REFUGE, "refuge1")
      .gear(P1, SPIRITS_REFUGE, "refuge2")
      .build();
    expect(await surcharge(game, "hero")).toBe(1);
  });

  test("it also adds nothing to a unit that already PRINTS Deflect: a buffed Bird stays at 1", async () => {
    const game = await board()
      .unit(P1, "bf1", BIRD, "bird", { buffed: true })
      .gear(P1, SPIRITS_REFUGE, "refuge")
      .build();
    expect(game.state("bird").keywords).toContain("Deflect");
    expect(await surcharge(game, "bird")).toBe(1);
  });

  test("a different, unrestricted source DOES stack on top: Bird (printed) + Allay = 2, and adding Spirit's Refuge leaves it at 2", async () => {
    const two = await board().unit(P1, "bf1", ALLAY, "allay").unit(P1, "bf1", BIRD, "bird").build();
    expect(await surcharge(two, "bird")).toBe(2);

    const stillTwo = await board()
      .unit(P1, "bf1", ALLAY, "allay")
      .unit(P1, "bf1", BIRD, "bird", { buffed: true })
      .gear(P1, SPIRITS_REFUGE, "refuge")
      .build();
    expect(await surcharge(stillTwo, "bird")).toBe(2);
    expect(stillTwo.violations()).toEqual([]);
  });
});

/**
 * Ruling 30661d136ead31ef — (no specific card) does [Deflect] from several sources stack?
 *   Exercised with Allay, Eager Admirer (UNL-041 → unl-041-219) "While I'm at a battlefield, your
 *   other units here have [Deflect]", a Bird token (unl-t02, printed [Deflect]),
 *   Spirit's Refuge (OGN-063 → ogn-063-298) "Friendly buffed units have [Deflect] if they didn't
 *   already", and Void Seeker (OGN-024 → ogn-024-298) "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: Do multiple instances of [Deflect] stack, so the opponent must spend extra Power per instance?
 * A: Yes — like [Assault] or [Shield], Deflect values sum, and the opponent pays the total as an
 *    additional cost to choose that unit. Spirit's Refuge is the exception: its "if they didn't
 *    already" wording means it never adds a second instance on its own.
 * Rules: 809.1.b.3 (bare Deflect = 1), 809.1.c/809.2 (surcharge, summed), 356.2.a.2 (mandatory
 *        additional cost). Sibling coverage: interactions/allay-bird-deflect-stacks-to-two.test.ts.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALLAY = "unl-041-219";
const BIRD = "unl-t02";
const SPIRITS_REFUGE = "ogn-063-298";
const VOID_SEEKER = "ogn-024-298"; // 3 Energy + [fury]

const SPARE = 4; // off-domain Power P2 keeps around to pay Deflect surcharges

/** P2's turn, P2 holds Void Seeker with exactly Void Seeker's cost plus 4 spare Power. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1, mind: SPARE } })
    .battlefield("bf1", { controller: P1 })
    .hand(P2, VOID_SEEKER, "voidSeeker");
}

/** Cast Void Seeker at `target` and report the Power spent beyond its own [fury] pip. */
async function surcharge(game: Game, target: string): Promise<number> {
  await game.p2.cast("voidSeeker", { targets: target });
  expect(game.p2.energy()).toBe(0);
  expect(game.p2.power("fury")).toBe(0);
  return SPARE - game.p2.power("mind");
}

describe("Ruling 30661d136ead31ef — Deflect values from different sources sum", () => {
  test("one source = +1 Power: Allay's grant alone taxes a plain unit by 1", async () => {
    const game = await board().unit(P1, "bf1", ALLAY, "allay").unit(P1, "bf1", { might: 4, name: "Ally" }, "ally").build();
    expect(game.state("ally").grantedKeywords.map((k) => k.keyword)).toEqual(["Deflect"]);
    expect(await surcharge(game, "ally")).toBe(1);
  });

  test("two sources = +2 Power: a Bird's PRINTED Deflect plus Allay's granted one", async () => {
    const game = await board().unit(P1, "bf1", ALLAY, "allay").unit(P1, "bf1", BIRD, "bird").build();
    expect(game.state("bird").keywords).toContain("Deflect"); // printed
    expect(game.state("bird").grantedKeywords.map((k) => k.keyword)).toContain("Deflect"); // granted
    expect(await surcharge(game, "bird")).toBe(2);
  });

  test("the stacked surcharge is a real cost: with only 1 spare Power the double-Deflect Bird is not a legal target, while Allay (Deflect 1) still is", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 1, mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", ALLAY, "allay")
      .unit(P1, "bf1", BIRD, "bird")
      .hand(P2, VOID_SEEKER, "voidSeeker")
      .build();
    const denied = await game.p2.try((p) => p.cast("voidSeeker", { targets: "bird" }));
    expect(denied.ok).toBe(false);
    expect(game.zoneOf("voidSeeker")).toBe("hand");
    await game.p2.cast("voidSeeker", { targets: "allay" }); // Allay's own Deflect is only 1
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
  });

  test("Spirit's Refuge is the exception: two copies of it grant only ONE instance to a buffed unit (+1, not +2)", async () => {
    const game = await board()
      .unit(P1, "bf1", { might: 5, name: "Hero" }, "hero", { buffed: true })
      .gear(P1, SPIRITS_REFUGE, "refuge1")
      .gear(P1, SPIRITS_REFUGE, "refuge2")
      .build();
    expect(await surcharge(game, "hero")).toBe(1);
  });

  test("…but Spirit's Refuge stacks with a DIFFERENT source: Refuge + Allay on a buffed unit taxes 2", async () => {
    const game = await board()
      .unit(P1, "bf1", ALLAY, "allay")
      .unit(P1, "bf1", { might: 5, name: "Hero" }, "hero", { buffed: true })
      .gear(P1, SPIRITS_REFUGE, "refuge")
      .build();
    expect(await surcharge(game, "hero")).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});

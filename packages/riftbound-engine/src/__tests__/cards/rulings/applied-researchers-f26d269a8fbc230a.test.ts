/**
 * Ruling f26d269a8fbc230a — Applied Researchers (VEN-055 → ven-055-166) · 4 Might · "[Empower] [3] … [Empowered] Your spells
 *     cost [1][rainbow] less, to a minimum of [1]."
 *   × Vex, Cheerless (SFD-146 → sfd-146-221, same discount wording) · Ezreal, Prodigy (SFD-149 → sfd-149-221) "Optional
 *     additional costs you pay cost [1] or [rainbow] less."   × [Deflect]: opponents must pay [rainbow] to choose the unit.
 *
 * Q: Does Applied Researchers reduce the Deflect cost?
 * A: Yes. Deflect is a MANDATORY additional cost summed into the total (356.2.a.2); total-cost discounts apply after that
 *    (356.4), so the [rainbow] part of the discount offsets Deflect's [rainbow]. The "minimum of [1]" binds only the Energy
 *    part (356.4.e). Ezreal, Prodigy does NOT help: his discount is for OPTIONAL additional costs only.
 * Rules: 356.2.a.2, 356.4, 356.4.e/f, 809.1.d.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const APPLIED_RESEARCHERS = "ven-055-166";
const EZREAL_PRODIGY = "sfd-149-221";
const VOID_SEEKER = "ogn-024-298"; // [Action] 3 + [fury]: Deal 4 to a unit at a battlefield. Draw 1.
const STUPEFY = "ogn-095-298"; // [Reaction] 1: Give a unit -1 Might this turn (min 1). Draw 1.

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn. P2 holds bf1 with a 5-Might [Deflect] unit and a plain Grunt. P1: 4 energy, Void Seeker's [fury], 2 spare mind power. */
function board(pool: { energy: number; power: Record<string, number> } = { energy: 4, power: { fury: 1, mind: 2 } }) {
  return scenario()
    .resources(P1, pool)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { keywords: ["Deflect"], might: 5, name: "Deflector" }, "deflector")
    .unit(P2, "bf1", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P1, STUPEFY, "stupefy");
}

/** What P1 spent on a cast: energy, the fury pip and extra any-domain (mind) power. */
async function costOf(game: Game, card: string, target: string): Promise<{ energy: number; fury: number; extra: number }> {
  const before = game.p1.resources();
  await game.p1.cast(card, { targets: target });
  const after = game.p1.resources();
  return {
    energy: before.energy - after.energy,
    extra: (before.power.mind ?? 0) - (after.power.mind ?? 0),
    fury: (before.power.fury ?? 0) - (after.power.fury ?? 0),
  };
}

describe("Ruling f26d269a8fbc230a — Applied Researchers' [1][rainbow] discount offsets the Deflect surcharge", () => {
  test("premise: with NO discount source, Void Seeker on the Deflector costs 3 + [fury] + 1 extra power (Deflect is a mandatory additional cost)", async () => {
    const game = await board().build();
    expect(game.state("deflector").keywords).toContain("Deflect");
    expect(await costOf(game, "vs", "deflector")).toEqual({ energy: 3, extra: 1, fury: 1 });
  });

  test("premise: an UN-empowered Applied Researchers gives nothing — still 3 + [fury] + 1 extra", async () => {
    const game = await board().unit(P1, "base", APPLIED_RESEARCHERS, "ar").build();
    expect(game.state("ar").isEmpowered).toBe(false);
    expect(await costOf(game, "vs", "deflector")).toEqual({ energy: 3, extra: 1, fury: 1 });
  });

  test("EMPOWERED Applied Researchers: (3 + [fury] + Deflect [rainbow]) − [1][rainbow] = 2 energy + [fury] and NO extra power — the Deflect pip is offset", async () => {
    const game = await board().unit(P1, "base", APPLIED_RESEARCHERS, "ar", { empowered: true }).build();
    expect(game.state("ar").isEmpowered).toBe(true);
    expect(await costOf(game, "vs", "deflector")).toEqual({ energy: 2, extra: 0, fury: 1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vs", controller: P1, targets: ["deflector"] })]);
    await game.settle();
    expect(game.state("deflector").damage).toBe(4);
  });

  test("it is castable at the Deflector with exactly 2 energy + [fury] and no other power at all (the surcharge really is gone)", async () => {
    const game = await board({ energy: 2, power: { fury: 1 } }).unit(P1, "base", APPLIED_RESEARCHERS, "ar", { empowered: true }).build();
    expect(game.p1.option("cast", "vs")?.fields.find((f) => f.name === "targets")?.options).toContainEqual(["deflector"]);
    await game.p1.cast("vs", { targets: "deflector" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("'minimum of [1]' binds only the ENERGY part (356.4.e): Stupefy (1) on the Deflector costs exactly [1] and 0 power; on the Grunt also [1]", async () => {
    const game = await board().unit(P1, "base", APPLIED_RESEARCHERS, "ar", { empowered: true }).build();
    expect(await costOf(game, "stupefy", "deflector")).toEqual({ energy: 1, extra: 0, fury: 0 });
    const g2 = await board().unit(P1, "base", APPLIED_RESEARCHERS, "ar", { empowered: true }).build();
    expect(await costOf(g2, "stupefy", "grunt")).toEqual({ energy: 1, extra: 0, fury: 0 });
  });

  test("contrast — Ezreal, Prodigy discounts OPTIONAL additional costs only: Deflect (mandatory) is NOT reduced → still 3 + [fury] + 1 extra", async () => {
    const game = await board().unit(P1, "base", EZREAL_PRODIGY, "ez").build();
    expect(await costOf(game, "vs", "deflector")).toEqual({ energy: 3, extra: 1, fury: 1 });
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling 6b057bff511d4123 — Vex, Cheerless (SFD-146 → sfd-146-221)
 *   5-Might Chaos champion: "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of
 *    [1], and enemy spells cost [1][rainbow] more."
 *   × Bird token (unl-t02) 1-Might unit with [Deflect] ("Opponents must pay [rainbow] to choose me…").
 *   × Void Seeker (ogn-024-298) [Action] 3 energy + [fury]: "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Stupefy (ogn-095-298) [Reaction] 1 energy: "Give a unit -1 [Might] this turn, min 1. Draw 1."
 *
 * Q: Does Vex reduce Deflect costs when you play spells?
 * A: Yes. Deflect is a mandatory additional cost added BEFORE discounts; Vex's [1][rainbow] discount can
 *    then offset the [rainbow] that Deflect added, since discounts may reduce additional costs — but the
 *    spell's resulting cost cannot drop below her printed minimum of [1].
 * Rules: 356.2, 356.2.a.2, 809.1.d (Deflect = additional cost), 356.4, 356.4.e (minimum), 356.4.f.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VEX_CHEERLESS = "sfd-146-221";
const BIRD = "unl-t02";
const VOID_SEEKER = "ogn-024-298";
const STUPEFY = "ogn-095-298";

/** Spare off-domain power P1 holds to cover any Deflect [rainbow]. */
const SPARE = 2;

/**
 * P1's turn. P2 holds bf1 with a Deflect Bird and a grunt. P1's Vex waits in base (moving her into bf1
 * opens a combat showdown in which she is the attacker = "in combat" and P1 holds Focus). P1 has 4 energy,
 * exactly Void Seeker's [fury] pip, and SPARE mind power for Deflect.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 1, mind: SPARE } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", BIRD, "bird")
    .unit(P2, "bf1", { might: 2, name: "Grunt" }, "grunt")
    .unit(P1, "base", VEX_CHEERLESS, "vex")
    .hand(P1, VOID_SEEKER, "voidSeeker")
    .hand(P1, STUPEFY, "stupefy");
}

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

async function vexIntoCombat(game: Game): Promise<void> {
  await game.p1.move("vex", "bf1");
  expect(game.state("vex").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
}

/** What P1 spent on a cast: energy, the fury pip, and extra (any-domain) power. */
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

describe("Ruling 6b057bff511d4123 — Vex's in-combat discount can eat the Deflect surcharge (but not below [1])", () => {
  test("premise: the Bird has Deflect, so out of combat Void Seeker on it costs 3 energy + [fury] + 1 extra power (809.1.d, 356.2.a.2)", async () => {
    const game = await board().build();
    expect(game.state("bird").keywords).toContain("Deflect");
    expect(game.state("vex").combatRole).toBeNull();
    expect(await costOf(game, "voidSeeker", "bird")).toEqual({ energy: 3, extra: 1, fury: 1 });
  });

  test("premise: out of combat Stupefy on the Bird costs 1 energy + 1 extra power; on the non-Deflect grunt just 1 energy", async () => {
    const game = await board().build();
    expect(await costOf(game, "stupefy", "bird")).toEqual({ energy: 1, extra: 1, fury: 0 });
    const g2 = await board().build();
    expect(await costOf(g2, "stupefy", "grunt")).toEqual({ energy: 1, extra: 0, fury: 0 });
  });

  test("Vex attacking at bf1 is 'in combat' and P1 (Focus) may cast spells at the defenders", async () => {
    const game = await board().build();
    await vexIntoCombat(game);
    expect(game.p1.can("cast", "voidSeeker")).toBe(true);
    expect(game.p1.can("cast", "stupefy")).toBe(true);
  });

  // Expected: Void Seeker on the Deflect Bird with Vex in combat: (3 + [fury] + Deflect [rainbow]) − Vex's
  // [1][rainbow] = 2 energy + [fury] + 0 extra power (356.4.f — the discount offsets the added [rainbow]).
  // Actual: Vex's friendly-spell discount is not applied at all — P1 pays 3 energy + [fury] + 1 extra.
  test.failing("BUG: ruling 6b057bff511d4123 — Vex in combat: Void Seeker on the Deflect Bird should cost 2 energy + [fury] with the Deflect [rainbow] fully offset; engine charges 3 + [fury] + 1", async () => {
    const game = await board().build();
    await vexIntoCombat(game);
    expect(await costOf(game, "voidSeeker", "bird")).toEqual({ energy: 2, extra: 0, fury: 1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["voidSeeker"]);
  });

  // Expected: Stupefy (1 energy) on the Deflect Bird with Vex in combat: energy cannot go below the minimum
  // of [1] (356.4.e), but the [rainbow] discount still cancels the Deflect [rainbow] → exactly 1 energy, 0 power.
  // Actual: 1 energy + 1 extra power (no discount applied).
  test.failing("BUG: ruling 6b057bff511d4123 — Vex in combat: Stupefy on the Deflect Bird should cost exactly [1] and no power (floor [1], Deflect offset); engine still charges the extra power", async () => {
    const game = await board().build();
    await vexIntoCombat(game);
    expect(await costOf(game, "stupefy", "bird")).toEqual({ energy: 1, extra: 0, fury: 0 });
  });

  test("Vex in combat: a 1-cost spell at a NON-Deflect target still costs [1] — the discount never makes it free (356.4.e)", async () => {
    const game = await board().build();
    await vexIntoCombat(game);
    expect(await costOf(game, "stupefy", "grunt")).toEqual({ energy: 1, extra: 0, fury: 0 });
    const broke = await board().resources(P1, { energy: 0, power: { fury: 1, mind: SPARE } }).build();
    await vexIntoCombat(broke);
    expect(broke.p1.can("cast", "stupefy")).toBe(false);
  });
});

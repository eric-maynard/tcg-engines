/**
 * Interaction: Zenith Blade (ogn-262-298) "[Action] Stun an enemy unit at a battlefield.
 *     You may move a friendly unit to that enemy unit's battlefield."
 *   × Radiant Dawn (ogn-261-298, legend) "When you stun one or more enemy units, buff a friendly unit."
 *   × Flash (ogs-011-024) "[Reaction] Move up to 2 friendly units to base."
 *   × Retreat (ogn-104-298) "[Reaction] Return a friendly unit to its owner's hand. …"
 *
 * Q: one target of a two-instruction spell is removed in response. What survives?
 *    (a) the STUN TARGET leaves the battlefield; (b) the FRIENDLY MOVER leaves the board.
 *
 * Rules
 *  - 359.3.e.2/.e.4  targets are re-checked as the spell resolves; one that no longer matches
 *                    its descriptor ("an enemy unit AT A BATTLEFIELD") is an illegal target.
 *  - 359.3.e.5       an instruction whose target is illegal is ignored — no re-targeting.
 *  - 359.3.e.6       an instruction that cannot be followed is ignored.
 *  - 359.3.e.8       an instruction whose target is still legal executes normally.
 *  - 359.3.e.10      the spell was still played: it is trashed and its cost stays paid.
 *  - 359.3.e.12      information the spell needs ("that enemy unit's battlefield") that no longer
 *                    exists is null — it is not re-derived and not replaced with a default.
 *  - 426.1.c         a "When you stun …" ability triggers only if a stun actually happened.
 *
 * Expected: (a) no stun ⇒ Radiant Dawn does NOT trigger; the move's destination is null so the
 * optional move is ignored — no prompt for another battlefield, no fallback to base, the mover
 * stays exactly where it is. (b) the stun still resolves, Radiant Dawn triggers and buffs, and
 * the move is ignored with NO replacement mover chosen. Neither branch produces an extra effect.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";
const RADIANT_DAWN = "ogn-261-298";
const FLASH = "ogs-011-024";
const RETREAT = "ogn-104-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function pickOptions(game: Game): string[] {
  const d = game.decision();
  if (!d || d.kind !== "pick") return [];
  return d.options.map((o) => o.card ?? o.zone ?? o.key);
}

/** P1's whole Power pool (which Domain pays a [rainbow] pip is the engine's pick). */
function totalPower(game: Game): number {
  return Object.values(game.p1.resources().power ?? {}).reduce((a, b) => a + (b as number), 0);
}

/**
 * bfA — P2's unit `foe` (the stun target). bfD — P1's `elsewhere`, a second battlefield that
 * must never become a substitute destination. `mover` waits in P1's base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { calm: 4, order: 4, rainbow: 4 } })
    .resources(P2, { energy: 12, power: { chaos: 4, rainbow: 4 } })
    .legend(P1, RADIANT_DAWN, "dawn")
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfD", { controller: P1 })
    .unit(P2, "bfA", { might: 3 }, "foe")
    .unit(P1, "bfD", { might: 1 }, "elsewhere")
    .unit(P1, "base", { might: 2 }, "mover")
    .hand(P1, ZENITH_BLADE, "zenith")
    .hand(P1, RETREAT, "retreat")
    .hand(P2, FLASH, "p2flash");
}

describe("Zenith Blade with a null 'that enemy unit's battlefield'", () => {
  test("baseline: the stun lands, Radiant Dawn triggers, and the optional move offers ONLY the stunned unit's battlefield", async () => {
    const game = await board().build();
    await game.p1.cast("zenith", { targets: ["foe", "mover"] });
    await game.settle();
    // The destination is "that enemy unit's battlefield" — bfA and nothing else.
    expect(game.decision()?.kind).toBe("pick");
    expect(pickOptions(game)).toEqual(["battlefield-bfA"]);
    expect((game.decision() as { allowDecline?: boolean }).allowDecline).toBe(true); // "You may …"
    await game.p1.pick("bfA");
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.locationOf("mover")).toBe("bfA");
    // rule 426.1.c — a stun happened, so the legend fires.
    expect(pickOptions(game)).toEqual(expect.arrayContaining([game.card("mover"), game.card("elsewhere")]));
    await game.p1.pick("elsewhere");
    await game.settle();
    expect(game.state("elsewhere").isBuffed).toBe(true);
    expect(game.zoneOf("zenith")).toBe("trash");
  });

  test("baseline: the move is genuinely optional — declining leaves the mover in base while the stun still happened", async () => {
    const game = await board().build();
    await game.p1.cast("zenith", { targets: ["foe", "mover"] });
    await game.settle();
    await game.p1.decline();
    expect(game.locationOf("mover")).toBe("base");
    expect(game.state("foe").isStunned).toBe(true);
  });

  test("(a) the stun target is Flashed home: no stun (359.3.e.2/.e.4/.e.5) and Radiant Dawn does NOT trigger (426.1.c)", async () => {
    const game = await board().build();
    await game.p1.cast("zenith", { targets: ["foe", "mover"] });
    await game.p1.passPriority();
    await game.p2.cast("p2flash", { targets: ["foe"] }); // the stun target leaves the battlefield
    await game.settle();
    expect(game.locationOf("foe")).toBe("base");
    expect(game.state("foe").isStunned).toBe(false);
    expect(game.chain()).toEqual([]); // Radiant Dawn never went on the chain
    expect(game.state("mover").isBuffed).toBe(false);
    expect(game.state("elsewhere").isBuffed).toBe(false);
  });

  test("(a) the destination is null (359.3.e.12): the optional move is ignored — no other battlefield offered, no fallback to base, the mover is untouched", async () => {
    const game = await board().build();
    const exhaustedBefore = game.state("mover").isExhausted;
    await game.p1.cast("zenith", { targets: ["foe", "mover"] });
    await game.p1.passPriority();
    await game.p2.cast("p2flash", { targets: ["foe"] });
    await game.settle(); // settle STOPS at any unanswered pick, so reaching main phase = no prompt
    expect(game.decision()?.kind).toBe("action");
    expect(game.decision()?.context).toBe("main");
    expect(game.locationOf("mover")).toBe("base"); // not bfD, not bfA, not anywhere
    expect(game.state("mover").isExhausted).toBe(exhaustedBefore); // the spell did not exhaust it
    expect(game.locationOf("elsewhere")).toBe("bfD"); // and no other friendly unit moved either
  });

  test("(a) Zenith Blade is still 'played': it is trashed and its cost stays paid (359.3.e.10)", async () => {
    const game = await board().build();
    const energyBefore = game.p1.energy();
    const powerBefore = totalPower(game);
    await game.p1.cast("zenith", { targets: ["foe", "mover"] });
    await game.p1.passPriority();
    await game.p2.cast("p2flash", { targets: ["foe"] });
    await game.settle();
    expect(game.zoneOf("zenith")).toBe("trash");
    expect(game.p1.energy()).toBe(energyBefore - 3);
    expect(totalPower(game)).toBe(powerBefore - 2); // both [rainbow] pips stay spent
    expect(game.violations()).toEqual([]);
  });

  test("(b) the MOVER is removed instead: the stun still resolves on the still-legal enemy unit (359.3.e.8) and Radiant Dawn buffs", async () => {
    const game = await board().build();
    await game.p1.cast("zenith", { targets: ["foe", "mover"] });
    await game.p1.cast("retreat", { targets: ["mover"] }); // mover leaves the board
    await game.settle();
    expect(game.zoneOf("mover")).toBe("hand");
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.state("elsewhere").isBuffed).toBe(true); // sole friendly unit left, auto-bound
    expect(game.state("elsewhere").might).toBe(2); // printed 1 + the +1 buff
  });

  test("(b) the move instruction is ignored with NO replacement mover chosen (359.3.e.5/.e.6)", async () => {
    const game = await board().build();
    await game.p1.cast("zenith", { targets: ["foe", "mover"] });
    await game.p1.cast("retreat", { targets: ["mover"] });
    await game.settle();
    expect(game.decision()?.kind).toBe("action"); // no destination / mover prompt was ever raised
    expect(game.locationOf("elsewhere")).toBe("bfD"); // the other friendly unit was NOT drafted in
    expect(game.p2.units("bfA")).toEqual([game.card("foe")]);
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.zoneOf("zenith")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

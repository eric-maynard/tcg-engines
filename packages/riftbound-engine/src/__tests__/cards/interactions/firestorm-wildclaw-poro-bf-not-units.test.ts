/**
 * Interaction: Firestorm (ogs-002-024) · Spell · Fury · 6 + [fury]
 *     "Deal 3 to all enemy units at a battlefield."
 *   × Alpha Wildclaw (unl-057-219) · Unit · Calm · 7 Might
 *     "[Tank] Your units here with less Might than me can't be chosen by enemy spells and abilities."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 Might · "[Deflect]" (opponents pay [rainbow] to choose me)
 *   Contrast spells: Vengeance (ogn-229-298, 4 + [order]×2, "Kill a unit."), Rebuke (ogn-172-298,
 *   2 + [chaos]×2, "Return a unit at a battlefield to its owner's hand.").
 *
 * Question: P2 holds bf1 with Alpha Wildclaw (7) and Pouty Poro (2) and nothing else; P1 has exactly
 * 6 energy + 1 fury (no spare power for a Deflect pip) and plays Firestorm.
 *   (a) What is P1 asked to choose — a battlefield, units, or both?
 *   (b) Must P1 pay the Poro's Deflect; is the play even legal with no spare power?
 *   (c) Does the Wildclaw-protected Poro take the 3?
 *   (d) Contrast: what would a targeted enemy "Kill a unit" / "Return a unit at a battlefield" be offered?
 *
 * Rules: 355.7 (choosing a specific object = targeting), 355.10.b / 355.10.d ("all enemy units at a
 * battlefield" targets the BATTLEFIELD; the units are programmatically selected, not chosen),
 * 355.9.b + 757 / 758 ("can't be chosen" only removes a unit from the legal-TARGET set), 809.1.c /
 * 809.1.d (Deflect is an additional cost only on spells that choose/target the unit).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIRESTORM = "ogs-002-024";
const ALPHA_WILDCLAW = "unl-057-219";
const POUTY_PORO = "ogn-013-298";
const VENGEANCE = "ogn-229-298";
const REBUKE = "ogn-172-298";

/** Flatten the `targets` field of P1's cast option into the set of ids offered. */
function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1's turn. P2 holds bf1 with Wildclaw (7) + Pouty Poro (2). P1: exactly 6 energy + 1 fury, Firestorm in hand. bf2 empty. */
function board(opts: { extraVanilla?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 6, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", ALPHA_WILDCLAW, "wildclaw")
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .unit(P1, "base", { might: 2, name: "P1 Bystander" }, "mine") // a friendly unit that must never be hit
    .hand(P1, FIRESTORM, "firestorm");
  return opts.extraVanilla ? s.unit(P2, "bf1", { might: 2, name: "Vanilla Two" }, "van") : s;
}

/** Contrast board for (d): same defenders, P1 rich enough for Vengeance / Rebuke plus a spare pip. */
function contrastBoard(opts: { wildclaw: boolean }) {
  let s = scenario()
    .resources(P1, { energy: 6, power: { chaos: 2, order: 2, rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null });
  if (opts.wildclaw) {
    s = s.unit(P2, "bf1", ALPHA_WILDCLAW, "wildclaw");
  }
  return s
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .unit(P2, "bf1", { might: 2, name: "Vanilla Two" }, "van")
    .hand(P1, VENGEANCE, "vengeance")
    .hand(P1, REBUKE, "rebuke");
}

describe("Firestorm into Alpha Wildclaw + Pouty Poro — the battlefield is the target, not the units", () => {
  test("sanity: Wildclaw 7, Poro 2 with Deflect, both P2's at bf1; P1 has exactly 6 energy + 1 fury", async () => {
    const game = await board().build();
    expect(game.state("wildclaw").might).toBe(7);
    expect(game.state("poro")).toMatchObject({ might: 2 });
    expect(game.state("poro").keywords).toContain("Deflect");
    expect(game.p2.units("bf1").sort()).toEqual(["poro", "wildclaw"]);
    expect(game.p1.resources()).toEqual({ energy: 6, power: { fury: 1 } });
  });

  test("(a) Firestorm asks for exactly ONE choice and it is a BATTLEFIELD: bf1 and bf2 are offered, no unit ever is (355.10.b, 355.10.d)", async () => {
    const game = await board().build();
    const opt = game.p1.option("cast", "firestorm");
    expect(opt).toBeDefined();
    const targetFields = opt!.fields.filter((f) => f.name === "targets");
    expect(targetFields).toHaveLength(1);
    expect(targetFields[0]).toMatchObject({ max: 1, min: 1, required: true });
    const offered = targetsOffered(game, "firestorm");
    expect(offered.sort()).toEqual(["bf1", "bf2"]);
    for (const unit of ["wildclaw", "poro", "mine"]) {
      expect(offered).not.toContain(unit);
    }
    await expect(game.p1.cast("firestorm", { targets: "poro" })).rejects.toThrow();
  });

  test("(b) no unit is chosen → no Deflect pip is owed: the play is legal on exactly 6 + [fury], everything is spent, and Firestorm sits on the chain targeting bf1 (809.1.c/d)", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "firestorm")).toBe(true);
    await game.p1.cast("firestorm", { targets: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "firestorm", controller: P1, targets: ["bf1"], triggered: false, type: "spell" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // no cost/target prompt interposed
  });

  test("(c) on resolution EVERY enemy unit at bf1 is dealt 3 regardless of 'can't be chosen': the protected Pouty Poro (2) dies, Alpha Wildclaw (7) survives with 3 marked; P1's own unit untouched (757/758 vs 355.10.d)", async () => {
    const game = await board().build();
    await game.p1.cast("firestorm", { targets: "bf1" });
    await game.settle();
    expect(game.zoneOf("firestorm")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p2.trash()).toContain("poro");
    expect(game.zoneOf("wildclaw")).toBe("battlefield-bf1");
    expect(game.state("wildclaw").damage).toBe(3);
    expect(game.state("mine")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // Wildclaw still holds it
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) a vanilla 2-Might P2 unit that Wildclaw makes unchoosable dies to Firestorm all the same", async () => {
    const game = await board({ extraVanilla: true }).build();
    // It really is unchoosable for an enemy targeted spell (see (d)) — yet Firestorm hits it.
    await game.p1.cast("firestorm", { targets: "bf1" });
    await game.settle();
    expect(game.zoneOf("van")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("wildclaw").damage).toBe(3);
  });

  test("(c) aiming Firestorm at the EMPTY bf2 is a legal (if pointless) play: nothing at bf1 is touched", async () => {
    const game = await board().build();
    await game.p1.cast("firestorm", { targets: "bf2" });
    await game.settle();
    expect(game.zoneOf("firestorm")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.state("poro").damage).toBe(0);
    expect(game.state("wildclaw").damage).toBe(0);
  });

  // ── (d) contrast: targeted enemy spells DO enumerate units and DO respect Wildclaw / Deflect ──

  test("(d) with Wildclaw present, enemy Vengeance ('Kill a unit') and Rebuke ('Return a unit at a battlefield') offer ONLY Alpha Wildclaw — the 2-Might Poro and the 2-Might vanilla are excluded (355.9.b, 758)", async () => {
    const game = await contrastBoard({ wildclaw: true }).build();
    expect(targetsOffered(game, "vengeance")).toEqual(["wildclaw"]);
    expect(targetsOffered(game, "rebuke")).toEqual(["wildclaw"]);
    await expect(game.p1.cast("vengeance", { targets: "poro" })).rejects.toThrow();
    await expect(game.p1.cast("rebuke", { targets: "van" })).rejects.toThrow();
  });

  test("(d) absent Wildclaw both small units become legal targets, and choosing the Pouty Poro adds a mandatory Deflect pip: Vengeance on Poro costs 4 + [order][order] + 1 extra power (809.1.c)", async () => {
    const game = await contrastBoard({ wildclaw: false }).build();
    expect(targetsOffered(game, "vengeance").sort()).toEqual(["poro", "van"]);
    expect(targetsOffered(game, "rebuke").sort()).toEqual(["poro", "van"]);
    const powerBefore = game.p1.power();
    await game.p1.cast("vengeance", { targets: "poro" });
    expect(game.p1.energy()).toBe(2); // 6 − 4
    expect(powerBefore - game.p1.power()).toBe(3); // 2 printed pips + 1 Deflect
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
  });

  test("(d) …and that Deflect pip is mandatory: with exactly 4 + [order][order] and no spare power, Vengeance may take the vanilla unit but NOT the Pouty Poro", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .unit(P2, "bf1", { might: 2, name: "Vanilla Two" }, "van")
      .hand(P1, VENGEANCE, "vengeance")
      .build();
    const onPoro = await game.p1.try((p) => p.cast("vengeance", { targets: "poro" }));
    expect(onPoro.ok).toBe(false);
    expect(game.zoneOf("vengeance")).toBe("hand");
    await game.p1.cast("vengeance", { targets: "van" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("van")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
  });
});

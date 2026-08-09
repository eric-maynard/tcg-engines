/**
 * Interaction: Vex, Apathetic (unl-150-219) × Ride the Wind (ogn-173-298) × Fight or Flight (ogn-168-298)
 *
 *   Vex, Apathetic — Champion Unit · Chaos · 4 · 4 Might
 *     "[Deflect] … When an opponent plays a unit while I'm at a battlefield, [Stun] it.
 *      They can't move it this turn."
 *   Ride the Wind — Spell · Chaos · 2 + [chaos] · [Action]  "Move a friendly unit and ready it."
 *   Fight or Flight — Spell · Chaos · 2 · [Hidden] [Action]  "Move a unit from a battlefield to its base."
 *   (+ Vanguard Sergeant ogn-219-298, a vanilla 4/4; Tactical Retreat unl-175-219 for the recall probe.)
 *
 * Question: P1's Vex is at bfA. On P2's turn P2 plays Vanguard Sergeant to bfB (P2's battlefield);
 * Vex's trigger stuns it and "P2 can't move it this turn".
 *  (a) P2 Rides the Wind on the Sergeant intending bfB→bfA: legal target? moves? readied?
 *  (b) Now ready, may P2 Standard-Move it?
 *  (c) In a later combat showdown at bfA, P1 (Focus) plays Fight or Flight on the Sergeant — moves?
 *  (d) Is a RECALL of the Sergeant (Tactical Retreat replacing its death) affected?
 *  (e) Does the restriction outlive P2's turn, and would a Vex in P1's BASE have triggered at all?
 *
 * Expected (rules): (a) legal target (friendly unit; bfA is a valid destination, 355.4/355.4.a), but
 * the mover of a spell's move instruction is the spell's controller (420.2.a) = P2, whom Vex forbids;
 * a prohibition beats a permission (054.1) and the rest of the spell does what it can (055): the
 * Sergeant does NOT move but IS readied, and stays stunned. (b) No — the Standard Move (144.2, 420.3)
 * is P2 moving it; being ready only pays the cost, it does not lift a "can't". (c) Yes — "they" is
 * P2 only; P1 may play an [Action] while holding Focus (347.1) and P1 performs the move: Sergeant →
 * P2's base; if bfB is now empty P2 loses it at the next Cleanup (190.4.c). (d) Recalls are not moves
 * and can't be stopped by movement restrictions (456, 456.3). (e) "this turn" and the Stun both end
 * with P2's turn (423.1.a.2); the trigger needs Vex "at a battlefield" — a Vex in base does nothing.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const SERGEANT = "ogn-219-298";
const RIDE_THE_WIND = "ogn-173-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const TACTICAL_RETREAT = "unl-175-219";
/** Inline 6-damage Action spell — the lethal event for the recall probe (d). */
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt 6",
  timing: "action",
};

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P2's turn. P1's Vex at `vexAt` (bfA is P1's); bfB is P2's (empty). P2: Raider (3) ready in base,
 * Sergeant + Ride the Wind + Tactical Retreat + Bolt in hand, 10 energy + [chaos]. P1: Fight or Flight, 2 energy.
 */
function board(vexAt: "bfA" | "base" = "bfA") {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 10, power: { chaos: 1 } })
    .resources(P1, { energy: 2 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, vexAt, VEX, "vex")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, SERGEANT, "sarge")
    .hand(P2, RIDE_THE_WIND, "rtw")
    .hand(P2, TACTICAL_RETREAT, "tr")
    .hand(P2, BOLT, "bolt")
    .hand(P1, FIGHT_OR_FLIGHT, "fof");
}

/** P2 plays the Sergeant to bfB and Vex's trigger resolves. */
async function sergeantEntersUnderVex(game: Game): Promise<void> {
  await game.p2.play("sarge", { to: "bfB" });
  await game.settle();
  expect(game.locationOf("sarge")).toBe("bfB");
}

/** Units P2 may name for any Standard Move right now. */
function standardMovable(game: Game): string[] {
  return [
    ...new Set(
      game.p2
        .legal()
        .filter((o) => o.moveId === "standardMove")
        .flatMap((o) => (o.fields.find((f) => f.arg === "units")?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[])),
    ),
  ];
}

describe("Vex, Apathetic — 'they can't move it this turn' × Ride the Wind / Standard Move / Fight or Flight / Recall", () => {
  test("setup: the Sergeant P2 plays to bfB while Vex is at bfA is Stunned and carries a this-turn movement restriction", async () => {
    const game = await board().build();
    await sergeantEntersUnderVex(game);
    expect(game.state("sarge").isStunned).toBe(true);
    expect(game.state("sarge").isExhausted).toBe(true); // units enter exhausted
    expect(game.state("sarge").grantedKeywords).toEqual([expect.objectContaining({ keyword: "NoMove", duration: "turn" })]);
    expect(game.chain()).toEqual([]);
  });

  // ── (a) Ride the Wind ─────────────────────────────────────────────────────────────────────

  test("(a) the Sergeant IS a legal target of Ride the Wind ('a friendly unit'), and bfA is offered as its destination (355.4.a)", async () => {
    const game = await board().build();
    await sergeantEntersUnderVex(game);
    const targets = game.p2.option("cast", "rtw")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(targets).toEqual(expect.arrayContaining([["sarge"], ["raider"]]));
    await game.p2.cast("rtw", { targets: "sarge" });
    expect(game.p2.resources()).toEqual({ energy: 4, power: { chaos: 0 } }); // 10 − 4 (Sergeant) − 2
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(dests).toEqual(expect.arrayContaining(["base", "battlefield-bfA"]));
    await game.p2.pick("battlefield-bfA");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", controller: P2, targets: ["sarge"] })]);
  });

  test("(a) the Sergeant does NOT move — P2 is the one executing the spell's move (420.2.a) and Vex forbids P2 moving it; the prohibition wins (054.1)", async () => {
    // Expected: after Ride the Wind resolves the Sergeant is still at bfB (no combat at bfA is staged).
    // Actual: the effect-move path ignores the NoMove restriction; the Sergeant is moved to bfA and a
    // combat showdown against Vex opens.
    const game = await board().autoProcedures(false).build();
    await sergeantEntersUnderVex(game);
    await game.p2.cast("rtw", { targets: "sarge" });
    await game.p2.pick("battlefield-bfA");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("sarge")).toBe("bfB");
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P2 });
  });

  test("(a) …but the rest of the spell does as much as it can (055): the Sergeant IS readied, and it is still Stunned", async () => {
    const game = await board().autoProcedures(false).build();
    await sergeantEntersUnderVex(game);
    await game.p2.cast("rtw", { targets: "sarge" });
    await game.p2.pick("battlefield-bfA");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.state("sarge").isReady).toBe(true);
    expect(game.state("sarge").isStunned).toBe(true);
    expect(game.state("sarge").grantedKeywords).toEqual(expect.arrayContaining([expect.objectContaining({ keyword: "NoMove" })]));
  });

  // ── (b) Standard Move ─────────────────────────────────────────────────────────────────────

  test("(b) even once READY, P2 may not Standard-Move the Sergeant anywhere this turn — ready only pays the exhaust cost (144.2, 420.3), it does not lift the 'can't'", async () => {
    const game = await board().build();
    await sergeantEntersUnderVex(game);
    // Ready it via Ride the Wind (destination "base" so no combat can interfere with the observation).
    await game.p2.cast("rtw", { targets: "sarge" });
    await game.p2.pick("base");
    await game.settle();
    expect(game.state("sarge").isReady).toBe(true);
    expect(standardMovable(game)).toContain("raider"); // an unrestricted ready unit may move
    expect(standardMovable(game)).not.toContain("sarge");
    expect(game.p2.can("gank", "sarge")).toBe(false);
    const here = game.locationOf("sarge");
    for (const dest of ["base", "bfA", "bfB"].filter((l) => l !== here)) {
      const t = await game.p2.try((p) => p.move("sarge", dest));
      expect(t.ok).toBe(false);
    }
    expect(game.locationOf("sarge")).toBe(here);
    expect(game.state("sarge").isReady).toBe(true);
  });

  // ── (c) Fight or Flight played by P1 ──────────────────────────────────────────────────────

  test("(c) in a combat showdown at bfA, P1 (holding Focus) may play Fight or Flight from hand on the Sergeant at bfB (347.1)", async () => {
    const game = await board().build();
    await sergeantEntersUnderVex(game);
    await game.p2.move("raider", "bfA");
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P2 });
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "fof")).toBe(true);
    const targets = (game.p1.option("cast", "fof")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect(targets).toContain("sarge"); // "a unit from a battlefield" — any battlefield, either side
    await game.p1.cast("fof", { targets: "sarge" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", controller: P1 })]);
  });

  test("(c) P1 is not 'they': the Sergeant DOES move bfB → P2's base (still stunned); the emptied bfB is no longer P2's after Cleanup (190.4.c); the combat at bfA then resolves", async () => {
    const game = await board().build();
    await sergeantEntersUnderVex(game);
    await game.p2.move("raider", "bfA");
    await game.p2.passFocus();
    await game.p1.cast("fof", { targets: "sarge" });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.state("sarge").controller).toBe(P2);
    expect(game.p2.units("base")).toContain("sarge");
    expect(game.state("sarge").isStunned).toBe(true);
    expect(game.gameState.battlefields.bfB?.controller).not.toBe(P2);
    // Raider (3) alone vs Vex (4): Raider dies, P1 keeps bfA.
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("vex")).toBe("bfA");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) Recall ────────────────────────────────────────────────────────────────────────────

  test("(d) a RECALL is not a move (456, 456.3): Tactical Retreat replaces the Sergeant's death this turn — healed, exhausted and sent to P2's base despite 'can't move it', even though P2 applies it", async () => {
    const game = await board().build();
    await sergeantEntersUnderVex(game);
    await game.p2.cast("tr", { targets: "sarge" });
    await game.settle();
    expect(game.zoneOf("tr")).toBe("trash");
    await game.p2.cast("bolt", { targets: "sarge" }); // 6 damage to a 4-Might unit: it would die
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.p2.units("base")).toContain("sarge");
    expect(game.state("sarge")).toMatchObject({ damage: 0, isExhausted: true, isStunned: true });
    expect(game.p2.trash()).not.toContain("sarge");
  });

  // ── (e) duration / scope ──────────────────────────────────────────────────────────────────

  test("(e) 'this turn': once P2's turn ends the Stun (423.1.a.2) and the movement restriction are gone; on P2's next turn the Sergeant Standard-Moves freely", async () => {
    const game = await board().build();
    await sergeantEntersUnderVex(game);
    await game.advanceTurn(); // → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("sarge").isStunned).toBe(false);
    expect(game.state("sarge").grantedKeywords).toEqual([]);
    await game.advanceTurn(); // → P2's turn; Sergeant readied at start of turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sarge").isReady).toBe(true);
    expect(standardMovable(game)).toContain("sarge");
    await game.p2.move("sarge", "base");
    expect(game.zoneOf("sarge")).toBe("base");
  });

  test("(e) scope: with Vex in P1's BASE the trigger condition ('while I'm at a battlefield') is not met — the Sergeant is neither stunned nor restricted, and Ride the Wind moves AND readies it", async () => {
    const game = await board("base").build();
    await game.p2.play("sarge", { to: "bfB" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("sarge").isStunned).toBe(false);
    expect(game.state("sarge").grantedKeywords).toEqual([]);
    await game.p2.cast("rtw", { targets: "sarge" });
    await game.p2.pick("battlefield-bfA"); // bfA is empty of enemies now (Vex is home)
    await game.settle(); // resolves; the non-combat showdown at bfA is handed back once (344.2)…
    await game.settle(); // …and passes through: the Sergeant conquers bfA
    expect(game.locationOf("sarge")).toBe("bfA");
    expect(game.state("sarge").isReady).toBe(true);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    // ready and unrestricted: it may Standard-Move again this very turn
    expect(standardMovable(game)).toContain("sarge");
  });
});

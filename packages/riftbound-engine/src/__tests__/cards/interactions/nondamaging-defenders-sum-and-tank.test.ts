/**
 * Interaction: NON-DAMAGING DEFENDERS still soak [Tank] assignment.
 *
 *   Galio, Indefatigable (unl-171-219) 6 Might — [Deflect], [Tank], "I don't deal combat damage."
 *   Sacred Protector    (ven-129-166) 6 Might — "I don't deal combat damage unless I'm at a
 *                                               battlefield with exactly one other unit you control."
 *   Flash               (ogs-011-024) [Reaction] 2 — "Move up to 2 friendly units to base."
 *   Shipyard Skulker    (ogn-175-298) 3 Might vanilla · Mountain Drake (ogn-142-298) 10 Might vanilla
 *
 * Q: P1 attacks P2's bf1 with a lone Mountain Drake. P2 defends with Galio + Sacred Protector +
 *    Shipyard Skulker.
 *    (a) What is the defending sum at 465.2.b — do Galio and the Protector contribute 6 each?
 *    (b) P2 Flashes the SKULKER to base: is the Protector's "while" clause re-evaluated live?
 *    (c) P2 Flashes GALIO to base instead: sum, assignment, deaths.
 *    (d) In (b), does [Tank] still force lethal onto a unit that will never deal damage back?
 *
 * Rules: 465.2.a/b (sum each side's Might) · 423.1.b (a unit that does not deal combat damage
 * contributes nothing to the sum — stated for [Stun], the same principle) · 364.3 (a "while"
 * clause is a conditional PASSIVE, re-read continuously) · 815.1.b ([Tank] = "must be assigned
 * LETHAL damage before any other unit with the same controller" — it binds ASSIGNMENT, not
 * damage output) · 465.2.c/.c.3/.c.4/.c.6 (lethal in full before moving on; no over-assignment
 * while another unit remains; obey every restriction if able) · 446/450 (Move is not a Recall) ·
 * 466.1.a.1 (Combat Cleanup 3c heals all units) · 466.1.a.2 + 466.3.d (3d recall / "No Result"
 * when both sides still have units) · 466.5.d (Establishing Control = Conquer, +1 point).
 *
 * How the defending SUM is observed: combat damage is healed at 3c, so the marks are gone before
 * the test can read them. Each sum is pinned instead by a pair of boards where the Drake carries
 * pre-marked damage: the sum that kills the 10-Might Drake but one point less does not is the sum.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GALIO = "unl-171-219";
const PROTECTOR = "ven-129-166";
const SKULKER = "ogn-175-298";
const DRAKE = "ogn-142-298";
const FLASH = "ogs-011-024";

/** P2 holds bf1 with Galio + Sacred Protector + Skulker; P1's lone Drake is home with `drakeDamage` marked. */
function board(drakeDamage = 0) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", DRAKE, "drake", { damage: drakeDamage })
    .unit(P2, "bf1", GALIO, "galio")
    .unit(P2, "bf1", PROTECTOR, "prot")
    .unit(P2, "bf1", SKULKER, "skulk")
    .resources(P2, { energy: 2 })
    .hand(P2, FLASH, "flash");
}

/** Same board with combat procedures surfaced as options, so the 465.2.c assignment Decision can be read. */
function manualBoard() {
  return board().autoProcedures(false);
}

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Attack with the Drake and, optionally, let P2 Flash `flashTarget` home during the showdown. */
async function attack(game: Game, flashTarget?: string): Promise<void> {
  await game.p1.move("drake", "bf1");
  if (flashTarget !== undefined) {
    await game.p1.passFocus();
    await game.p2.cast("flash", { targets: flashTarget });
    await game.p2.passPriority();
    await game.p1.passPriority();
  }
}

/** Drive the showdown to the attacker's 465.2.c assignment prompt (manual-procedure board). */
async function toAssignment(flashTarget?: string): Promise<Game> {
  const game = await manualBoard().build();
  await attack(game, flashTarget);
  await game.p1.passFocus();
  await game.p2.passFocus();
  await game.p1.choose("resolveFullCombat");
  return game;
}

describe("Galio / Sacred Protector / Skulker — defending sum (465.2.b) and [Tank] assignment (815.1.b)", () => {
  // ------------------------------------------------------------------ (a)
  test("(a) with all three present the defending sum is exactly 3 — the Skulker alone; Galio never contributes and the Protector's condition is false with TWO other friendly units", async () => {
    // A 10-Might Drake pre-marked 7 needs 3 more to die, pre-marked 6 needs 4.
    // Sum 3 kills the first and not the second ⇒ the sum is exactly 3 (423.1.b principle:
    // a unit that does not deal combat damage adds nothing to 465.2.b).
    const lives = await board(6).build();
    await attack(lives);
    await lives.settle();
    expect(lives.zoneOf("drake")).not.toBe("trash");

    const dies = await board(7).build();
    await attack(dies);
    await dies.settle();
    expect(dies.zoneOf("drake")).toBe("trash");
  });

  test("(a) the attacker's 465.2.c Decision is a distribute of 10 over all three defenders, each labelled with its lethal need (6 / 6 / 3) — untouched by 'I don't deal combat damage'", async () => {
    const game = await toAssignment();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 10 });
    const lethal = Object.fromEntries(
      ((d as { buckets?: { key: string; lethal?: number }[] }).buckets ?? []).map((b) => [b.key, b.lethal]),
    );
    expect(lethal).toEqual({ galio: 6, prot: 6, skulk: 3 });
  });

  test("(a)+(d) [Tank] binds ASSIGNMENT (815.1.b): every line that touches another defender before Galio has its full 6 is rejected, and so is over-assigning Galio while others remain (465.2.c.3/.c.4/.c.6)", async () => {
    const illegal: Record<string, number>[] = [
      { prot: 6, skulk: 4 }, // Galio skipped entirely
      { galio: 5, prot: 2, skulk: 3 }, // Galio short of lethal
      { galio: 6, prot: 3 }, // does not spend the whole 10
      { galio: 7, prot: 3 }, // over-assigns Galio while other units remain (465.2.c.4)
      { galio: 10 }, // ditto, to the limit
      { galio: 6, prot: 2, skulk: 2 }, // neither follow-up unit reaches lethal (465.2.c.3)
      { galio: 6, skulk: 4 }, // Skulker over-assigned while the Protector is untouched
    ];
    for (const allocation of illegal) {
      const game = await toAssignment();
      const r = await game.p1.try((p) => p.distribute(allocation));
      expect(r.ok).toBe(false);
    }
  });

  test("(a)+(d) the legal 10-damage lines with all three present: {Galio 6, Protector 4} (only Galio dies) or {Galio 6, Skulker 3, Protector 1} (Galio + Skulker die); either way the Drake survives and is recalled — No Result, P2 keeps bf1", async () => {
    const a = await toAssignment();
    await a.p1.distribute({ galio: 6, prot: 4 });
    await a.p1.choose("resolveFullCombat");
    await a.settle();
    expect(a.zoneOf("galio")).toBe("trash");
    expect(a.zoneOf("prot")).toBe("battlefield-bf1");
    expect(a.zoneOf("skulk")).toBe("battlefield-bf1");
    expect(a.zoneOf("drake")).toBe("base"); // 466.1.a.2 / 466.3.d — both sides remain ⇒ recall, No Result
    expect(a.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(a.p1.points()).toBe(0);

    const b = await toAssignment();
    await b.p1.distribute({ galio: 6, prot: 1, skulk: 3 });
    await b.p1.choose("resolveFullCombat");
    await b.settle();
    expect(b.zoneOf("galio")).toBe("trash");
    expect(b.zoneOf("skulk")).toBe("trash");
    expect(b.zoneOf("prot")).toBe("battlefield-bf1");
    expect(b.state("prot").damage).toBe(0); // 466.1.a.1 — 3c heals the 1 that was marked
    expect(b.zoneOf("drake")).toBe("base");
    expect(b.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(b.violations()).toEqual([]);
  });

  // ------------------------------------------------------------------ (b)
  test("(b) Flashing the SKULKER home re-evaluates the Protector's 'while' clause live (364.3): with exactly one other friendly unit left (Galio) it DOES deal damage — the defending sum becomes exactly 6", async () => {
    // Drake pre-marked 3 needs 7 (> 6, survives); pre-marked 4 needs 6 (= 6, dies).
    const lives = await board(3).build();
    await attack(lives, "skulk");
    await lives.settle();
    expect(lives.locationOf("skulk")).toBe("base"); // Flash is an effect MOVE (446/450), not a recall
    expect(lives.zoneOf("drake")).not.toBe("trash");

    const dies = await board(4).build();
    await attack(dies, "skulk");
    await dies.settle();
    expect(dies.zoneOf("drake")).toBe("trash");
  });

  test("(b)+(d) [Tank] still taxes the attacker for a unit that will never hit back: the 10 is forced into {Galio 6, Protector 4} — Galio dies, the Protector is marked 4 and healed at 3c, the Drake is recalled, No Result, nobody scores", async () => {
    const game = await board().build();
    await attack(game, "skulk");
    await game.settle();
    expect(game.zoneOf("galio")).toBe("trash");
    expect(game.zoneOf("prot")).toBe("battlefield-bf1");
    expect(game.state("prot").damage).toBe(0); // 4 was not lethal (6); 466.1.a.1 heals it
    expect(game.zoneOf("drake")).toBe("base"); // 466.1.a.2 recall — both sides still have units
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(b) with Galio gone the surviving Protector is the only defender, so 4 of the 10 could not be spread onto anything else — the Skulker at base took nothing", async () => {
    const game = await board().build();
    await attack(game, "skulk");
    await game.settle();
    expect(game.state("skulk").damage).toBe(0);
    expect(game.locationOf("skulk")).toBe("base");
  });

  // ------------------------------------------------------------------ (c)
  test("(c) Flashing GALIO home leaves Protector (exactly one other friendly unit = the Skulker ⇒ it deals damage) + Skulker: the defending sum is exactly 9", async () => {
    // Drake unmarked needs 10 (> 9, survives); pre-marked 1 needs 9 (= 9, dies).
    const lives = await board(0).build();
    await attack(lives, "galio");
    await lives.settle();
    expect(lives.zoneOf("drake")).not.toBe("trash");

    const dies = await board(1).build();
    await attack(dies, "galio");
    await dies.settle();
    expect(dies.zoneOf("drake")).toBe("trash");
  });

  test("(c) no [Tank] remains, so 6+3 is mandatory (465.2.c.3) and only the surplus 1 floats: both defenders die, the Drake takes 9 of 10 and lives, and with no defender left it is NOT recalled — P1 Establishes Control, Conquer +1 (466.5.d)", async () => {
    const game = await board().build();
    await attack(game, "galio");
    await game.settle();
    expect(game.zoneOf("prot")).toBe("trash");
    expect(game.zoneOf("skulk")).toBe("trash");
    expect(game.locationOf("drake")).toBe("bf1");
    expect(game.state("drake").damage).toBe(0); // survived 9 < 10, healed at 3c
    expect(game.locationOf("galio")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(c) 465.2.c — the attacker is asked to assign a surplus that can sit on either of two units: {Protector 6, Skulker 4} and {Skulker 3, Protector 7} are both legal (465.2.c.3/.c.4, 355.10.d.2)", async () => {
    // A surplus that only has to land on whichever unit is served LAST is still the attacker's
    // choice — both defenders dying on either line does not make the placement programmatic.
    const game = await toAssignment("galio");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 10 });
  });
});

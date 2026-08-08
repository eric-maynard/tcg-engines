/**
 * Interaction: Yasuo, Remorseful (ogn-076-298) · Champion Unit · Calm · 6 · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Fight or Flight (ogn-168-298) · Spell · Chaos · 2 · [Hidden] [Action]
 *     "Move a unit from a battlefield to its base."  (played here from facedown for 0)
 *   × Stupefy (ogn-095-298) · Spell · Mind · 1 · [Reaction]
 *     "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *
 * Rules: 359.3.f.1 / 359.3.f.2 ("here" and "my Might" are referents read from the SOURCE when the
 * instruction executes — this pairing is the CR's own example), 359.3.f.2.a (an illegal referent →
 * null → the instruction is ignored), 359.3.e.9 (mistargeting), 811.1.d (a hidden card is played
 * for 0 from facedown, choosing from units at THAT battlefield), LIFO chain resolution, 465/466
 * (combat with no attackers / no defenders left).
 *
 * Note: the printed Yasuo, Remorseful is 6 Might (the CR example's "5" is his Might after Stupefy).
 *
 * Question: P1 moves Yasuo into bf1, held by P2 with defender D (7 Might, survives a 6-point hit)
 * and a facedown Fight or Flight; P2 also holds Stupefy + 1 energy. Yasuo's trigger goes on the
 * chain (D is the only enemy there).
 *   (a) P2 flips Fight or Flight on Yasuo → Yasuo to P1's base first; when the trigger resolves
 *       "here" is P1's base, D is not "here" → no damage. No attackers remain → combat ends with no
 *       damage; P2 keeps bf1.
 *   (b) P2 flips Fight or Flight on D → D to P2's base; D no longer "here" → no damage; Yasuo alone
 *       at bf1 → conquers.
 *   (c) P2 Stupefies Yasuo → resolves first (Yasuo 5 Might, P2 draws 1); trigger then deals Yasuo's
 *       CURRENT Might (5), not 6.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const YASUO_REMORSEFUL = "ogn-076-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const STUPEFY = "ogn-095-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. Yasuo (6) ready in P1's base. P2 controls bf1 with a vanilla 7-Might Defender "dd" and a
 * facedown Fight or Flight there; P2 has 1 energy and Stupefy in hand.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
    .unit(P2, "bf1", { might: 7, name: "Defender" }, "dd")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .resources(P2, { energy: 1 })
    .hand(P2, STUPEFY, "stupefy");
}

/** Yasuo attacks bf1; his trigger is on the chain and P1 (first to act) passes priority to P2. */
async function yasuoAttacks(game: Game): Promise<void> {
  await game.p1.move("yasuo", "bf1");
  expect(game.state("yasuo").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
}

/** P2 flips the facedown Fight or Flight choosing `target`; both pass so it (the top item) resolves. */
async function flipFightOrFlight(game: Game, target: "yasuo" | "dd"): Promise<void> {
  await game.p2.reveal("fof");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2 });
  const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
  expect(new Set(offered)).toEqual(new Set(["yasuo", "dd"])); // units at THAT battlefield (811.1.d)
  await game.p2.pick(target);
  expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "fof"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("fof")).toBe("trash");
  expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]); // Yasuo's trigger still waiting
}

/** Both pass → Yasuo's trigger (now the top/only item) resolves. */
async function resolveYasuoTrigger(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.options.length === 1) {
    await game.p1.pick(d.options[0]?.key as string);
  }
  expect(game.chain()).toEqual([]);
}

describe("Yasuo, Remorseful — 'here' and 'my Might' are read on resolution (359.3.f.2) × Fight or Flight / Stupefy", () => {
  // ── baseline ───────────────────────────────────────────────────────────────────────────────

  test("baseline (no response): the trigger deals Yasuo's Might (6) to D before combat damage — D has exactly 6 damage and is still at bf1 when the showdown continues", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await game.p2.passPriority(); // trigger resolves (D is the only enemy unit here)
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("dd");
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("dd").damage).toBe(6);
    expect(game.zoneOf("dd")).toBe("battlefield-bf1");
    expect(game.state("yasuo").might).toBe(6);
  });

  test("P2's legal responses to the trigger include flipping the facedown Fight or Flight (for 0) and casting Stupefy (1 energy) on either unit at bf1", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    expect(game.p2.can("reveal", "fof")).toBe(true);
    expect(game.p2.can("cast", "stupefy")).toBe(true);
    const targets = game.p2.option("cast", "stupefy")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(new Set(targets.flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))).toEqual(new Set(["yasuo", "dd"]));
  });

  // ── (a) Fight or Flight on Yasuo ──────────────────────────────────────────────────────────

  test("(a) Fight or Flight from facedown costs P2 nothing and resolves FIRST (LIFO): Yasuo is in P1's base while his trigger is still on the chain", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await flipFightOrFlight(game, "yasuo");
    expect(game.p2.energy()).toBe(1); // played for [0] from facedown
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.state("yasuo").owner).toBe(P1);
    expect(game.p1.units("base")).toContain("yasuo");
    expect(game.zoneOf("dd")).toBe("battlefield-bf1");
    expect(game.state("dd").damage).toBe(0);
  });

  test("(a) when the trigger then resolves, 'here' is Yasuo's CURRENT location (P1's base): D is not an enemy unit here → no damage at all (359.3.f.2, 359.3.f.2.a)", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await flipFightOrFlight(game, "yasuo");
    await resolveYasuoTrigger(game);
    expect(game.state("dd").damage).toBe(0);
    expect(game.zoneOf("dd")).toBe("battlefield-bf1");
    expect(game.state("yasuo").damage).toBe(0);
    // No stray "choose an enemy unit" prompt for P1 either.
    expect(game.decision()?.kind).toBe("action");
  });

  test("(a) end state: no attacker left at bf1 → combat ends with no damage exchanged; P2 keeps bf1 uncontested with D unhurt; Yasuo sits exhausted in P1's base; P1 scores nothing", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await flipFightOrFlight(game, "yasuo");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.zoneOf("dd")).toBe("battlefield-bf1");
    expect(game.state("dd").damage).toBe(0);
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.state("yasuo")).toMatchObject({ damage: 0, isExhausted: true, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p1.trash()).toEqual([]);
  });

  // ── (b) Fight or Flight on D ──────────────────────────────────────────────────────────────

  test("(b) Fight or Flight on P2's own D sends it to P2's base; when the trigger resolves D is no longer 'here' (bf1) → mistarget, D takes no damage (359.3.f.2.a)", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await flipFightOrFlight(game, "dd");
    expect(game.zoneOf("dd")).toBe("base");
    expect(game.p2.units("base")).toContain("dd");
    expect(game.zoneOf("yasuo")).toBe("battlefield-bf1");
    await resolveYasuoTrigger(game);
    expect(game.state("dd").damage).toBe(0);
    expect(game.zoneOf("dd")).toBe("base");
    expect(game.decision()?.kind).toBe("action");
  });

  test("(b) end state: Yasuo is the lone attacker with no defenders → no combat damage, P1 conquers bf1 and scores 1; D sits unhurt in P2's base", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await flipFightOrFlight(game, "dd");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.locationOf("yasuo")).toBe("bf1");
    expect(game.state("yasuo").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("dd")).toBe("base");
    expect(game.state("dd").damage).toBe(0);
    expect(game.p2.trash()).toEqual(["fof"]);
  });

  // ── (c) Stupefy on Yasuo ──────────────────────────────────────────────────────────────────

  test("(c) Stupefy (1 energy) resolves first: Yasuo is 5 Might this turn and P2 draws 1; Yasuo's trigger is still on the chain", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    const hand0 = game.p2.hand().length; // includes Stupefy
    const deck0 = game.p2.deck().length;
    await game.p2.cast("stupefy", { targets: "yasuo" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "stupefy"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("yasuo").might).toBe(5);
    expect(game.state("yasuo").baseMight).toBe(6);
    expect(game.p2.hand()).toHaveLength(hand0 - 1 + 1); // Stupefy left, drew 1
    expect(game.p2.deck()).toHaveLength(deck0 - 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]);
    expect(game.state("dd").damage).toBe(0);
  });

  test("(c) the trigger then deals damage equal to Yasuo's CURRENT Might = 5 (not the 6 he had when it triggered) to D (359.3.f.2)", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await game.p2.cast("stupefy", { targets: "yasuo" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Stupefy resolves
    await resolveYasuoTrigger(game);
    expect(game.state("yasuo").might).toBe(5);
    expect(game.state("dd").damage).toBe(5);
    expect(game.state("dd").damage).not.toBe(6);
    expect(game.zoneOf("dd")).toBe("battlefield-bf1"); // 5 < 7
  });

  test("(c) the -1 Might is 'this turn' only: after the turn passes Yasuo (if alive) reads 6 again — checked on a board where D cannot kill him", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
      .unit(P2, "bf1", { might: 2, name: "Small Defender" }, "small")
      .resources(P2, { energy: 1 })
      .hand(P2, STUPEFY, "stupefy")
      .build();
    await game.p1.move("yasuo", "bf1");
    await game.p1.passPriority();
    await game.p2.cast("stupefy", { targets: "yasuo" });
    await game.settle();
    expect(game.state("yasuo").might).toBe(5);
    expect(game.zoneOf("small")).toBe("trash"); // 5 ≥ 2 from the trigger alone
    expect(game.locationOf("yasuo")).toBe("bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("yasuo").might).toBe(6);
  });
});

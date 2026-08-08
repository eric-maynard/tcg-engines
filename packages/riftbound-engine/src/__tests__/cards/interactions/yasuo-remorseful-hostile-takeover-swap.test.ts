/**
 * Interaction: Yasuo, Remorseful (ogn-076-298) · Champion Unit · Calm · 6 · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Hostile Takeover (sfd-202-221) · Spell · Mind/Order · 5 · [Hidden] Action
 *     "Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are
 *      there. Otherwise, conquer.) Lose control of that unit and recall it at end of turn."
 *   (contrast: Fight or Flight ogn-168-298 · [Hidden] Action · "Move a unit from a battlefield to its base.")
 *
 * Rules: 359.3.f.4 / 191.4.a (a chain item keeps its controller even if its SOURCE changes controllers;
 * "enemy"/"friendly" in a triggered ability's effect are relative to the ability), 359.3.f.2 ("here" and
 * "my Might" are referents read from the source when the instruction executes — the CR's own Yasuo ×
 * Hostile Takeover example), 383.4.e (attack trigger), 355.5 (target locked at finalize), 811.1.b/811.1.d
 * (a hidden card is played for 0 as a Reaction, choosing from that battlefield), 323.2.b (a unit whose
 * designation no longer matches its controller is re-designated at the next cleanup), 465/466 (no
 * attacking units left → no combat damage; defender keeps the field), 317.1 / 455 (HT's end-of-turn
 * "lose control and recall").
 *
 * Question: P1 walks Yasuo (6) into bf1, held by P2 with unit Z and a facedown Hostile Takeover. Yasuo's
 * attack trigger targets Z. P2 flips Hostile Takeover on Yasuo (takes him, readies him). When the trigger
 * resolves: who controls it, is Z still "enemy", whose Might, does Z take the damage? Afterwards? Contrast
 * with P2 instead moving Yasuo away (Fight or Flight).
 *
 * Expected: the trigger stays P1's; Z (P2's) is still an enemy OF THE ABILITY; Yasuo is still "here" with
 * 6 Might → Z is dealt 6 (dies if ≤ 6). HT neither counters nor fizzles it. Then Yasuo is a P2 unit: no
 * attackers remain, combat ends without damage, P2 keeps bf1, nobody scores; at end of turn Yasuo reverts
 * to P1 and is recalled to P1's base. Contrast: moved away, "here" no longer matches → Z takes nothing.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const YASUO_REMORSEFUL = "ogn-076-298";
const HOSTILE_TAKEOVER = "sfd-202-221";
const FIGHT_OR_FLIGHT = "ogn-168-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Turn 3, P1 active (P2 hid its card on an earlier turn). Yasuo ready in P1's base; P2 controls bf1 with
 * vanilla "Unit Z" (default 5 Might — dies to 6) and a facedown there. P2 has NO resources (the flip is free).
 */
function board(opts: { zMight?: number; facedown?: string } = {}) {
  return scenario()
    .turn(3)
    .resources(P2, { energy: 0 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
    .unit(P2, "bf1", { might: opts.zMight ?? 5, name: "Unit Z" }, "Z")
    .facedown(P2, "bf1", opts.facedown ?? HOSTILE_TAKEOVER, "trap");
}

/** Yasuo attacks bf1: his trigger is on the chain targeting Z (the only enemy there); P1 passes to P2. */
async function yasuoAttacks(game: Game): Promise<void> {
  await game.p1.move("yasuo", "bf1");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("Z");
  }
  expect(game.state("yasuo").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true, targets: ["Z"] })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
}

/** P2 flips the facedown (HT or FoF) choosing Yasuo; both pass so that top item resolves. Yasuo's trigger is still waiting. */
async function flipTrapOnYasuo(game: Game): Promise<void> {
  expect(game.p2.can("reveal", "trap")).toBe(true);
  await game.p2.reveal("trap");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P2) {
    expect(d.options.map((o) => o.card ?? o.key)).toContain("yasuo");
    await game.p2.pick("yasuo");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "trap"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("trap")).toBe("trash");
  expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]);
}

/** Everyone passes until the chain is empty (Yasuo's trigger resolves; a forced single pick is taken). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.options.length === 1) {
      await game.seat(d.seat).pick(d.options[0]?.key as string);
    } else {
      await game.acting().passPriority();
    }
  }
  expect(game.chain()).toEqual([]);
}

describe("Yasuo, Remorseful's attack trigger × Hostile Takeover stealing Yasuo in response", () => {
  // ── premise ────────────────────────────────────────────────────────────────────────────────

  test("premise: moving Yasuo into bf1 opens the combat (P1 attacker) and puts his attack trigger on the chain, controlled by P1, targeting Z (383.4.e, 355.5)", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    expect(game.state("Z").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
  });

  test("P2's response window: with 0 resources P2 may flip the facedown Hostile Takeover (Reaction from hidden, cost ignored — 811.1.b); Yasuo, the only enemy unit at bf1, is its object (811.1.d)", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.can("reveal", "trap")).toBe(true);
    await game.p2.reveal("trap");
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["yasuo"]); // Z is not an enemy to P2
      await game.p2.pick("yasuo");
    }
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "trap"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "trap", controller: P2, triggered: false });
  });

  // ── Hostile Takeover resolves first (LIFO) ─────────────────────────────────────────────────

  test("Hostile Takeover resolves first: Yasuo is now CONTROLLED by P2 (owner P1), readied, still at bf1 with 6 Might — and his trigger is still on the chain, still controlled by P1, still targeting Z (359.3.f.4, 191.4.a)", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await flipTrapOnYasuo(game);
    const y = game.state("yasuo");
    expect(y.controller).toBe(P2);
    expect(y.owner).toBe(P1);
    expect(y.zone).toBe("battlefield-bf1");
    expect(y.isReady).toBe(true);
    expect(y.might).toBe(6);
    expect(game.p2.units("bf1")).toEqual(expect.arrayContaining(["yasuo", "Z"]));
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true, targets: ["Z"], countered: false })]);
  });

  // Expected: 323.2.b — in the cleanup after HT resolves, Yasuo (now P2's, P2 = Defender) carries the
  // opposite designation of his controller, so he loses Attacker and gains Defender. Actual: the engine
  // leaves him flagged "attacker" while the showdown continues (the combat still ends harmlessly later).
  test("after the steal Yasuo's designation flips to his new controller's — Defender — at the next cleanup (323.2.b)", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await flipTrapOnYasuo(game);
    expect(game.state("yasuo").controller).toBe(P2);
    expect(game.state("yasuo").combatRole).toBe("defender");
  });

  // ── the trigger resolves ───────────────────────────────────────────────────────────────────

  test("the trigger then resolves UNCOUNTERED for P1: Z is still an enemy of the ability, Yasuo is still 'here' with 6 Might → Z (5) takes lethal 6 and is put in P2's trash (359.3.f.2, 359.3.f.4)", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await flipTrapOnYasuo(game);
    await drainChain(game);
    expect(game.zoneOf("Z")).toBe("trash");
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["Z", "trap"]));
    // The locked target was Z — Yasuo (now technically an enemy of P1's ability) is not hit instead.
    expect(game.state("yasuo").damage).toBe(0);
    expect(game.zoneOf("yasuo")).toBe("battlefield-bf1");
  });

  test("'my Might' is Yasuo's CURRENT Might regardless of who controls him: against an 8-Might Z the trigger marks exactly 6 damage (not 0, not Z's own Might)", async () => {
    const game = await board({ zMight: 8 }).build();
    await yasuoAttacks(game);
    await flipTrapOnYasuo(game);
    await drainChain(game);
    expect(game.zoneOf("Z")).toBe("battlefield-bf1");
    expect(game.state("Z").damage).toBe(6);
    expect(game.state("yasuo").might).toBe(6);
    expect(game.state("yasuo").damage).toBe(0);
  });

  test("the steal does not counter, fizzle or re-target the trigger: no new target prompt is offered to either player before it resolves (355.15)", async () => {
    const game = await board({ zMight: 8 }).build();
    await yasuoAttacks(game);
    await flipTrapOnYasuo(game);
    // Straight back to priority passing — nobody is asked to (re)choose anything.
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain" });
    await game.acting().passPriority();
    const d = game.decision();
    expect(d?.kind === "pick" && d.options.length > 1).toBe(false);
    await drainChain(game);
    expect(game.state("Z").damage).toBe(6);
  });

  // ── aftermath ──────────────────────────────────────────────────────────────────────────────

  test("aftermath: Yasuo was P1's only attacker and is now P2's → no attacking units remain; the combat ends with no combat damage, P2 keeps bf1 uncontested, nobody scores; Yasuo sits at bf1 under P2, unhurt", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await flipTrapOnYasuo(game);
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("Z")).toBe("trash"); // from the trigger, not from combat
    const y = game.state("yasuo");
    expect(y).toMatchObject({ controller: P2, owner: P1, zone: "battlefield-bf1", damage: 0 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P2, contested: false });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active)).not.toBe(true);
  });

  test("aftermath: at end of P1's turn Hostile Takeover's rider fires — P2 loses control and Yasuo is recalled to his owner P1's base (317.1, 455); P2 scored nothing off him", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await flipTrapOnYasuo(game);
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    const y = game.state("yasuo");
    expect(y.controller).toBe(P1);
    expect(y.owner).toBe(P1);
    expect(y.zone).toBe("base");
    expect(game.p1.units("base")).toContain("yasuo");
    expect(game.p2.units()).not.toContain("yasuo");
    expect(game.p2.points()).toBe(0);
  });

  // ── contrast: move Yasuo away instead ──────────────────────────────────────────────────────

  test("CONTRAST: P2's facedown is Fight or Flight instead and sends Yasuo to P1's base — on resolution 'here' (P1's base) no longer matches Z's battlefield → mistarget, Z takes NOTHING and survives (359.3.f.2 example)", async () => {
    const game = await board({ facedown: FIGHT_OR_FLIGHT }).build();
    await yasuoAttacks(game);
    await flipTrapOnYasuo(game);
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.state("yasuo").controller).toBe(P1);
    await drainChain(game);
    expect(game.zoneOf("Z")).toBe("battlefield-bf1");
    expect(game.state("Z").damage).toBe(0);
    expect(game.decision()?.kind).toBe("action"); // no stray target prompt
    await game.settle();
    expect(game.zoneOf("Z")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P2, contested: false });
    expect(game.p1.points()).toBe(0);
  });

  test("CONTRAST baseline (no response at all): the trigger kills Z, Yasuo is the lone attacker → P1 conquers bf1 and scores 1", async () => {
    const game = await board().build();
    await yasuoAttacks(game);
    await game.settle();
    expect(game.zoneOf("Z")).toBe("trash");
    expect(game.state("yasuo")).toMatchObject({ controller: P1, zone: "battlefield-bf1", damage: 0 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P1, contested: false });
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("trap")).toBe("trash"); // 466.5.c: P2's hidden card at a battlefield P2 no longer controls is removed
  });
});

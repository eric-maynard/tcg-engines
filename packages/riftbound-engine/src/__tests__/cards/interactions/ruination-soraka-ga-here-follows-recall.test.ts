/**
 * Interaction: The Ruination (unl-180-219 · Spell · Order · 9 + [order][order][order]) "Kill all units."
 *   × Soraka, Wanderer (sfd-173-221 · Champion unit · Order · 4 Might, Backline) "If another unit you control HERE would
 *     die, if it has less Might than me, instead heal it, exhaust it, and recall it."
 *   × Guardian Angel (sfd-051-221 · Equipment +1) appends to the bearer: "If I would die, kill Guardian Angel instead.
 *     Heal me, exhaust me, and recall me."   — with two Recruit tokens (ogn-271-298, 1 Might).
 *
 * This is CR 373.2's own example. P2 has Soraka (4 + GA = 5) at bf1 together with Recruit A; Recruit B sits in P2's base.
 * P1 resolves The Ruination: all three P2 units would die simultaneously (370.1.a.2); P2 controls two replacement effects.
 *   (a) Must the engine surface an ORDERING decision to P2?
 *   (b) Branch X — Soraka's effect first (she is still at bf1): which Recruit is saved; what happens to Soraka / the other?
 *   (c) Branch Y — Guardian Angel first: Soraka is healed/exhausted/RECALLED to base before the other deaths execute
 *       (373.1.a); a Recall relocates her (456.2) so 'here' is now P2's BASE — which Recruit does she save now?
 *   (d) Either branch: can both Recruits ever be saved; P2's trash; do dead tokens go to trash; did any move trigger fire;
 *       who controls bf1 afterwards?
 *
 * Rules: 370.1.a.2 (one action → simultaneous deaths), 370.4 (Soraka may replace events simultaneous with her own
 * death), 372 / 373 (same-controller replacements are applied in the order that controller chooses), 373.1.a (a
 * replacement's actions run before the unmodified deaths), 373.2 / 373.2.a (each replacement effect gets ONE
 * uninterrupted sequence — Soraka-first cannot come back for the base Recruit after GA moves her), 455 / 456.1 / 456.2 /
 * 458.1 (a Recall relocates without being a Move: no move triggers, statuses kept), 186.1 (a killed token ceases to
 * exist — never in the trash), 190.4.c / 323.6 (bf1 with no P2 unit becomes uncontrolled at the next Open cleanup).
 * bf1 is a live Back-Alley Bar (ogn-277-298, "When a unit moves from here, give it +1 [Might] this turn") purely as a
 * detector: a Recall from it must NOT fire it.
 *
 * Expected: (a) yes — an RPL ordering prompt for P2 over {Guardian Angel → Soraka's death, Soraka → Recruit A's death}.
 * (b) X: A healed/exhausted/recalled to base; GA killed → P2 trash; Soraka healed/exhausted/recalled (4, unequipped);
 * B is NOT 'here' and Soraka's sequence is spent → B is killed and ceases to exist. (c) Y: GA → trash, Soraka to base
 * first; now 'here' = base → B saved (healed, exhausted, stays in base); A at bf1 is killed and ceases to exist.
 * (d) exactly one Recruit survives and WHICH one flips with the order; P2 trash = [Guardian Angel] only; no Bar
 * trigger, chain empty; Soraka same object (exhausted, 0 damage, Backline); bf1 uncontrolled.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_RUINATION = "unl-180-219";
const SORAKA = "sfd-173-221";
const GUARDIAN_ANGEL = "sfd-051-221";
const RECRUIT = "ogn-271-298";
const BACK_ALLEY_BAR = "ogn-277-298";

type OrderDecision = Extract<Decision, { kind: "order" }>;

/** P1's turn with The Ruination payable. P2: Soraka+GA and Recruit A at bf1 (= live Back-Alley Bar), Recruit B in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { order: 3 } })
    .battlefield("bf1", { controller: P2, def: BACK_ALLEY_BAR, inert: false })
    .unit(P2, "bf1", SORAKA, "soraka", { equippedWith: ["ga"] })
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "soraka" }, owner: P2, zone: "bf1" })
    .unit(P2, "bf1", RECRUIT, "rA")
    .unit(P2, "base", RECRUIT, "rB")
    .hand(P1, THE_RUINATION, "ruin");
}

/** Cast The Ruination and settle up to P2's replacement-ordering prompt (returned), or null if none was asked. */
async function ruinUpToOrdering(game: Game): Promise<OrderDecision | null> {
  await game.p1.cast("ruin");
  const r = await game.settle();
  const d = game.decision();
  return r.reason === "unanswered" && d?.kind === "order" && d.seat === P2 ? d : null;
}

/**
 * Answer the ordering so that the replacement whose SOURCE is `sourceFirst` ("soraka" = Soraka's own effect,
 * "ga" = Guardian Angel's) is applied first, then settle everything.
 */
async function resolveWith(game: Game, sourceFirst: "soraka" | "ga"): Promise<void> {
  const d = await ruinUpToOrdering(game);
  if (!d) {
    throw new Error("expected P2 to be asked to order the replacement effects");
  }
  const first = d.items.find((i) => i.card === sourceFirst);
  if (!first) {
    throw new Error(`no ordering item sourced from ${sourceFirst}: ${JSON.stringify(d.items)}`);
  }
  await game.p2.order([first.key, ...d.items.map((i) => i.key).filter((k) => k !== first.key)]);
  await game.settle();
}

describe("The Ruination × Soraka, Wanderer wearing Guardian Angel × two Recruits — 'here' follows the Recall (CR 373.2 example)", () => {
  test("setup: Soraka is 5 (4 + GA) at bf1 with Recruit A (1); Recruit B (1) in P2's base; both Recruits are tokens", async () => {
    const game = await board().build();
    expect(game.state("soraka")).toMatchObject({ attachments: ["ga"], isReady: true, location: "bf1", might: 5 });
    expect(game.state("rA")).toMatchObject({ isReady: true, isToken: true, location: "bf1", might: 1 });
    expect(game.state("rB")).toMatchObject({ isReady: true, isToken: true, location: "base", might: 1 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ controller: P2 });
  });

  // ================================================================== (a)
  test("(a) resolving 'Kill all units' surfaces ONE replacement-ORDERING decision to P2 (RPL) over her two effects — GA (for Soraka's death) and Soraka (for Recruit A's death); nothing has died or moved while it is open (372/373, 373.1.a)", async () => {
    const game = await board().build();
    const d = await ruinUpToOrdering(game);
    expect(d).not.toBeNull();
    expect(d).toMatchObject({ kind: "order", seat: P2, timing: "RPL" });
    expect((d as OrderDecision).items.map((i) => i.card).sort()).toEqual(["ga", "soraka"]);
    expect((d as OrderDecision).defaultable ?? false).toBe(false); // a real question, not a soft offer
    // The spell is mid-resolution; every unit is still exactly where it was.
    expect(game.zoneOf("ruin")).toBe("chain");
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
    expect(game.zoneOf("rA")).toBe("battlefield-bf1");
    expect(game.zoneOf("rB")).toBe("base");
    expect(game.zoneOf("ga")).toBe("battlefield-bf1");
    expect(game.actingSeat()).toBe(P2);
  });

  // ================================================================== (b) Branch X — Soraka's effect first
  test("(b) Branch X — Soraka first: Recruit A (1 < 5, 'here' = bf1) is healed, exhausted and recalled to base; then GA replaces Soraka's own death — GA killed to P2's trash, Soraka healed/exhausted/recalled at 4, unequipped", async () => {
    const game = await board().build();
    await resolveWith(game, "soraka");
    expect(game.state("rA")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.state("soraka")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 4, zone: "base" });
    expect(game.zoneOf("ruin")).toBe("trash");
  });

  test.failing("BUG: (b)/(d) Branch X — Recruit B (in base, not 'here' when Soraka's effect had its ONE sequence) is killed and ceases to exist; the engine re-applies Soraka's replacement from her new location and saves B too (373.2 / 373.2.a, 186.1)", async () => {
    // Expected: Soraka's effect was applied while she stood at bf1 (saving A); GA then recalls her, but her effect may not
    // start a second sequence for the base Recruit → B dies → token gone; exactly ONE Recruit survives.
    // Actual: after GA recalls Soraka the engine evaluates her replacement again with 'here' = base and heals/exhausts/
    // 'recalls' B as well — both Recruits end in base exhausted.
    const game = await board().build();
    await resolveWith(game, "soraka");
    expect(game.zoneOf("rB")).toBe("gone");
    expect(game.has("rB")).toBe(false);
    expect(["rA", "rB"].filter((r) => game.has(r) && game.zoneOf(r) === "base")).toEqual(["rA"]);
  });

  // ================================================================== (c) Branch Y — Guardian Angel first
  test("(c) Branch Y — GA first: GA is killed to P2's trash and Soraka is healed/exhausted/RECALLED to base at once (373.1.a); her effect is then applied with 'here' = BASE (456.2): Recruit B (1 < 4) is saved — healed, exhausted, still in base", async () => {
    const game = await board().build();
    await resolveWith(game, "ga");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.state("soraka")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 4, zone: "base" });
    expect(game.state("rB")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
  });

  test("(c) Branch Y — …and Recruit A, left at bf1 which is no longer 'here', is killed: as a token it ceases to exist (186.1) — not in any zone, not in the trash", async () => {
    const game = await board().build();
    await resolveWith(game, "ga");
    expect(game.has("rA")).toBe(false);
    expect(game.zoneOf("rA")).toBe("gone");
    expect(game.locationOf("rA")).toBeUndefined();
    expect(game.p2.trash()).not.toContain("rA");
  });

  // ================================================================== (d) common consequences
  test("(d) WHICH Recruit survives flips with the order — the observable proof that the Recall relocated Soraka mid-sequence: X keeps A (from bf1), Y keeps B (in base) and loses A", async () => {
    const x = await board().build();
    await resolveWith(x, "soraka");
    expect(x.zoneOf("rA")).toBe("base");

    const y = await board().build();
    await resolveWith(y, "ga");
    expect(y.zoneOf("rB")).toBe("base");
    expect(y.zoneOf("rA")).toBe("gone");
    expect(["rA", "rB"].filter((r) => y.has(r))).toEqual(["rB"]); // exactly one survivor in Y
  });

  for (const first of ["soraka", "ga"] as const) {
    test(`(d) [${first} first] P2's trash holds exactly Guardian Angel — no unit card, no token (186.1); The Ruination is in P1's trash`, async () => {
      const game = await board().build();
      await resolveWith(game, first);
      expect(game.p2.trash()).toEqual(["ga"]);
      expect(game.p2.trash().some((id) => game.state(id).isToken)).toBe(false);
      expect(game.p1.trash()).toEqual(["ruin"]);
    });

    test(`(d) [${first} first] the Recalls are not Moves (456.1): Back-Alley Bar never triggers — chain empty, Soraka exactly 4 (no +1), the surviving Recruit exactly 1; Soraka is the same object: exhausted, undamaged, Backline intact (458.1)`, async () => {
      const game = await board().build();
      await resolveWith(game, first);
      expect(game.chain()).toEqual([]);
      expect(game.state("soraka")).toMatchObject({ damage: 0, isExhausted: true, might: 4, mightModifier: 0, owner: P2, zone: "base" });
      expect(game.state("soraka").keywords).toContain("Backline");
      const survivor = first === "soraka" ? "rA" : "rB";
      expect(game.state(survivor)).toMatchObject({ might: 1, mightModifier: 0 });
    });

    test(`(d) [${first} first] bf1 has no P2 unit left → uncontrolled after the Open-state cleanup (190.4.c/323.6); play returns to P1's Neutral Open main phase with no violations`, async () => {
      const game = await board().build();
      await resolveWith(game, first);
      expect(game.p2.units("bf1")).toEqual([]);
      expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
      expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
      expect(game.violations()).toEqual([]);
    });
  }
});

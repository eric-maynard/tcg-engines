/**
 * Ruling 013355072ffd6542 — Alpha Strike (UNL-192 → unl-192-219)
 *   "[Action] Choose a friendly unit. It deals damage equal to its Might split among enemy units at
 *    battlefields. Then for each unit this kills, do this: Gain 1 XP."
 *   × Stupefy (ogn-095-298) "[Reaction] Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1."
 *   × En Garde (ogn-046-298) "[Reaction] Give a friendly unit +1 [Might] this turn, then +1 more if alone."
 *
 * Q: What if my unit's Might is reduced before Alpha Strike resolves?
 * A: The damage pool shrinks. If it is now smaller than the number of chosen enemy targets, the caster
 *    must drop the MINIMUM number of targets so that #targets == current Might — no dropping extra
 *    targets to concentrate damage. Every remaining target then takes at least 1. Costs paid / effects
 *    triggered by the dropped units having been chosen stay paid / triggered.
 * Rules: 355.14.h, 355.14.h.1, 355.14.i.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALPHA_STRIKE = "unl-192-219";
const STUPEFY = "ogn-095-298";
const EN_GARDE = "ogn-046-298";
const BIRD = "unl-t02"; // 1-Might unit token with [Deflect]

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
const RECRUIT = (name: string) => ({ might: 1, name });

function dropPrompt(game: Game): Extract<Decision, { kind: "pick" }> {
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "drop-target" });
  return d as Extract<Decision, { kind: "pick" }>;
}

const offered = (d: Extract<Decision, { kind: "pick" }>) => d.options.map((o) => o.card ?? o.key).sort();

describe("Ruling 013355072ffd6542 — Alpha Strike: Might reduced before resolution ⇒ drop the minimum number of targets", () => {
  // ── Example 1: 5-Might ally, five 1-Might Recruits, Might reduced by 2 → drop exactly 2 ─────────

  /** P1's 5-Might ally in base; P2 has five 1-Might Recruits across two battlefields and two Stupefies. */
  function fiveBoard() {
    return scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 5, name: "Champion" }, "ally")
      .unit(P2, "bf1", RECRUIT("Recruit A"), "r1")
      .unit(P2, "bf1", RECRUIT("Recruit B"), "r2")
      .unit(P2, "bf1", RECRUIT("Recruit C"), "r3")
      .unit(P2, "bf2", RECRUIT("Recruit D"), "r4")
      .unit(P2, "bf2", RECRUIT("Recruit E"), "r5")
      .hand(P1, ALPHA_STRIKE, "alpha")
      .hand(P2, STUPEFY, "stupefy1")
      .hand(P2, STUPEFY, "stupefy2");
  }

  test("control: with no response all five chosen Recruits take 1 each and die; no drop prompt is ever shown", async () => {
    const game = await fiveBoard().build();
    await game.p1.cast("alpha", { targets: ["ally", "r1", "r2", "r3", "r4", "r5"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    for (const r of ["r1", "r2", "r3", "r4", "r5"]) {
      expect(game.zoneOf(r)).toBe("trash");
    }
    expect(game.zoneOf("alpha")).toBe("trash");
  });

  test("example: two Stupefies leave the ally at 3 Might → P1 is asked to drop targets one at a time, exactly twice, choosing among the CHOSEN targets only", async () => {
    const game = await fiveBoard().unit(P2, "bf2", RECRUIT("Bystander"), "bystander").build();
    await game.p1.cast("alpha", { targets: ["ally", "r1", "r2", "r3", "r4", "r5"] });
    await game.p1.passPriority();
    await game.p2.cast("stupefy1", { targets: "ally" });
    await game.p2.cast("stupefy2", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["alpha", "stupefy1", "stupefy2"]);
    // Let both Stupefies resolve, stop before Alpha Strike does.
    while (game.chain().length > 1) {
      await game.acting().passPriority();
    }
    expect(game.state("ally").might).toBe(3);
    expect(game.chain().map((c) => c.cardId)).toEqual(["alpha"]);

    // Alpha Strike resolves: 3 damage, 5 targets → P1 must drop targets (355.14.h).
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const first = dropPrompt(game);
    expect(first.min).toBe(1);
    expect(first.max).toBe(1);
    expect(offered(first)).toEqual(["r1", "r2", "r3", "r4", "r5"]); // never the un-chosen bystander
    await game.p1.pick("r5");

    const second = dropPrompt(game);
    expect(offered(second)).toEqual(["r1", "r2", "r3", "r4"]);
    await game.p1.pick("r4");

    // Exactly two drops: #targets (3) == Might (3) → no third prompt; each remaining target takes ≥1.
    const done = await game.settle();
    expect(done.reason).toBe("open");
    expect(game.decision()?.kind).toBe("action");
    for (const r of ["r1", "r2", "r3"]) {
      expect(game.state(r).damage + (game.zoneOf(r) === "trash" ? 1 : 0)).toBeGreaterThanOrEqual(1);
      expect(game.zoneOf(r)).toBe("trash"); // 1 damage kills a 1-Might Recruit
    }
    for (const r of ["r4", "r5", "bystander"]) {
      expect(game.zoneOf(r)).toBe("battlefield-bf2");
      expect(game.state(r).damage).toBe(0);
    }
    expect(game.zoneOf("alpha")).toBe("trash");
  });

  // ── Warn callout: 3-Might ally, three Recruits; Stupefy (-1) + En Garde on one Recruit ──────────

  /** P1's 3-Might ally; P2 has three 1-Might Recruits plus an un-chosen bystander at bf2. */
  function threeBoard() {
    return scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Champion" }, "ally")
      .unit(P2, "bf1", RECRUIT("Recruit A"), "r1")
      .unit(P2, "bf1", RECRUIT("Recruit B"), "r2")
      .unit(P2, "bf2", RECRUIT("Recruit C"), "r3")
      .unit(P2, "bf2", { might: 4, name: "Bystander" }, "bystander")
      .hand(P1, ALPHA_STRIKE, "alpha")
      .hand(P2, STUPEFY, "stupefy")
      .hand(P2, EN_GARDE, "engarde");
  }

  async function toDropPrompt(game: Game): Promise<void> {
    await game.p1.cast("alpha", { targets: ["ally", "r1", "r2", "r3"] });
    await game.p1.passPriority();
    await game.p2.cast("stupefy", { targets: "ally" });
    await game.p2.cast("engarde", { targets: "r3" });
    while (game.chain().length > 1) {
      await game.acting().passPriority();
    }
    expect(game.state("ally").might).toBe(2); // 3 - 1
    // En Garde raised r3 above 1 (whether +1 or +2 is En Garde's own concern, not this ruling's).
    expect(game.state("r3").might).toBeGreaterThanOrEqual(2);
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
  }

  test("2 damage but 3 targets → P1 must drop EXACTLY one target; afterwards no further drop is offered and both remaining targets take 1", async () => {
    const game = await threeBoard().build();
    await toDropPrompt(game);
    const d = dropPrompt(game);
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect(d.allowDecline).toBe(false); // dropping is mandatory
    expect(offered(d)).toEqual(["r1", "r2", "r3"]);
    await game.p1.pick("r1");
    // No second drop prompt (355.14.h.1): 2 targets == 2 Might.
    const done = await game.settle();
    expect(done.reason).toBe("open");
    expect(game.zoneOf("r1")).toBe("battlefield-bf1");
    expect(game.state("r1").damage).toBe(0);
    expect(game.zoneOf("r2")).toBe("trash"); // 1 damage on a 1-Might Recruit
    expect(game.zoneOf("r3")).toBe("battlefield-bf2"); // 1 damage on the 2-Might (En Garde) Recruit
    expect(game.state("r3").damage).toBe(1);
    expect(game.state("bystander").damage).toBe(0);
  });

  test("P1 cannot drop two targets at once to concentrate both damage on the 2-Might Recruit (355.14.h.1)", async () => {
    const game = await threeBoard().build();
    await toDropPrompt(game);
    dropPrompt(game);
    const both = await game.p1.try((p) => p.pick("r1", "r2"));
    expect(both.ok).toBe(false);
    // Still waiting for exactly one drop; nothing has been dealt yet.
    dropPrompt(game);
    expect(game.state("r3").damage).toBe(0);
    await game.p1.pick("r2");
    await game.settle();
    // r3 did NOT receive both points: r1 took 1 (dies) and r3 took 1 (survives at 2 Might).
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.zoneOf("r2")).toBe("battlefield-bf1");
    expect(game.zoneOf("r3")).toBe("battlefield-bf2");
    expect(game.state("r3").damage).toBe(1);
  });

  // ── 355.14.i: costs paid because a (later dropped) unit was chosen stay paid ────────────────────

  test("a Deflect surcharge paid to choose a target is not refunded when that target is later dropped (355.14.i)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 2 } }) // 1 for Alpha Strike's own pip + 1 for Deflect
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Champion" }, "ally")
      .unit(P2, "bf1", RECRUIT("Recruit A"), "r1")
      .unit(P2, "bf1", BIRD, "bird")
      .hand(P1, ALPHA_STRIKE, "alpha")
      .hand(P2, STUPEFY, "stupefy")
      .build();
    expect(game.state("bird").keywords).toContain("Deflect");
    await game.p1.cast("alpha", { targets: ["ally", "r1", "bird"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // Deflect pip paid
    await game.p1.passPriority();
    await game.p2.cast("stupefy", { targets: "ally" });
    while (game.chain().length > 1) {
      await game.acting().passPriority();
    }
    expect(game.state("ally").might).toBe(1);
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(offered(dropPrompt(game))).toEqual(["bird", "r1"]);
    await game.p1.pick("bird");
    await game.settle();
    expect(game.p1.power()).toBe(0); // no refund for the dropped Deflect target
    expect(game.state("bird").damage).toBe(0);
    expect(game.zoneOf("bird")).toBe("battlefield-bf1");
    expect(game.zoneOf("r1")).toBe("trash");
  });
});

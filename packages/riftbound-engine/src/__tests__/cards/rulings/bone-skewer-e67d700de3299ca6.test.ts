/**
 * Ruling e67d700de3299ca6 — Bone Skewer (UNL-139 → unl-139-219) · Spell · Chaos · 2+[chaos]
 *   "[Hidden] Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play
 *    that unit to that battlefield, ignoring any and all costs. When they do, [Stun] it."
 *   × Ruin Runner (sfd-105-221) · Unit · Body · 6 · 5 Might — "I can't be chosen by enemy spells and abilities."
 *
 * Q: Can Bone Skewer choose a unit that says it "can't be chosen by enemy spells and abilities"?
 * A: Yes. That passive only functions while the permanent is on the board, so it is inactive in hand;
 *    and cards in hand are never targets anyway (hand is not a public zone), so nothing is "targeted".
 * Rules: 757 / 757.1 (untargetable), 365.1 / 366.1 (passives work on the board unless self-described
 *        otherwise), 355.10.a (hand cards are never targets), 355.5.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";
const RUIN_RUNNER = "sfd-105-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P1 controls bf1 (own 2-might Guard there). P1 holds Bone Skewer with exactly [2][chaos].
 * P2's hand: Ruin Runner, a vanilla 2-cost Grunt, and a spell (not a unit — must not be offered).
 * P2 has NO resources: "ignoring any and all costs" means the Runner (6) is still played.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .hand(P1, BONE_SKEWER, "skewer")
    .hand(P2, RUIN_RUNNER, "runner")
    .hand(P2, { cardType: "unit", energyCost: 2, might: 2, name: "Grunt" }, "grunt")
    .hand(P2, { cardType: "spell", energyCost: 1, name: "Some Spell" }, "p2spell");
}

/** Cast Bone Skewer choosing bf1 (however the engine spells the battlefield choice) and settle to P1's unit pick. */
async function skewerAtBf1(game: Game): Promise<Extract<Decision, { kind: "pick" }>> {
  const field = game.p1.option("cast", "skewer")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.cast("skewer", { targets: "bf1" });
  } else {
    await game.p1.cast("skewer");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  for (let i = 0; i < 4; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "bf1")) {
      await game.p1.pick("bf1"); // battlefield chosen on resolution instead
      continue;
    }
    break;
  }
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d as Extract<Decision, { kind: "pick" }>;
}

describe("Ruling e67d700de3299ca6 — Bone Skewer may choose an 'untargetable' unit from the opponent's hand", () => {
  test("setup: Bone Skewer is castable from hand for [2][chaos] on P1's turn; Ruin Runner waits in P2's hand and P2 has no resources of its own", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "skewer")).toBe(true);
    expect(game.zoneOf("runner")).toBe("hand");
    expect(game.state("runner").owner).toBe(P2);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.can("play", "runner")).toBe(false); // not P2's turn / can't afford — only Skewer will get it out
  });

  // Expected: Bone Skewer resolves → P2's hand is revealed and P1 is asked to choose a unit FROM IT: the
  // offered set is exactly P2's hand units {runner, grunt} — Ruin Runner included (its passive is inactive
  // in hand; hand cards are not targets), the spell excluded. Actual: Bone Skewer's effect is
  // unimplemented (only [Hidden] is modelled) — it resolves doing nothing and no pick ever appears.
  test.failing("BUG: ruling e67d700de3299ca6 — P1's 'choose a unit from it' pick offers Ruin Runner (and Grunt, not the spell) from P2's revealed hand (engine: effect unimplemented)", async () => {
    const game = await board().build();
    const d = await skewerAtBf1(game);
    const offered = d.options.map((o) => o.card ?? o.key);
    expect(offered).toContain("runner");
    expect(offered).toContain("grunt");
    expect(offered).not.toContain("p2spell");
    expect(offered).not.toContain("guard"); // not P1's board — P2's HAND
    expect(d.allowDecline).toBe(true); // "You MAY choose"
  });

  // Expected: choosing Ruin Runner works — P2 plays it to bf1 ignoring any and all costs (P2 has 0/0),
  // it arrives under P2's control at bf1 and is Stunned; Bone Skewer → P1's trash. Actual: see above.
  test.failing("BUG: ruling e67d700de3299ca6 — choosing Ruin Runner: P2 plays it to bf1 for free, it is stunned there; Skewer → trash", async () => {
    const game = await board().build();
    await skewerAtBf1(game);
    await game.p1.pick("runner");
    await game.settle({ policy: "first" }); // any forced follow-ups for P2's cost-free play
    expect(game.zoneOf("runner")).toBe("battlefield-bf1");
    expect(game.state("runner").controller).toBe(P2);
    expect(game.state("runner").isStunned).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // paid nothing for a 6-cost unit
    expect(game.zoneOf("grunt")).toBe("hand");
    expect(game.zoneOf("skewer")).toBe("trash");
  });

  // Expected: choosing the hand Runner is not "targeting" it — no Deflect-style surcharge or illegality;
  // the cast itself only ever chooses a battlefield (bf1/bf2), never a card in a hand (355.10.a, 355.5).
  // Actual: the cast offers no choices at all (effect unimplemented).
  test.failing("BUG: ruling e67d700de3299ca6 — at play time Bone Skewer only chooses a battlefield; no hand card is ever a play-time target", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "skewer")?.fields.find((f) => f.name === "targets");
    const offered = (field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered).toContain("bf1");
    expect(offered).not.toContain("runner");
    expect(offered).not.toContain("grunt");
  });
});

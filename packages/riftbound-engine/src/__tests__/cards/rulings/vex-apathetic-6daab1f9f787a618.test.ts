/**
 * Ruling 6daab1f9f787a618 — Vex, Apathetic (unl-150-219) · Champion Unit · Chaos · 4 · 4 Might
 *   "[Deflect] … When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it
 *    this turn."
 *   × Ruin Runner (sfd-105-221) "I can't be chosen by enemy spells and abilities."
 *
 * Q: Does Vex's triggered ability TARGET the unit that was just played?
 * A: No. The unit to stun is determined automatically — always and only the unit the opponent just played —
 *    so no choice is made and it is not a target (355.10.d). Hence "can't be chosen by enemy spells and
 *    abilities" is no defence, and Deflect never applies (it only taxes choosing a target, 809.1.d).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const RUIN_RUNNER = "sfd-105-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P2's turn. P1's Vex sits at bf1 (or in base for the control); P1 holds 2 rainbow it must never need. */
function board(vexAt: "bf1" | "base") {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 6 })
    .resources(P1, { energy: 0, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, vexAt, VEX, "vex");
}

/**
 * After P2's play: pass priority on Vex's trigger for both seats until it has resolved, recording every
 * non-action prompt seen on the way. Per the ruling there must be none — the stun is automatic.
 */
async function resolveVexTrigger(game: Game): Promise<Decision[]> {
  const prompts: Decision[] = [];
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action") {
      if (d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
        continue;
      }
      break; // back to P2's open main phase
    }
    prompts.push(d);
    break;
  }
  return prompts;
}

describe("Ruling 6daab1f9f787a618 — Vex, Apathetic's stun is automatic, not targeted", () => {
  // Expected: P2 plays Ruin Runner while Vex is at bf1 → Vex triggers and, with no choice made by anyone,
  // the Runner is stunned; "can't be chosen" is irrelevant and P1 pays no [rainbow] (355.10.d, 809.1.d).
  // Actual: the engine treats the stun as a targeted choice ("Choose a target for Vex") whose candidate set
  // excludes the unchoosable Runner — leaving only Vex herself — so the Runner is never stunned.
  test.failing("BUG: ruling 6daab1f9f787a618 — Ruin Runner ('can't be chosen') played under Vex is stunned automatically; no target prompt, no Deflect-style payment", async () => {
    const game = await board("bf1").hand(P2, RUIN_RUNNER, "runner").build();
    await game.p2.play("runner");
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P1, triggered: true })]);
    const prompts = await resolveVexTrigger(game);
    expect(prompts).toEqual([]); // nobody chooses anything
    expect(game.chain()).toEqual([]);
    expect(game.state("runner").isStunned).toBe(true);
    expect(game.state("vex").isStunned).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } }); // nothing paid to "choose"
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  // Expected: same for an ordinary unit — the just-played unit is stunned with no "choose a target" step.
  // Actual: the engine asks P1 to pick a target (offering the played unit AND Vex herself).
  test.failing("BUG: ruling 6daab1f9f787a618 — an ordinary unit played under Vex is stunned with no choice offered to anyone (engine prompts P1 to pick, even offering Vex)", async () => {
    const game = await board("bf1").hand(P2, { energyCost: 2, might: 3, name: "Recruit" }, "recruit").build();
    await game.p2.play("recruit");
    const prompts = await resolveVexTrigger(game);
    expect(prompts).toEqual([]);
    expect(game.state("recruit").isStunned).toBe(true);
    expect(game.state("vex").isStunned).toBe(false);
  });

  // Expected: a unit with Deflect (here: P2's own Vex, Apathetic — Deflect 1) is stunned all the same and
  // P1's rainbow pool is untouched, because Deflect only taxes CHOOSING (809.1.d). Actual: target prompt.
  test.failing("BUG: ruling 6daab1f9f787a618 — a Deflect unit played under Vex is stunned and P1 pays no [rainbow]", async () => {
    const game = await board("bf1").hand(P2, VEX, "theirVex").build();
    await game.p2.play("theirVex");
    expect(game.state("theirVex").keywords).toContain("Deflect");
    const prompts = await resolveVexTrigger(game);
    expect(prompts).toEqual([]);
    expect(game.state("theirVex").isStunned).toBe(true);
    expect(game.p1.power("rainbow")).toBe(2);
  });

  test("control: Vex in BASE (not at a battlefield) — an opponent's unit play triggers nothing and is not stunned", async () => {
    const game = await board("base").hand(P2, RUIN_RUNNER, "runner").build();
    await game.p2.play("runner");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("runner").isStunned).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("control: the trigger is Vex's controller's (P1) chain item when an OPPONENT plays a unit while she is at bf1 — P1's own unit plays do not trigger it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", VEX, "vex")
      .hand(P1, { energyCost: 2, might: 2, name: "Friend" }, "friend")
      .build();
    await game.p1.play("friend", { to: "base" });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("friend").isStunned).toBe(false);
  });
});

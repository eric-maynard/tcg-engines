/**
 * Ruling b8b9a42aa966e9ee — Vex, Apathetic (UNL-150 → unl-150-219) "[Deflect] … When an opponent plays a unit while I'm at a
 *   battlefield, [Stun] it. They can't move it this turn." × Baron Nashor (UNL-147 → unl-147-219) / Ruin Runner (SFD-105 →
 *   sfd-105-221) "I can't be chosen by enemy spells and abilities."
 *
 * Q: Does Vex, Apathetic target?
 * A: No. The unit to stun is programmatically selected by the trigger condition (the unit the opponent just played) — no choice
 *    is made, so it is not a target (355.10.d) and "can't be chosen by enemy spells and abilities" (Baron Nashor, Ruin Runner)
 *    does not protect it.
 * Rules: 355.10.d (programmatic selection ≠ targeting), Untargetable only stops being CHOSEN.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const RUIN_RUNNER = "sfd-105-221";
const BARON_NASHOR = "unl-147-219";

/** P2's turn. P1's Vex sits at bf1. P2 has plenty of resources for either big unit. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 10, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", VEX, "vex");
}

/** Pass priority around Vex's trigger until it resolves, collecting any non-action prompt (there must be none). */
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
      break;
    }
    prompts.push(d);
    break;
  }
  return prompts;
}

describe("Ruling b8b9a42aa966e9ee — Vex, Apathetic does not target: 'can't be chosen' units are stunned all the same", () => {
  test("Ruin Runner ('I can't be chosen by enemy spells and abilities') played by P2 while Vex is at bf1: Vex triggers, NOBODY is asked to choose anything, and the Runner is stunned + can't move this turn", async () => {
    const game = await board().hand(P2, RUIN_RUNNER, "runner").build();
    expect(game.state("vex").location).toBe("bf1");
    await game.p2.play("runner", { to: "base" });
    expect(game.zoneOf("runner")).toBe("base");
    expect(game.state("runner").keywords).toContain("Untargetable");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P1, triggered: true })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]); // no target recorded on the item
    const prompts = await resolveVexTrigger(game);
    expect(prompts).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.state("runner").isStunned).toBe(true);
    expect(game.state("runner").keywords).toContain("NoMove");
    expect(game.p2.can("move", "runner")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("Baron Nashor ('I can't be chosen by enemy spells and abilities') played by P2 while Vex is at bf1: same — stunned automatically with no choice made", async () => {
    const game = await board().hand(P2, BARON_NASHOR, "baron").build();
    await game.p2.play("baron", { to: "base" });
    // He may enter at the Baron Pit token; wherever he lands, he was PLAYED by an opponent while Vex is at a battlefield.
    expect(["base", "battlefield"].some((z) => game.zoneOf("baron").startsWith(z))).toBe(true);
    expect(game.state("baron").keywords).toContain("Untargetable");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P1, triggered: true })]);
    const prompts = await resolveVexTrigger(game);
    expect(prompts).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.state("baron").isStunned).toBe(true);
    expect(game.state("baron").keywords).toContain("NoMove");
    expect(game.state("vex").isStunned).toBe(false);
  });

  test("control: a spell that DOES choose cannot pick the Ruin Runner — it is absent from an enemy targeted spell's legal targets", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", RUIN_RUNNER, "runner")
      .unit(P2, "bf1", { might: 2, name: "Plain" }, "plain")
      .hand(P1, "ogn-229-298", "venge") // Vengeance "Kill a unit."
      .build();
    const field = game.p1.option("cast", "venge")?.fields.find((f) => f.arg === "targets");
    const offered = (field?.options ?? []).flat() as string[];
    expect(offered).toContain("plain");
    expect(offered).not.toContain("runner");
  });
});

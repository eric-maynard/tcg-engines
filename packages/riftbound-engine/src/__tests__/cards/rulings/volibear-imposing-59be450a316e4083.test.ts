/**
 * Ruling 59be450a316e4083 — Volibear, Imposing (OGN-158 → ogn-158-298) · Champion Unit · Body · [12] · 10 Might
 *     "[Shield 3] [Tank] (I must be assigned combat damage first.) When an opponent moves to a battlefield other
 *      than mine, draw 1."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might "When I attack, deal damage equal to my Might to an enemy
 *     unit here."   (Snapvine Predator stands in as "the other defender" — an inline 7-Might unit here.)
 *
 * Q: Must Volibear's Tank soak ABILITY damage first, or only combat damage? Can Yasuo aim his trigger at another
 *    unit while Volibear defends?
 * A: Tank applies only to combat damage (the Might-vs-Might step at the end of combat). Yasuo's trigger may pick
 *    any enemy unit at the battlefield, Volibear or not.
 * Rules: 815 (Tank — combat damage assignment order), 465.2.c (combat damage step), 383 (triggered ability targets).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOLIBEAR = "ogn-158-298";
const YASUO = "ogn-076-298";

/** P1's turn. P2 holds bf1 with Volibear (10, Tank, Shield 3) and a 7-Might Predator. Yasuo ready in P1's base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VOLIBEAR, "voli")
    .unit(P2, "bf1", { might: 7, name: "Predator" }, "pred")
    .unit(P1, "base", YASUO, "yasuo");
}

/** Yasuo attacks bf1 and stops at his trigger's target prompt. */
async function yasuoAttacks(): Promise<{ game: Game; prompt: Decision | null }> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
      continue;
    }
    break;
  }
  return { game, prompt: game.decision() };
}

/** Combat damage records dealt to `target` (public damageLog). */
function combatDealt(game: Game, target: string): number {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((s, r) => s + r.amount, 0);
}

describe("Ruling 59be450a316e4083 — Tank is combat-damage only; Yasuo's ability may hit the non-Tank defender", () => {
  test("Yasuo's attack trigger asks P1 for 'an enemy unit here' and offers BOTH Volibear and the Predator (Tank does not restrict ability targets)", async () => {
    const { game, prompt } = await yasuoAttacks();
    expect(game.state("voli").keywords).toContain("Tank");
    expect(prompt).toMatchObject({ kind: "pick", seat: P1 });
    const offered = prompt?.kind === "pick" ? prompt.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toEqual(["pred", "voli"]);
  });

  test("P1 picks the Predator: the trigger resolves for 6 ability damage on the Predator (7 Might, survives with 6 marked) — Volibear soaks nothing", async () => {
    const { game } = await yasuoAttacks();
    await game.p1.pick("pred");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("pred")).toMatchObject({ damage: 6, zone: "battlefield-bf1" });
    expect(game.state("voli").damage).toBe(0);
    expect((game.gameState.damageLog ?? []).filter((r) => r.combat)).toEqual([]); // that was ability damage, not combat damage
  });

  test("the COMBAT damage step is where Tank bites: Yasuo's 6 combat damage must all be assigned to Volibear (13 with Shield) first — the wounded Predator cannot be finished off, survives and is healed; Yasuo dies to 20", async () => {
    const { game } = await yasuoAttacks();
    await game.p1.pick("pred");
    // Pass priority/focus until the assignment prompt (if the engine surfaces one) or combat ends.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || d.kind !== "action" || d.context === "main" || !d.passKey) {
        break;
      }
      await game.acting().pass();
    }
    const d = game.decision();
    if (d?.kind === "distribute" && d.seat === P1) {
      expect(d.total).toBe(6);
      // 1 on the Predator would be lethal (7 Might, 6 marked) — but Tank forbids it while Volibear is not lethal.
      expect((await game.p1.try((p) => p.distribute({ pred: 1, voli: 5 }))).ok).toBe(false);
      expect((await game.p1.try((p) => p.distribute({ pred: 6, voli: 0 }))).ok).toBe(false);
      await game.p1.distribute({ pred: 0, voli: 6 });
    }
    await game.settle();
    expect(combatDealt(game, "voli")).toBe(6);
    expect(combatDealt(game, "pred")).toBe(0);
    expect(combatDealt(game, "yasuo")).toBe(20); // 10 + 3 (Shield while defending) + 7
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.zoneOf("voli")).toBe("battlefield-bf1");
    expect(game.zoneOf("pred")).toBe("battlefield-bf1");
    expect(game.state("pred").damage).toBe(0); // healed by the combat cleanup
    expect(game.state("voli").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: P1 may equally aim the trigger at Volibear himself — 6 ability damage lands on Volibear (no 'must', just 'may')", async () => {
    const { game } = await yasuoAttacks();
    await game.p1.pick("voli");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("voli")).toMatchObject({ damage: 6, zone: "battlefield-bf1" });
    expect(game.state("pred").damage).toBe(0);
  });
});

/**
 * Ruling e601bc6f66f81b4a — Star-Crossed (UNL-128 → unl-128-219) · Spell · Chaos · 3+[chaos] · Reaction
 *     "Return a friendly unit and an enemy unit to their owners' hands."
 *   × Sacrifice (UNL-173 → unl-173-219) · Spell · Order · 1 · Reaction
 *     "As an additional cost to play this, kill a friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Ruined Rex (unl-067-219) 6 Might "[Deathknell] — Deal 4 to an enemy unit." (the Mighty Deathknell unit)
 *
 * Q: Opponent plays Star-Crossed; I respond with Sacrifice, killing my own Deathknell unit (the one Star-Crossed targets).
 *    What is the resolution order?
 * A: Deathknell → Sacrifice → Star-Crossed. The kill is Sacrifice's COST, paid during finalization, so the Deathknell
 *    trigger is created and lands on the chain above Sacrifice. When Star-Crossed finally resolves its enemy target is in
 *    the trash — that part fails, the rest (its friendly unit) still returns to hand.
 * Rules: 356.2/351 step 4 (costs paid at finalization), 808.1.d.2 (Deathknell queued at once), 336–339 (LIFO), 359.3.e.5.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";
const SACRIFICE = "unl-173-219";
const RUINED_REX = "unl-067-219";

/**
 * P2's turn with exactly 3+[chaos]; P2: Ally (2) and Brute (5) at bf1. P1: Ruined Rex (6, Mighty, Deathknell) in base,
 * Sacrifice in hand with exactly [1].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
    .unit(P1, "base", RUINED_REX, "rex")
    .hand(P1, SACRIFICE, "sac")
    .hand(P2, STAR_CROSSED, "star");
}

/** P2 casts Star-Crossed [Ally, Rex]; P2 passes; P1 answers with Sacrifice killing Rex and aims the Deathknell at Brute. */
async function threeDeep(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("star", { targets: ["ally", "rex"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", controller: P2, targets: ["ally", "rex"] })]);
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "sac")).toBe(true);
  await game.p1.cast("sac", { sacrifice: "rex" });
  // The Deathknell's target is chosen as its item is finalized (Brute or Ally offered) — pick Brute.
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["ally", "brute"]);
      await game.p1.pick("brute");
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling e601bc6f66f81b4a — Sacrifice's cost-kill puts the Deathknell ABOVE Sacrifice; order Deathknell → Sacrifice → Star-Crossed", () => {
  test("paying Sacrifice's cost kills Rex during finalization: Rex is already in the trash, [1] is spent, and the chain reads (bottom→top) Star-Crossed, Sacrifice, Rex's Deathknell", async () => {
    const game = await threeDeep();
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["star", "sac", "rex"]);
    expect(game.chain()[2]).toMatchObject({ cardId: "rex", controller: P1, triggered: true });
    expect(game.chain()[1]).toMatchObject({ cardId: "sac", controller: P1, triggered: false });
    // Nothing has resolved yet.
    expect(game.state("brute").damage).toBe(0);
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
  });

  test("resolution is LIFO, one item per double pass: first the Deathknell (Brute takes 4), then Sacrifice (P1 draws 2 and channels 1 rune exhausted), Star-Crossed still waiting", async () => {
    const game = await threeDeep();
    const hand = game.p1.hand().length;
    const runes = game.p1.runes().length;
    const step = async (until: string) => {
      for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === until); i++) {
        const d = game.decision();
        if (d?.kind === "action" && d.context === "chain") {
          await game.seat(d.seat).passPriority();
        } else {
          break;
        }
      }
    };
    await step("rex");
    expect(game.chain().map((c) => c.cardId)).toEqual(["star", "sac"]);
    expect(game.state("brute")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toHaveLength(hand); // Sacrifice not yet
    await step("sac");
    expect(game.chain().map((c) => c.cardId)).toEqual(["star"]);
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 2);
    expect(game.p1.runes()).toHaveLength(runes + 1);
    expect(game.p1.runes({ ready: false }).length).toBeGreaterThanOrEqual(1);
    expect(game.zoneOf("ally")).toBe("battlefield-bf1"); // Star-Crossed not yet
  });

  test("Star-Crossed resolves last: its enemy target (Rex) is in the trash so that half is ignored — Rex stays in the trash, not in P1's hand — while Ally still returns to P2's hand", async () => {
    const game = await threeDeep();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.p2.hand()).toContain("ally");
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.p1.hand()).not.toContain("rex");
    expect(game.state("brute")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});

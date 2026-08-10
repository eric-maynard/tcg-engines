/**
 * Ruling 205ddff2ad6db318 — Elder Dragon (UNL-118 → unl-118-219, 12 + [body]x4, 10 Might)
 *   "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at each
 *    location. Deal 1 to them."
 *   × Ruin Runner (SFD-105 → sfd-105-221, 5 Might) "I can't be chosen by enemy spells and abilities."
 *
 * Q: Can Elder Dragon's play ability pick Ruin Runner?
 * A: No. The ability CHOOSES units, and Ruin Runner can't be chosen by enemy abilities — it is never a legal pick
 *    (other enemy units at the same and other locations still are).
 * Rules: 355 (choosing = targeting), 106 / 355.13 ("up to one … at each location"), Ruin Runner's protection text.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const RUIN_RUNNER = "sfd-105-221";

/**
 * P1's turn, exactly 12 + [body]x4. P2: Ruin Runner and a 2-Might Pawn at P2's bf1, Ruin Runner #2 ALONE at P2's bf2,
 * a 2-Might Grunt in base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { body: 4 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", RUIN_RUNNER, "runner")
    .unit(P2, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .unit(P2, "bf2", RUIN_RUNNER, "runner2")
    .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, ELDER_DRAGON, "dragon");
}

const offered = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

describe("Ruling 205ddff2ad6db318 — Elder Dragon's 'choose up to one enemy unit at each location' cannot choose Ruin Runner", () => {
  test("the play trigger's pick (P1's) offers Pawn and Grunt but neither Ruin Runner — not the one sharing bf1 with Pawn, not the one alone at bf2", async () => {
    const game = await board().build();
    await game.p1.play("dragon");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(offered(d)).toEqual(expect.arrayContaining(["pawn", "grunt"]));
    expect(offered(d)).not.toContain("runner");
    expect(offered(d)).not.toContain("runner2");
    expect(offered(d)).not.toContain("dragon");
  });

  test("resolving with every legal pick taken: Pawn and Grunt take 1 and die (any amount is lethal); both Ruin Runners are never chosen at any step and end undamaged on the board", async () => {
    const game = await board().build();
    await game.p1.play("dragon");
    for (let i = 0; i < 8; i++) {
      await game.settle();
      const d = game.decision();
      if (d?.kind !== "pick" || d.seat !== P1) {
        break;
      }
      const keys = offered(d);
      expect(keys).not.toContain("runner");
      expect(keys).not.toContain("runner2");
      const hit = ["pawn", "grunt"].filter((k) => keys.includes(k));
      if (hit.length > 0) {
        await game.p1.pick(...hit.slice(0, Math.max(1, Math.min(hit.length, d.max))));
      } else {
        await game.p1.decline();
      }
    }
    await game.settle();
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("battlefield-bf1");
    expect(game.zoneOf("runner2")).toBe("battlefield-bf2");
    expect(game.state("runner").damage).toBe(0);
    expect(game.state("runner2").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

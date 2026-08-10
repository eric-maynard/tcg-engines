/**
 * Ruling e68e30c05821d936 — Ahri, Inquisitive (OGN-119 → ogn-119-298) · [3]+[mind] · 3 Might
 *     "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might]."
 *   × Ruin Runner (SFD-105 → sfd-105-221) · 5 Might · "I can't be chosen by enemy spells and abilities."
 *
 * Q: Does Ahri give -2 to Ruin Runner when attacking or defending?
 * A: No, in neither case. Ahri's trigger targets (chooses) the unit; Ruin Runner can't be chosen by enemy abilities, so
 *    it is never a legal target and is unaffected.
 * Rules: 355.5 / 402.2 (a triggered ability's chosen object is a target), 757 ("can't be chosen"), 402.4 (no legal
 *        target ⇒ the trigger is removed).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const AHRI = "ogn-119-298";
const RUIN_RUNNER = "sfd-105-221";

describe("Ruling e68e30c05821d936 — Ahri, Inquisitive cannot give Ruin Runner -2, attacking or defending", () => {
  test("ATTACKING into a battlefield held by Ruin Runner alone: Ahri's trigger finds no legal enemy unit — no target prompt, nothing on the chain, Ruin Runner stays 5", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", RUIN_RUNNER, "runner")
      .unit(P1, "base", AHRI, "ahri")
      .build();
    expect(game.state("runner").keywords).toContain("Untargetable");
    await game.p1.move("ahri", "bf1");
    expect(game.state("ahri").combatRole).toBe("attacker");
    expect(game.decision()?.kind).not.toBe("pick"); // never asked to choose Ruin Runner
    expect(game.chain().filter((c) => c.cardId === "ahri")).toEqual([]); // 402.4: no legal target ⇒ no item
    expect(game.state("runner").might).toBe(5);
    expect(game.state("runner").mightModifier).toBe(0);
    // The combat then plays out at full Might: 3 into 5 — Ahri dies, Ruin Runner holds.
    await game.settle();
    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("ATTACKING where Ruin Runner stands beside an ordinary Guard: only the Guard is offered/affected (auto-bound as the sole legal target) — Ruin Runner keeps 5", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", RUIN_RUNNER, "runner")
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .unit(P1, "base", AHRI, "ahri")
      .build();
    await game.p1.move("ahri", "bf1");
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["guard"]);
      await game.p1.pick("guard");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, targets: ["guard"], triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("guard").might).toBe(2);
    expect(game.state("runner").might).toBe(5);
  });

  test("DEFENDING against an attacking Ruin Runner: again no legal target — no prompt, no chain item, Ruin Runner attacks at 5", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", AHRI, "ahri")
      .unit(P2, "base", RUIN_RUNNER, "runner")
      .build();
    await game.p2.move("runner", "bf1");
    expect(game.state("ahri").combatRole).toBe("defender");
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.chain().filter((c) => c.cardId === "ahri")).toEqual([]);
    expect(game.state("runner").might).toBe(5);
    const r = await game.p1.try((p) => p.pick("runner"));
    expect(r.ok).toBe(false);
    await game.settle();
    expect(game.zoneOf("ahri")).toBe("trash"); // 5 into 3
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});

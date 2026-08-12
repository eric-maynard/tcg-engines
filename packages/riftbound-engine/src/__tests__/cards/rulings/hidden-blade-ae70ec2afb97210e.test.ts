/**
 * Ruling ae70ec2afb97210e — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] Action [2][order]
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *   × Volibear, Furious (OGN-041 → ogn-041-298) · 9 Might · "[Deflect 2] When I attack, deal 5 damage split
 *     among any number of enemy units here."
 *
 * Q: Volibear attacks and puts his "deal 5" trigger on the chain; Hidden Blade removes him in response.
 *    Does the trigger still resolve?
 * A: No damage happens. The ability says "here", so with Volibear gone from the battlefield the chosen
 *    recipients are no longer legal for it and the instruction does nothing. (An ability that names a
 *    battlefield or another unit without referring to "here" would still resolve in full.)
 * Rules: 359.3.e.5 / 355.15 (bound targets are re-checked at resolution; illegal ones are dropped, never
 *        re-aimed), 359.3.f.2 (a missing referent makes the instruction do nothing), 809.1.c.1 ([Deflect]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const VOLIBEAR_FURIOUS = "ogn-041-298";

/** P1's turn: Volibear walks into bf1, held by P2 with two 6-Might Grunts and a facedown Hidden Blade.
 *  P2 keeps 2 rainbow power for Volibear's [Deflect 2]. */
function board() {
  return scenario()
    .resources(P2, { power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Grunt A" }, "a")
    .unit(P2, "bf1", { might: 6, name: "Grunt B" }, "b")
    .unit(P1, "base", VOLIBEAR_FURIOUS, "voli")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade");
}

/** Volibear attacks and splits his 5 among both Grunts; P2 then flips Hidden Blade onto `victim`. */
async function attackThenBlade(victim: string): Promise<Game> {
  const game = await board().build();
  await game.p1.move("voli", "bf1");
  await game.p1.pick("a", "b"); // the split recipients, chosen at finalization
  await game.p1.passPriority();
  await game.p2.reveal("blade");
  await game.p2.pick(victim);
  return game;
}

describe("Ruling ae70ec2afb97210e — removing Volibear leaves his 'deal 5 … here' trigger with nothing to hit", () => {
  test("setup: attacking queues the trigger, whose recipients are chosen at finalization (P1's split-target pick)", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, targeting: "split-targets", timing: "FIN" });
    await game.p1.pick("a", "b");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "voli", controller: P1, targets: ["a", "b"], triggered: true }),
    ]);
    expect(game.state("a").damage).toBe(0); // amounts are decided only at resolution
  });

  test("setup: flipping Hidden Blade at Volibear costs P2 the [Deflect 2] surcharge (2 power of any domain)", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    await game.p1.pick("a", "b");
    await game.p1.passPriority();
    await game.p2.reveal("blade");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect((d as { options: { key: string; deflect?: number }[] }).options.find((o) => o.key === "voli")?.deflect).toBe(2);
    await game.p2.pick("voli");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["voli", "blade"]);
  });

  test("ruling: Hidden Blade resolves first and kills Volibear (his controller draws 2)", async () => {
    const game = await attackThenBlade("voli");
    const handBefore = game.p1.hand().length;
    await game.settle();
    expect(game.zoneOf("voli")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore + 2);
  });

  test("ruling: the 'deal 5 … here' trigger then resolves and deals NOTHING — both Grunts are untouched", async () => {
    const game = await attackThenBlade("voli");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("a").damage).toBe(0);
    expect(game.state("b").damage).toBe(0);
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if the Blade kills a GRUNT instead, Volibear is still 'here' and the surviving Grunt takes the whole 5", async () => {
    const game = await attackThenBlade("a");
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().pass(); // resolve the chain but stop short of the Combat Damage Step
    }
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("voli")).toBe("battlefield-bf1");
    expect(game.state("b").damage).toBe(5); // the dead recipient is dropped, not re-aimed; the rest lands on B
  });
});

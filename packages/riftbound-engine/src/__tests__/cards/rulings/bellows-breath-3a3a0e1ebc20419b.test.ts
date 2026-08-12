/**
 * Ruling 3a3a0e1ebc20419b — Bellows Breath (SFD-080 → sfd-080-221) · Spell · Mind · [1][mind] · [Action]
 *   "[Repeat] [1][mind] — Deal 1 to up to three units at the same location."
 *   × Vi, Hotheaded (UNL-030 → unl-030-219) · Unit · 3 Might · "[Deflect]" (opponents pay [rainbow] to choose her).
 *
 * Q: If I [Repeat] Bellows Breath onto an opponent's unit that has [Deflect], what do I pay in total?
 * A: Base [1][mind] + Repeat [1][mind] + one [Deflect] surcharge PER time the unit is chosen. Choosing the
 *    same Deflect unit in both executions = 2 surcharges: 2 Energy + 2 [mind] + 2 [rainbow].
 *    Deflect is a MANDATORY additional cost — if you cannot pay it for an instance you cannot pick that unit there.
 * Rules: 809.1.c ([Deflect] surcharge per choice), 356.2.a.2 / 735.1.d (mandatory additional cost, paid on the chain),
 *        746.2.a ([Repeat] = a separate set of choices).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const VI_HOTHEADED = "unl-030-219"; // [Deflect] 3-Might unit

/** P1's turn. P2 holds bf1 with Deflect-Vi and a plain Bravo. P1: Bellows Breath and the stated pool. */
function board(pool: { energy: number; mind: number; rainbow?: number }) {
  return scenario()
    .resources(P1, { energy: pool.energy, power: { mind: pool.mind, rainbow: pool.rainbow ?? 0 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VI_HOTHEADED, "vi")
    .unit(P2, "bf1", { might: 3, name: "Bravo" }, "b")
    .hand(P1, BELLOWS_BREATH, "bb");
}

describe("Ruling 3a3a0e1ebc20419b — [Deflect] is charged once per choice, so a Repeated Bellows Breath on it costs it twice", () => {
  test("one instance on the [Deflect] unit costs base [1][mind] + one [rainbow] surcharge", async () => {
    const game = await board({ energy: 1, mind: 1, rainbow: 1 }).build();
    expect(game.state("vi").keywords).toContain("Deflect");
    await game.p1.cast("bb", { targets: ["vi"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, rainbow: 0 } });
    await game.settle();
    expect(game.state("vi").damage).toBe(1);
  });

  test("ruling: choosing the same [Deflect] unit in BOTH executions costs [1][mind] + [1][mind] + [rainbow] + [rainbow]", async () => {
    const game = await board({ energy: 2, mind: 2, rainbow: 2 }).build();
    await game.p1.cast("bb", { repeat: 1, targets: ["vi", "vi"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, rainbow: 0 } }); // 2 energy + 2 [mind] + 2 [rainbow]
    await game.settle();
    expect(game.state("vi").damage).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: with only ONE [rainbow] the double-choice is unaffordable — Deflect is mandatory, so that pick is illegal", async () => {
    const game = await board({ energy: 2, mind: 2, rainbow: 1 }).build();
    expect((await game.p1.try((p) => p.cast("bb", { repeat: 1, targets: ["vi", "vi"] }))).ok).toBe(false);
    expect(game.zoneOf("bb")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 2, rainbow: 1 } }); // nothing paid
  });

  // [rainbow] is "any one power", so the surcharge may be paid with a spare [mind]: with exactly one power in
  // the pool the base [mind] pip consumes it and the Deflect unit becomes unpickable, while a plain unit stays legal.
  test("ruling: when the surcharge cannot be paid the [Deflect] unit simply cannot be chosen — a plain unit still can", async () => {
    const game = await board({ energy: 1, mind: 1, rainbow: 0 }).build();
    expect((await game.p1.try((p) => p.cast("bb", { targets: ["vi"] }))).ok).toBe(false);
    await game.p1.cast("bb", { targets: ["b"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, rainbow: 0 } }); // only the printed cost
    await game.settle();
    expect(game.state("b").damage).toBe(1);
    expect(game.state("vi").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

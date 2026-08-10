/**
 * Ruling e080c4019f211783 — Whirlwind (OGN-187 → ogn-187-298) · [3]+[chaos]
 *     "Starting with the next player, each player may return a unit to its owner's hand."
 *   × Ruin Runner (SFD-105 → sfd-105-221) · 5 Might · "I can't be chosen by enemy spells and abilities."
 *   (+ Pouty Poro ogn-013-298 [Deflect] as the "does not trigger Deflect" probe.)
 *
 * Q: How does Whirlwind work in 1v1 and 2v2?
 * A: Identically: it does not target. On resolution, starting with the NEXT player in turn order, each player may choose
 *    any unit on the board to return to its owner's hand (or decline). Because players choose during resolution, it is not
 *    "choosing/targeting" by the spell — Deflect is not owed and Ruin Runner can be picked. 1v1: opponent then caster;
 *    2v2: Team A P1 → Team B P1 → Team A P2 → Team B P2 order, i.e. seats after the caster in turn order, caster last.
 * Rules: 355.10.e (player choices at resolution ≠ targeting), 757 (can't be chosen), 809 (Deflect), 103.2 (turn order).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, P3, P4, scenario } from "../../../harness";

const WHIRLWIND = "ogn-187-298";
const RUIN_RUNNER = "sfd-105-221";
const POUTY_PORO = "ogn-013-298"; // [Deflect]

type PickD = Extract<Decision, { kind: "pick" }>;
const offered = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Cast Whirlwind with P1 and pass priority around until its first resolution prompt appears. */
async function castAndResolve(game: Game): Promise<void> {
  expect(game.p1.option("cast", "ww")?.fields.map((f) => f.arg) ?? []).not.toContain("targets"); // 1. no targeting at all
  await game.p1.cast("ww");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", controller: P1 })]);
  expect(game.chain()[0]?.targets ?? []).toEqual([]);
  for (let i = 0; i < 6 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling e080c4019f211783 — Whirlwind: untargeted, each player chooses in turn order starting with the next player", () => {
  test("1v1: on resolution P2 (the next player) is asked first and MAY decline; then P1 chooses — Ruin Runner ('can't be chosen by enemy spells') is a legal choice and goes back to P2's hand", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", RUIN_RUNNER, "runner")
      .unit(P2, "base", POUTY_PORO, "poro")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, WHIRLWIND, "ww")
      .build();
    expect(game.state("runner").keywords).toContain("Untargetable");
    await castAndResolve(game);
    // 2./3. Resolution: the next player (P2) chooses first, and it is a "may".
    const d2 = game.decision();
    expect(d2).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "ww" } });
    expect((d2 as PickD).allowDecline).toBe(true);
    expect(offered(d2).sort()).toEqual(["ally", "poro", "runner"]); // "a unit" — any unit, own or enemy
    await game.p2.decline();
    // Then the caster. 4. Player choice ≠ spell choice: Ruin Runner is offered, and the Deflect Poro carries no surcharge.
    const d1 = game.decision();
    expect(d1).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "ww" } });
    expect((d1 as PickD).allowDecline).toBe(true);
    expect(offered(d1).sort()).toEqual(["ally", "poro", "runner"]);
    const poroOpt = (d1 as PickD).options.find((o) => (o.card ?? o.key) === "poro");
    expect(poroOpt?.deflect ?? 0).toBe(0); // Deflect not owed — nothing is being "chosen by a spell"
    await game.p1.pick("runner");
    await game.settle();
    expect(game.zoneOf("runner")).toBe("hand");
    expect(game.p2.hand()).toContain("runner");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // no Deflect/extra payment happened
    expect(game.violations()).toEqual([]);
  });

  test("1v1: the caster may pick the Deflect unit without paying anything, and both players may return units in the same resolution", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .unit(P2, "base", POUTY_PORO, "poro")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, WHIRLWIND, "ww")
      .build();
    await castAndResolve(game);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("ally"); // P2 bounces P1's Ally
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("poro"); // P1 bounces the Deflect Poro for free
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.p1.hand()).toContain("ally");
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p2.hand()).toContain("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("2v2 (seats P1,P2,P3,P4 = Team A P1, Team B P1, Team A P2, Team B P2): cast by P1, the choices are asked of P2 → P3 → P4 → P1, each a declinable 'may'", async () => {
    const game = await scenario({ players: 4 })
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .unit(P1, "base", { might: 1, name: "U1" }, "u1")
      .unit(P2, "base", { might: 1, name: "U2" }, "u2")
      .unit(P3, "base", { might: 1, name: "U3" }, "u3")
      .unit(P4, "base", { might: 1, name: "U4" }, "u4")
      .hand(P1, WHIRLWIND, "ww")
      .build();
    await castAndResolve(game);
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      expect(d).toMatchObject({ kind: "pick", source: { cardId: "ww" } });
      expect((d as PickD).allowDecline).toBe(true);
      if (d!.seat === P1) {
        expect(offered(d).sort()).toEqual(["u2", "u3", "u4"]); // u1 was already returned by P4's earlier choice
      } else {
        expect(offered(d).sort()).toEqual(["u1", "u2", "u3", "u4"]); // any unit, any controller
      }
      order.push(d!.seat);
      if (d!.seat === P4) {
        await game.seat(P4).pick("u1"); // Team B's second player bounces the caster's unit
      } else {
        await game.seat(d!.seat).decline();
      }
    }
    expect(order).toEqual([P2, P3, P4, P1]);
    await game.settle();
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.zoneOf("u1")).toBe("hand");
    expect(game.zoneOf("u2")).toBe("base");
    expect(game.zoneOf("u3")).toBe("base");
    expect(game.zoneOf("u4")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});

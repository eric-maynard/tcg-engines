/**
 * Ruling fb86c06fe47e4f35 — Whirlwind (OGN-187 → ogn-187-298) · [3][chaos] · [Action]
 *     "Starting with the next player, each player may return a unit to its owner's hand."
 *   × Ruin Runner (SFD-105 → sfd-105-221) · 5 Might · "I can't be chosen by enemy spells and abilities."
 *   (+ Pouty Poro ogn-013-298 [Deflect] for the nuance.)
 *
 * Q: Does Whirlwind count as targeting for Ruin Runner's protection?
 * A: No. Whirlwind does not target — the players choose during its resolution — so it can return Ruin Runner even though
 *    Ruin Runner can't be chosen by enemy spells. Likewise no Deflect is owed for a unit picked this way.
 * Rules: 355.10.e (choices a player makes at resolution are not targets), 757 ("can't be chosen"), 809 (Deflect).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WHIRLWIND = "ogn-187-298";
const RUIN_RUNNER = "sfd-105-221";
const POUTY_PORO = "ogn-013-298";

type PickD = Extract<Decision, { kind: "pick" }>;
const offered = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** P1's turn. P2: Ruin Runner at bf1, Pouty Poro in base. P1: an Ally in base, Whirlwind in hand with exactly [3][chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", RUIN_RUNNER, "runner")
    .unit(P2, "base", POUTY_PORO, "poro")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .hand(P1, WHIRLWIND, "ww");
}

/** Cast Whirlwind and pass priority until its first resolution prompt. */
async function castAndResolve(game: Game): Promise<void> {
  await game.p1.cast("ww");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", controller: P1 })]);
  expect(game.chain()[0]?.targets ?? []).toEqual([]); // nothing was targeted at play time
  for (let i = 0; i < 6 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling fb86c06fe47e4f35 — Whirlwind doesn't target: Ruin Runner can be returned, no Deflect owed", () => {
  test("Whirlwind is cast with NO targets field at all (Ruin Runner's 'can't be chosen' never comes up at play time)", async () => {
    const game = await board().build();
    expect(game.state("runner").keywords).toContain("Untargetable");
    expect(game.p1.can("cast", "ww")).toBe(true);
    expect(game.p1.option("cast", "ww")?.fields.map((f) => f.arg) ?? []).not.toContain("targets");
  });

  test("on resolution the next player (P2) chooses first and may decline; then P1 chooses — Ruin Runner IS a legal choice for the enemy caster and goes back to P2's hand", async () => {
    const game = await board().build();
    await castAndResolve(game);
    const d2 = game.decision();
    expect(d2).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "ww" } });
    expect((d2 as PickD).allowDecline).toBe(true);
    await game.p2.decline();
    const d1 = game.decision();
    expect(d1).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "ww" } });
    expect((d1 as PickD).allowDecline).toBe(true);
    expect(offered(d1).toSorted()).toEqual(["ally", "poro", "runner"]);
    await game.p1.pick("runner");
    await game.settle();
    expect(game.zoneOf("runner")).toBe("hand");
    expect(game.p2.hand()).toContain("runner");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: the Deflect Poro carries no surcharge in that choice and can be returned by P1 with an empty pool", async () => {
    const game = await board().build();
    await castAndResolve(game);
    await game.p2.decline();
    const d1 = game.decision() as PickD;
    const poroOpt = d1.options.find((o) => (o.card ?? o.key) === "poro");
    expect(poroOpt).toBeDefined();
    expect(poroOpt?.deflect ?? 0).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // nothing to pay a Deflect with
    await game.p1.pick("poro");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.p2.hand()).toContain("poro");
    expect(game.violations()).toEqual([]);
  });
});

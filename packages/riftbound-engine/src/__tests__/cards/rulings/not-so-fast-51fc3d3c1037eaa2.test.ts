/**
 * Ruling 51fc3d3c1037eaa2 — Not So Fast (SFD-045 → sfd-045-221) · Reaction · [2][calm]
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Heedless Resurrection (UNL-142 → unl-142-219) · Reaction · [2][chaos] · "As an additional cost to play this, kill a
 *     friendly unit. Play a unit from your trash that costs no more Energy and no more Power than the killed unit, ignoring its cost."
 *   (+ Defy ogn-045-298 as a contrast counter that does NOT care what the spell chooses.)
 *
 * Q: Can Not So Fast counter an opponent's Heedless Resurrection?
 * A: No. NSF needs an ENEMY spell that chooses one of YOUR units/gear; Heedless Resurrection only involves its caster's own
 *    units (the killed unit and the unit in their trash) — enemy units to you. And your own Heedless Resurrection is not an
 *    enemy spell, so your own NSF cannot counter it either.
 * Rules: 355 (what a spell "chooses"), NSF's two conditions (enemy + chooses friendly), 425 (counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const HEEDLESS_RESURRECTION = "unl-142-219";
const DEFY = "ogn-045-298";
const SKULKER = "ogn-175-298"; // [3] vanilla 3-Might — the unit waiting in the trash

const nsfTargets = (game: Game, seat: "p1" | "p2") =>
  (game[seat].option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();

/**
 * P2's turn. P2: Fodder (a [3] 3-Might unit) in base, a Skulker in the trash, Heedless Resurrection with exactly [2][chaos].
 * P1: a unit of its own in base (so "friendly unit" exists), NSF + Defy in hand with [3] + calm×2 (enough for either).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .resources(P1, { energy: 3, power: { calm: 2 } })
    .unit(P2, "base", { energyCost: 3, might: 3, name: "Fodder" }, "fodder")
    .trash(P2, SKULKER, "corpse")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P2, HEEDLESS_RESURRECTION, "hr")
    .hand(P1, NOT_SO_FAST, "nsf")
    .hand(P1, DEFY, "defy");
}

/** P2 casts Heedless Resurrection killing Fodder; P2 passes so P1 holds priority with it on the chain. */
async function resurrectionPendingP1(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("hr", { sacrifice: "fodder" });
  expect(game.zoneOf("fodder")).toBe("trash"); // the additional cost — P2's own unit
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hr", controller: P2 })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 51fc3d3c1037eaa2 — Not So Fast cannot counter Heedless Resurrection", () => {
  test("the opponent's Heedless Resurrection chooses none of MY units or gear: NSF has no legal object (not castable), even though a plain counter like Defy could hit it", async () => {
    const game = await resurrectionPendingP1();
    expect(nsfTargets(game, "p1")).toEqual([]);
    expect(game.p1.can("cast", "nsf")).toBe(false);
    const r = await game.p1.try((p) => p.cast("nsf", { targets: "hr" }));
    expect(r.ok).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 2 } }); // nothing spent on the refused cast
    expect(game.p1.can("cast", "defy")).toBe(true); // contrast: it is a spell on the chain, just not one NSF may choose
    expect(game.zoneOf("bystander")).toBe("base"); // my unit was never involved
  });

  test("un-countered, it resolves for P2: the Skulker comes back from P2's trash onto the board", async () => {
    const game = await resurrectionPendingP1();
    await game.p1.passPriority();
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        expect(d.options.map((o) => o.card ?? o.key)).toContain("corpse");
        await game.p2.pick("corpse");
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("corpse")).toBe("base");
    expect(game.state("corpse").controller).toBe(P2);
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("your OWN Heedless Resurrection is not an enemy spell: with it on the chain, your own NSF still has nothing to choose", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1, chaos: 1 } })
      .unit(P1, "base", { energyCost: 3, might: 3, name: "Fodder" }, "fodder")
      .trash(P1, SKULKER, "corpse")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .hand(P1, HEEDLESS_RESURRECTION, "hr")
      .hand(P1, NOT_SO_FAST, "nsf")
      .build();
    await game.p1.cast("hr", { sacrifice: "fodder" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hr", controller: P1 })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, chaos: 0 } }); // exactly NSF's [2][calm] left
    expect(nsfTargets(game, "p1")).toEqual([]);
    expect(game.p1.can("cast", "nsf")).toBe(false);
  });
});

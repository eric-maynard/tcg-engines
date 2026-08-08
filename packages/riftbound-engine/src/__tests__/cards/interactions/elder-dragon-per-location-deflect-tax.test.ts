/**
 * Interaction: Elder Dragon (unl-118-219) "choose up to one enemy unit at each location"
 * × [Deflect].
 *
 * Rules: 809.1.c / 809.1.c.1 — a player choosing an opponent's [Deflect] card with a spell OR an
 * ABILITY owes an additional cost of [Deflect value] Power of any Domain, incurred when the target
 * is CHOSEN; 356.2.a.2 — that surcharge is mandatory, so a candidate whose surcharge the chooser
 * cannot pay is not a legal choice and is never offered.
 *
 * The per-location prompt is built from `candidates` (not `target`), so it bypasses the generic
 * Deflect gating in chain/resolve.ts — the tax has to be applied by the handler itself.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DRAGON = "unl-118-219"; // 12 + [body]×4: when you play me, choose up to one enemy unit at each location. Deal 1 to them.
const PORO = "ogn-013-298"; // Pouty Poro — printed [Deflect] 1

function board(spare: number) {
  return scenario()
    .resources(P1, { energy: 12, power: { body: 4, order: spare } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", PORO, "poro")
    .unit(P2, "bf2", { might: 2, name: "Plain" }, "plain")
    .hand(P1, DRAGON, "dragon");
}

describe("Elder Dragon per-location prompt × [Deflect] — 809.1.c.1", () => {
  test("picking the [Deflect] unit from the per-location prompt costs 1 extra Power", async () => {
    const game = await board(2).build();
    expect(game.state("poro").keywords).toContain("Deflect");
    await game.p1.play("dragon", { to: "base" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("poro");
    await game.settle();
    expect(game.p1.power("order")).toBe(1); // 2 spare − 1 Deflect
    expect(game.violations()).toEqual([]);
  });

  test("with no Power left the Deflect unit is not offered at all; the untaxed one still is", async () => {
    const game = await board(0).build();
    await game.p1.play("dragon", { to: "base" });
    await game.settle();
    // The prompt cannot offer the Poro (its mandatory surcharge is unpayable), so the untaxed
    // unit at the other battlefield is the only thing that can be chosen — and it dies.
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.zoneOf("plain")).toBe("trash");
    expect(game.p1.power("order")).toBe(0);
  });
});

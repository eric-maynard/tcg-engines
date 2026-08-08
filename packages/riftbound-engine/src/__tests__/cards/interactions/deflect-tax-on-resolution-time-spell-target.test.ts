/**
 * Interaction: [Deflect] × a SPELL whose target is chosen at RESOLUTION.
 *
 *   Vi, Hotheaded (unl-030-219) — printed [Deflect] 1.
 *   Stupefy (ogn-095-298) — [Reaction] · 1 · "Give a unit -1 [Might] this turn … Draw 1."
 *
 * Rules:
 *   809.1.c / 809.1.c.1 — an opponent choosing a [Deflect] card with a spell OR an ability pays
 *     [Deflect value] more Power of any Domain, incurred when the target is CHOSEN.
 *   356.2.a.2 — that surcharge is a mandatory additional cost.
 *
 * A spell that reaches the chain with its target already declared pays at play time. A spell that
 * reaches the chain WITHOUT one picks at resolution — through the same `choose-target` prompt an
 * ability uses — and owes the surcharge there, not for free.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VI = "unl-030-219"; // printed [Deflect] 1
const STUPEFY = "ogn-095-298"; // Reaction · 1 · Give a unit -1 Might this turn. Draw 1.

async function board(spare: number): Promise<Game> {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { mind: spare } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VI, "vi")
    .unit(P1, "bf1", { might: 5, name: "Plain" }, "plain")
    .hand(P2, STUPEFY, "stupefy")
    .build();
}

describe("Deflect surcharge on a spell target chosen at resolution — 809.1.c.1", () => {
  test("choosing Vi from the resolution prompt costs the caster 1 extra Power", async () => {
    const game = await board(2);
    expect(game.state("vi").keywords).toContain("Deflect");
    await game.p2.do("playSpell", { cardId: "stupefy" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("vi");
    await game.settle();
    expect(game.state("vi").might).toBe(2);
    expect(game.p2.power("mind")).toBe(1); // 2 spare − 1 Deflect
    expect(game.violations()).toEqual([]);
  });

  test("choosing the plain unit from the same prompt costs nothing extra", async () => {
    const game = await board(2);
    await game.p2.do("playSpell", { cardId: "stupefy" });
    await game.settle();
    await game.p2.pick("plain");
    await game.settle();
    expect(game.state("plain").might).toBe(4);
    expect(game.p2.power("mind")).toBe(2);
  });

  test("with no spare Power the Deflect unit is not a legal choice, so the plain unit is bound alone", async () => {
    const game = await board(0);
    await game.p2.do("playSpell", { cardId: "stupefy" });
    await game.settle();
    expect(game.state("vi").might).toBe(3); // untaxable, never chosen
    expect(game.state("plain").might).toBe(4);
    expect(game.p2.power("mind")).toBe(0);
  });
});

/**
 * Ruling 7eaa9ec454f86a11 — Baron Nashor (UNL-147 → unl-147-219) · 10+[chaos]×3 · 12 Might "… I can't be chosen by enemy spells and
 *     abilities. Other friendly units have +2 [Might]."
 *   × Cull the Weak (OGN-209 → ogn-209-298) · 2+[order] "Each player kills one of their units."
 *
 * Q: Can Baron Nashor be killed by Cull the Weak?
 * A: Yes. Cull the Weak does not target/choose any unit; each player kills one of THEIR OWN units as it resolves. Since the enemy
 *    spell never chooses Baron, "can't be chosen by enemy spells and abilities" doesn't help him.
 * Rules: 355 (targeting = choices made on play), 359 (per-player instruction on resolution), Baron's untargetability text.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BARON_NASHOR = "unl-147-219";
const CULL_THE_WEAK = "ogn-209-298";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P2 holds bf1 with Baron Nashor as P2's ONLY unit. P1: a Pawn (1) in base, Cull in hand + 2+[order] (+ Ray + 1+[fury] for the premise). */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", BARON_NASHOR, "baron")
    .unit(P1, "base", { might: 1, name: "Pawn" }, "pawn")
    .hand(P1, CULL_THE_WEAK, "cull")
    .hand(P1, HEXTECH_RAY, "ray");
}

describe("Ruling 7eaa9ec454f86a11 — Cull the Weak kills Baron Nashor (it never chooses him)", () => {
  test("premise: Baron really can't be CHOSEN by an enemy spell — Hextech Ray (which targets 'a unit at a battlefield') is not offered Baron and is uncastable here", async () => {
    const game = await board().build();
    expect(game.state("baron").keywords).toContain("Untargetable");
    const field = game.p1.option("cast", "ray")?.fields.find((f) => f.name === "targets");
    const flat = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(flat).not.toContain("baron");
    expect(game.p1.can("cast", "ray")).toBe(false); // no legal target at all
  });

  test("Cull the Weak names nothing of P2's on play (its play-time menu never lists Baron) and goes on the chain", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "cull")?.fields.find((f) => f.name === "targets");
    const flat = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(flat).not.toContain("baron"); // P1 only ever names its OWN unit, if any
    await game.p1.cast("cull", { targets: [] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
  });

  test("on resolution each player kills one of their own: P2's only unit is Baron, so Baron dies (P2's own forced 'choice', not an enemy choosing him); P1's Pawn dies too", async () => {
    const game = await board().build();
    await game.p1.cast("cull", { targets: [] });
    for (let i = 0; i < 6; i++) {
      const stop = await game.settle();
      const d = game.decision();
      if (stop.reason !== "unanswered" || d?.kind !== "pick") {
        break;
      }
      // Whoever is asked picks among THEIR OWN units only.
      const offered = d.options.map((o) => o.card ?? o.key);
      if (d.seat === P2) {
        expect(offered).toEqual(["baron"]);
      } else {
        expect(offered).toEqual(["pawn"]);
      }
      await game.seat(d.seat).pick(offered[0] as string);
    }
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.zoneOf("baron")).toBe("trash");
    expect(game.p2.trash()).toContain("baron");
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

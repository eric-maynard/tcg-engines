/**
 * Ruling 0328d5177ffd6d19 — Cull the Weak (OGN-209 → ogn-209-298, Action, 2 + [order])
 *   "Each player kills one of their units."
 *   × a [Deflect] unit (Pouty Poro ogn-013-298: "[Deflect] (Opponents must pay [rainbow] to choose me with a
 *     spell or ability.)")
 *
 * Q: Does casting Cull the Weak trigger Deflect (i.e. owe the [rainbow] surcharge)?
 * A: No. Deflect only taxes spells/abilities that CHOOSE (target) the Deflect permanent. Cull the Weak does not
 *    target — each player picks their own unit as it resolves — so no Deflect cost is ever owed.
 * Rules: 809.1.c/809.1.d (Deflect = additional cost on targeting), 355.10.e ("each player kills one of their
 *        units" does not target; chosen on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const POUTY_PORO = "ogn-013-298"; // 2 Might, [Deflect]

/**
 * P1's turn. P1: one vanilla Pawn (1) in base, Cull in hand, EXACTLY 2 energy + 1 order (Cull's own cost) — no
 * spare power that could pay a Deflect pip. P2: Pouty Poro (Deflect) in base (+ optionally a second unit).
 */
function board(opts: { p2Second?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .unit(P1, "base", { might: 1, name: "Pawn" }, "pawn")
    .unit(P2, "base", POUTY_PORO, "poro")
    .hand(P1, CULL_THE_WEAK, "cull");
  return opts.p2Second ? s.unit(P2, "base", { might: 4, name: "Brute" }, "brute") : s;
}

/** Drain to open main phase, recording every non-priority prompt and answering P2's kill choice with `p2Pick`. */
async function resolveCull(game: Game, p2Pick?: string): Promise<Decision[]> {
  const prompts: Decision[] = [];
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
      continue;
    }
    prompts.push(d);
    if (d.kind === "pick" && d.seat === P2 && p2Pick !== undefined) {
      await game.p2.pick(p2Pick);
    } else if (d.kind === "pick" && d.options.length === 1 && d.min === 1) {
      await game.seat(d.seat).pick(d.options[0]?.key as string);
    } else {
      break;
    }
  }
  return prompts;
}

describe("Ruling 0328d5177ffd6d19 — Cull the Weak does not target, so Deflect never applies", () => {
  test("premise: the Poro has Deflect and P1 has ZERO spare power after Cull's own [order] — yet Cull is castable and its play-time menu never lists the enemy Poro (it is not targeted)", async () => {
    const game = await board().build();
    expect(game.state("poro").keywords).toContain("Deflect");
    expect(game.p1.can("cast", "cull")).toBe(true);
    const offered = (game.p1.option("cast", "cull")?.fields.find((f) => f.arg === "targets")?.options ?? []) as unknown[];
    const flat = [...new Set(offered.flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(flat).not.toContain("poro"); // P1 only ever names its OWN unit
    await game.p1.cast("cull"); // rule 355.10.e — no play-time target; the caster picks pawn on resolution
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // exactly the printed cost, no [rainbow]
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
  });

  test("resolution: each player kills one of their units — P1's Pawn and P2's Deflect Poro both die; no Deflect payment was ever asked of P1 (809.1.c, 355.10.e)", async () => {
    const game = await board().build();
    await game.p1.cast("cull"); // rule 355.10.e — no play-time target; the caster picks pawn on resolution
    const prompts = await resolveCull(game);
    // No cost / yes-no prompt to P1 for Deflect at any point.
    expect(prompts.some((p) => p.seat === P1 && (p.kind === "yes-no" || p.kind === "integer"))).toBe(false);
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("with two P2 units the choice of which to kill is P2's own decision on resolution; P2 picking its Deflect Poro costs nobody anything", async () => {
    const game = await board({ p2Second: true }).build();
    await game.p1.cast("cull"); // rule 355.10.e — no play-time target; the caster picks pawn on resolution
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    const prompts = await resolveCull(game, "poro");
    const p2Pick = prompts.find((p) => p.seat === P2 && p.kind === "pick");
    expect(p2Pick).toBeDefined();
    expect(p2Pick?.kind === "pick" ? p2Pick.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["brute", "poro"]);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("base");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });
});

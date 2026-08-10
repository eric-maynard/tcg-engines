/**
 * Ruling 2c2f2793eda6e7bb — Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · 2 + [order]
 *   "Each player kills one of their units."
 *   × Ruin Runner (SFD-105 → sfd-105-221) · Unit · 5 Might · "I can't be chosen by enemy spells and abilities."
 *   (The scrape also lists Cull sfd-134-221 — a name collision; irrelevant here.)
 *
 * Q: Can I Cull the Weak my opponent's Ruin Runner?
 * A: Yes. Cull the Weak targets/chooses nothing when played; each player kills one of THEIR OWN units on
 *    resolution. Ruin Runner's protection is against being chosen by ENEMY spells — it is its own controller
 *    who picks it, and if it is their only unit they are forced to kill it.
 * Rules: 355.10.e (each-player-kills does not target), 422.1.a (each player chooses their own), 356.3.e.11.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const RUIN_RUNNER = "sfd-105-221";

function board(opts: { p2Second?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .unit(P1, "base", { might: 1, name: "Pawn" }, "pawn")
    .unit(P2, "base", RUIN_RUNNER, "runner")
    .hand(P1, CULL_THE_WEAK, "cull");
  return opts.p2Second ? s.unit(P2, "base", { might: 2, name: "Bystander" }, "bystander") : s;
}

/** Drain to open main phase, recording every non-priority prompt; P2 answers its kill pick with `p2Pick`. */
async function resolve(game: Game, p2Pick?: string): Promise<Decision[]> {
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

describe("Ruling 2c2f2793eda6e7bb — Cull the Weak kills an enemy Ruin Runner because its own controller chooses it", () => {
  test("premise: Ruin Runner is protected from enemy choice, yet Cull the Weak is castable and never lists the Runner as P1's target", async () => {
    const game = await board().build();
    expect(game.state("runner").keywords).toContain("Untargetable");
    expect(game.p1.can("cast", "cull")).toBe(true);
    const offered = (game.p1.option("cast", "cull")?.fields.find((f) => f.arg === "targets")?.options ?? []) as unknown[];
    const flat = [...new Set(offered.flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(flat).not.toContain("runner");
    await game.p1.cast("cull", { targets: "pawn" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
    expect(game.zoneOf("runner")).toBe("base");
  });

  test("P2's only unit is Ruin Runner: on resolution P2 is forced to kill it (mandatory, not a targeting) — both Pawn and Runner die", async () => {
    const game = await board().build();
    await game.p1.cast("cull", { targets: "pawn" });
    const prompts = await resolve(game, "runner");
    // Any prompt about the Runner is P2's own (never P1 choosing an enemy unit).
    expect(prompts.filter((p) => p.kind === "pick" && p.seat === P1 && p.options.some((o) => (o.card ?? o.key) === "runner"))).toEqual([]);
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("P2 with Ruin Runner + Bystander: the choice surfaces to P2 and INCLUDES the Runner; P2 may pick the Runner and it dies", async () => {
    const game = await board({ p2Second: true }).build();
    await game.p1.cast("cull", { targets: "pawn" });
    const prompts = await resolve(game, "runner");
    const p2Pick = prompts.find((p) => p.seat === P2 && p.kind === "pick");
    expect(p2Pick).toBeDefined();
    expect(p2Pick?.kind === "pick" ? p2Pick.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["bystander", "runner"]);
    expect(p2Pick?.kind === "pick" ? p2Pick.allowDecline : true).toBe(false);
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.zoneOf("bystander")).toBe("base");
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});

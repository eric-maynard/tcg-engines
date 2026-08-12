/**
 * Ruling f2dca6cd8c660afb — Rengar, Trophy Hunter (UNL-120 → unl-120-219) · [5][body] 6 [Might]
 *   "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *    I can be played to a battlefield where there are enemy units (even if you don't have units there)."
 *
 * Q: Can Rengar use Ambush to be played to my BASE?
 * A: No. [Ambush] (rule 822.1.b) only grants reaction-speed permission for BATTLEFIELDS, and Rengar's extra text
 *    only adds more battlefields. A base is not a battlefield. To play him to base, use normal [Action] timing on
 *    your own turn in an Open state.
 * Rules: 822.1.b ([Ambush]), 355.2.a (play destinations), 120 (base is not a battlefield), FAQ #10089.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "unl-120-219";

/** A cheap enemy [Action] spell P2 uses to open a chain, so P1 has reaction-speed priority on P2's turn. */
const PING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Ping",
  timing: "action",
} as const;

/**
 * bf1: P1 has a unit there (plain [Ambush] target). bf2: only enemy units (Rengar's extra permission).
 * P1 always holds [5][body] for Rengar.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "bf2", { might: 3, name: "Foe" }, "foe")
    .hand(P1, RENGAR, "rengar");
}

function destinations(game: Game): string[] {
  const field = game.p1.option("play", "rengar")?.fields.find((f) => f.arg === "to");
  return ((field?.options ?? []).flat() as string[]).slice().sort();
}

describe("Ruling f2dca6cd8c660afb — [Ambush] adds battlefields only; Rengar can never Ambush into base", () => {
  test("premise: Rengar carries both [Ambush] and the extra enemy-battlefield permission", async () => {
    const game = await board().build();
    expect(game.state("rengar").rulesText).toContain("[Ambush]");
    expect(game.state("rengar").rulesText).toContain("where there are enemy units");
  });

  test("at reaction speed (P2's turn, chain open) Rengar's destinations are battlefields ONLY — base is absent", async () => {
    const game = await board().active(P2).hand(P2, PING, "ping").build();
    await game.p2.cast("ping", { targets: "scout" });
    expect(game.chain()).toHaveLength(1);
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "rengar")).toBe(true);
    const dests = destinations(game);
    expect(dests).toEqual(["battlefield-bf1", "battlefield-bf2"]); // his own battlefield + the enemy-occupied one
    expect(dests).not.toContain("base");
  });

  test("forcing the reaction-speed play to base is rejected; Rengar stays in hand", async () => {
    const game = await board().active(P2).hand(P2, PING, "ping").build();
    await game.p2.cast("ping", { targets: "scout" });
    await game.p2.passPriority();
    const r = await game.p1.try((p) => p.play("rengar", { to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rengar")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { body: 1 } });
  });

  test("the reaction-speed play to a battlefield does work (so the block above is about BASE, not about Rengar)", async () => {
    const game = await board().active(P2).hand(P2, PING, "ping").build();
    await game.p2.cast("ping", { targets: "scout" });
    await game.p2.passPriority();
    await game.p1.play("rengar", { to: "bf2" });
    await game.settle();
    expect(game.locationOf("rengar")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("on P1's own turn in an Open state base IS a legal destination — that is the only way to put him there", async () => {
    const game = await board().build();
    expect(game.chain()).toEqual([]);
    const dests = destinations(game);
    expect(dests).toContain("base");
    expect(dests).toEqual(expect.arrayContaining(["battlefield-bf1", "battlefield-bf2"]));
    await game.p1.play("rengar", { to: "base" });
    await game.settle();
    expect(game.locationOf("rengar")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling a9341e797beb0ab5 — Repulse (UNL-106 → unl-106-219) · Reaction [1][body] "Choose a friendly unit at a battlefield. Counter an
 *     enemy spell or ability that chooses it and no other friendly unit."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] "Kill a unit at a battlefield. Its controller draws 2."
 *   × Cull the Weak (OGN-209 → ogn-209-298) · Action "Each player kills one of their units." (Cull sfd-134-221 is a name-clash only.)
 *
 * Q: Can Repulse stop Hidden Blade? Cull the Weak?
 * A: Hidden Blade — yes: it chooses exactly one unit, so choosing that same friendly unit with Repulse counters it. Cull the Weak —
 *    no: it chooses no unit when played (each player picks during resolution), so Repulse has nothing to latch onto and can't
 *    be played against it.
 * Rules: 355 / 355.8 (targets are play-time choices; no legal choice → can't play), 425 (counter), 422.1.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REPULSE = "unl-106-219";
const HIDDEN_BLADE = "ogn-213-298";
const CULL_THE_WEAK = "ogn-209-298";

/** P2's turn with [4] + 2 order (Blade [2][order] / Cull [2][order]). P1 holds bf1 with a lone Scout (2) and has Repulse + [1][body]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { order: 2 } })
    .resources(P1, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 3, name: "Grunt" }, "grunt")
    .hand(P2, HIDDEN_BLADE, "blade")
    .hand(P2, CULL_THE_WEAK, "cull")
    .hand(P1, REPULSE, "repulse")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Answer Repulse's own follow-up picks (the friendly unit / the item), if the engine asks them separately. */
async function answerRepulsePicks(game: Game): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const want = d.options.find((o) => (o.card ?? o.key) === "scout") ?? d.options.find((o) => (o.card ?? o.key) === "blade") ?? d.options[0]!;
      await game.p1.answer({ keys: [want.key], kind: "pick" });
    } else {
      break;
    }
  }
}

describe("Ruling a9341e797beb0ab5 — Repulse stops Hidden Blade (it chooses the unit) but not Cull the Weak (it chooses nothing)", () => {
  test("Hidden Blade at the Scout: the chain item CHOOSES exactly the Scout → Repulse is castable; P1 chooses the Scout and counters the Blade — Scout lives, nobody draws 2, both spells to trash", async () => {
    const game = await board().build();
    await game.p2.cast("blade", { targets: "scout" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P2, targets: ["scout"] })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "repulse")).toBe(true);
    await game.p1.cast("repulse", { answers: ["scout", "blade"], targets: "blade" });
    await answerRepulsePicks(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "repulse"]);
    const p1Hand = game.p1.hand().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("repulse")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash"); // countered → trash (425)
    expect(game.state("scout")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toHaveLength(p1Hand); // "its controller draws 2" never happened
    expect(game.p2.resources()).toEqual({ energy: 2, power: { order: 1 } }); // no refund for the countered Blade
    expect(game.violations()).toEqual([]);
  });

  test.failing("BUG: Cull the Weak: no unit of P1's is chosen at play time → with priority P1 can NOT cast Repulse (forcing it is refused); Cull resolves and each player loses a unit", async () => {
    const game = await board().build();
    await game.p2.cast("cull"); // nothing is chosen as it is played
    const item = game.chain()[0];
    expect(item).toMatchObject({ cardId: "cull", controller: P2 });
    expect(item?.targets ?? []).not.toContain("scout");
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "repulse")).toBe(false);
    const r = await game.p1.try((p) => p.cast("repulse", { targets: "cull" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("repulse")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1 } });
    // It resolves: resolution-time choices (a lone candidate may be auto-taken).
    await game.p1.passPriority();
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.seat(d.seat).answer({ keys: [d.options[0]!.key], kind: "pick" });
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
  });
});

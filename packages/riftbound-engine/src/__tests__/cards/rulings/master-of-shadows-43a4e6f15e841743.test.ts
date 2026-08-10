/**
 * Ruling 43a4e6f15e841743 — Master of Shadows (VEN-191 → ven-191-166) · Legend (Zed) · Fury/Chaos
 *   "When you banish a card you own, empower me. [Action] Disempower me, [Exhaust]: Discard 1, then draw 1."
 *   × Death Mark (VEN-144 → ven-144-166) · Spell · "[Burn 3]. Play a 0-Might Shadow Clone token.
 *     [Flow] [1][rainbow][rainbow] (You may play this from your trash for its Flow cost. Then banish it.)"
 *   × Shadow (UNL-194 → unl-194-219) — listed by the scrape; not needed for the mechanics under test.
 *
 * Q: Can I banish cards on my own, whenever I like, to empower Zed (the way Vi can Recycle as a cost)?
 * A: No. Banishing is a Limited Action — only when an effect directs it; the legend has no self-serve banish
 *    cost, and its own activated ability DISCARDS (not banishes) so it never empowers. You need a real banish
 *    effect (e.g. Death Mark's Flow banishing itself, a Shadow Clone's attack trigger).
 * Rules: 427.4 / 427.4.a (Banish is a Limited Action), 427.2.b (discard ≠ banish), 105 (Discretionary vs Limited).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASTER_OF_SHADOWS = "ven-191-166";
const DEATH_MARK = "ven-144-166";

async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      await game.settle({ maxSteps: 1 });
    }
  }
}

describe("Ruling 43a4e6f15e841743 — Zed's legend cannot banish 'for free'; only real banish effects empower it", () => {
  test("with cards in hand, base and trash and plenty of resources, P1's open main-phase menu offers NO banish action of any kind (427.4.a)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 2, chaos: 2, rainbow: 2 } })
      .legend(P1, MASTER_OF_SHADOWS, "zed")
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Fodder" }, "fodder")
      .trash(P1, { cardType: "unit", energyCost: 1, might: 2, name: "Corpse" }, "corpse")
      .build();
    expect(game.state("zed").isEmpowered).toBe(false);
    const menu = game.p1.legal();
    expect(menu.some((o) => /banish/i.test(o.key) || /banish/i.test(o.moveId) || /banish/i.test(o.label))).toBe(false);
    // The legend itself offers nothing while not empowered: its only activated ability COSTS "Disempower me".
    expect(menu.some((o) => o.card === "zed")).toBe(false);
    expect(game.p1.banishment()).toEqual([]);
  });

  test("the legend's own ability (Disempower me, Exhaust: Discard 1, then draw 1) DISCARDS — the card goes to trash, nothing is banished, and Zed ends up NOT empowered (427.2.b)", async () => {
    const game = await scenario()
      .card("zed", { def: MASTER_OF_SHADOWS, meta: { empowered: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P2 })
      .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Fodder" }, "fodder")
      .deck(P1, [{ cardType: "unit", energyCost: 1, might: 1, name: "Top Card" }], ["top"])
      .build();
    expect(game.state("zed").isEmpowered).toBe(true);
    expect(game.p1.can("activate", "zed")).toBe(true);
    await game.p1.activate("zed");
    await resolveChain(game);
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("fodder");
    }
    await game.settle();
    expect(game.zoneOf("fodder")).toBe("trash"); // discarded, not banished
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.hand()).toEqual(["top"]); // then drew 1
    expect(game.state("zed").isExhausted).toBe(true);
    expect(game.state("zed").isEmpowered).toBe(false); // the discard did not re-empower it
    expect(game.chain()).toEqual([]);
  });

  test("a real banish effect does it: Death Mark played via [Flow] from trash banishes itself → 'When you banish a card you own' triggers and Zed becomes empowered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 2 } }) // exactly the Flow cost
      .legend(P1, MASTER_OF_SHADOWS, "zed")
      .battlefield("bf1", { controller: P2 })
      .trash(P1, DEATH_MARK, "deathmark")
      .build();
    expect(game.state("zed").isEmpowered).toBe(false);
    expect(game.p1.can("cast", "deathmark")).toBe(true);
    await game.p1.cast("deathmark", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    // Death Mark resolves (Burn 3 + Shadow Clone token), then is banished — which puts Zed's trigger on the chain.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("deathmark")).toBe("banishment");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zed", controller: P1, triggered: true })]);
    expect(game.state("zed").isEmpowered).toBe(false); // not yet — the trigger must resolve
    await resolveChain(game);
    expect(game.state("zed").isEmpowered).toBe(true);
    expect(game.p1.trash()).toHaveLength(3); // Burn 3
    expect(game.p1.units("base").map((u) => game.state(u).name)).toEqual(["Shadow Clone"]);
    expect(game.violations()).toEqual([]);
  });
});

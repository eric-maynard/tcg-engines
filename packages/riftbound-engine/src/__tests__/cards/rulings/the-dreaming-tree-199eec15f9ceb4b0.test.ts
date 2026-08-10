/**
 * Ruling 199eec15f9ceb4b0 — The Dreaming Tree (OGN-292 → ogn-292-298, Battlefield)
 *   "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   × Hidden Blade (OGN-213 → ogn-213-298, Action, 2 + [order]) "Kill a unit at a battlefield. Its controller draws 2."
 *   × Cull the Weak (OGN-209 → ogn-209-298, Action, 2 + [order]) "Each player kills one of their units."
 *   (The scrape also lists Cull sfd-134-221 — a name collision; irrelevant.)
 *
 * Q: Hidden Blade on my own unit at the Dreaming Tree — do I draw 3 total? Does Cull the Weak trigger the Tree?
 * A: Hidden Blade: yes, 3 — the Tree's trigger goes on the chain above the Blade and resolves first (draw 1), then
 *    the Blade kills the unit and its controller draws 2. Cull the Weak: no — each player merely chooses a unit on
 *    resolution; that is not targeting, so the Tree does not trigger.
 * Rules: 383.4.b (targeting triggers fire on finalization, item above the spell), 340 (LIFO), 355 (targets are
 *        choices made as the spell is played; per-player choices on resolution are not targets).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";
const HIDDEN_BLADE = "ogn-213-298";
const CULL_THE_WEAK = "ogn-209-298";

/**
 * P1's turn. P1 controls The Dreaming Tree (live) with a 3-Might Dreamer on it; P2 has a Bystander in base.
 * P1: exactly 2 + [order]; deck top known (d1, d2, d3, d4).
 */
function board(card: string) {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, card, "spell")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4"]);
}

describe("Ruling 199eec15f9ceb4b0 — Hidden Blade on your own unit at the Dreaming Tree draws 3; Cull the Weak draws none", () => {
  test("Hidden Blade targeting my Dreamer: the Tree's trigger is added ABOVE the Blade; it resolves first (draw 1, Dreamer still alive), then the Blade kills the Dreamer and I draw 2 more — 3 cards total", async () => {
    const game = await board(HIDDEN_BLADE).build();
    await game.p1.cast("spell", { targets: "dreamer" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["spell", "tree"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    // Tree item resolves first.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("dreamer")).toBe("battlefield-tree");
    expect(game.chain().map((c) => c.cardId)).toEqual(["spell"]);
    // Then Hidden Blade.
    await game.settle();
    expect(game.zoneOf("dreamer")).toBe("trash");
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2", "d3"]);
    expect(game.p1.deck()[0]).toBe("d4");
    expect(game.p2.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("Cull the Weak: no targets on the chain, no Tree item; each player CHOOSES on resolution (P1 picks the Dreamer at the Tree) — the Dreamer dies and P1 draws nothing", async () => {
    const game = await board(CULL_THE_WEAK).unit(P1, "base", { might: 1, name: "Spare" }, "spare").build();
    // The engine may collect the caster's own choice up front; either way it is not a target for the Tree.
    const asksUpFront = game.p1.option("cast", "spell")?.fields.some((f) => f.name === "targets" && f.required) ?? false;
    let p1Chose = false;
    if (asksUpFront) {
      await game.p1.cast("spell", { targets: "dreamer" });
      p1Chose = true;
    } else {
      await game.p1.cast("spell");
    }
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["spell"]);
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
    // Resolve: each (remaining) player is asked to choose one of THEIR units (a resolution-time choice, not a target).
    for (let i = 0; i < 10; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered") {
        break;
      }
      const d = game.decision();
      if (d?.kind !== "pick") {
        break;
      }
      if (d.seat === P1) {
        expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["dreamer", "spare"]);
        await game.p1.pick("dreamer");
        p1Chose = true;
      } else {
        await game.p2.pick(d.options[0]?.key as string);
      }
      // Choosing the Dreamer never put a Tree item on the chain.
      expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
    }
    expect(p1Chose).toBe(true);
    expect(game.zoneOf("dreamer")).toBe("trash");
    expect(game.zoneOf("bystander")).toBe("trash");
    expect(game.zoneOf("spare")).toBe("base");
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.p1.hand()).toEqual([]); // no Dreaming Tree draw
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

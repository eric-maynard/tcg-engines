/**
 * Ruling d615aa66a257ce00 — The Dreaming Tree (OGN-292 → ogn-292-298, Battlefield)
 *     "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   × Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · 2 + [order] · "Each player kills one of their units."
 *   (The scrape also lists "Cull" sfd-134-221 — a name collision, irrelevant.)
 *
 * Q: I have a unit on the Dreaming Tree and my opponent plays Cull the Weak. Do I draw when I choose that unit to die?
 * A: No. Cull the Weak targets nothing; each player picks one of their own units as it RESOLVES. A choice made during
 *    resolution (by another player, even) is not "choosing a friendly unit with a spell" in the targeting sense — the
 *    Tree only triggers when you actively target your unit with a spell.
 * Rules: 355 / 355.9 (targets are the choices made as a spell is played), 355.4 (choices made on resolution are not
 *        targets), 383.4.b ("when you choose" triggers key off targeting).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";
const CULL_THE_WEAK = "ogn-209-298";
/** A 1-cost spell that DOES target: "+1 [Might] this turn" — the positive control for the Tree. */
const NUDGE = {
  abilities: [{ effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Nudge",
  timing: "action",
} as const;

/**
 * P2's turn. P1 owns/controls the live Dreaming Tree with Dreamer (3) on it and a Spare (1) in base (so P1's choice is a
 * real one); P2 has a lone Bystander and Cull the Weak + exactly 2 + [order]. P1's deck top is known.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P1, "base", { might: 1, name: "Spare" }, "spare")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P2, CULL_THE_WEAK, "cull")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

describe("Ruling d615aa66a257ce00 — choosing your Dreaming Tree unit for an opponent's Cull the Weak draws nothing", () => {
  test("Cull the Weak is cast with NO targets (nothing is chosen at play time), so no Tree trigger joins the chain", async () => {
    const game = await board().build();
    const targets = game.p2.option("cast", "cull")?.fields.find((f) => f.name === "targets");
    expect((targets?.options ?? []).flat()).toEqual([]); // it chooses nothing as it is played
    await game.p2.cast("cull");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P2, targets: [] })]);
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
  });

  test("on resolution P1 is asked to pick one of THEIR units (a resolution-time choice, P1's decision); picking the Dreamer at the Tree kills it — and P1 draws NOTHING, no Tree item ever appears", async () => {
    const game = await board().build();
    await game.p2.cast("cull");
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["dreamer", "spare"]);
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false); // the spell is resolving; nothing was triggered
    await game.p1.pick("dreamer");
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
    await game.settle(); // P2's only unit is forced
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dreamer")).toBe("trash");
    expect(game.zoneOf("bystander")).toBe("trash");
    expect(game.zoneOf("spare")).toBe("base");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.p1.hand()).toEqual([]); // no draw
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("positive control — actually TARGETING your unit at the Tree with a spell does draw: on P1's turn, Nudge on the Dreamer puts the Tree's trigger above the spell and P1 draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
      .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .hand(P1, NUDGE, "nudge")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    await game.p1.cast("nudge", { targets: "dreamer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["nudge", "tree"]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("dreamer").might).toBe(4);
  });
});

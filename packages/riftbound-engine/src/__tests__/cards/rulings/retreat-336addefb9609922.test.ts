/**
 * Ruling 336addefb9609922 — Retreat (OGN-104 → ogn-104-298) · Reaction · Mind · [1]
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield — "When a player chooses a friendly unit here with a
 *     spell for the first time each turn, they draw 1."
 *   × Cull the Weak (OGN-209 → ogn-209-298) · Action · [2][order] — "Each player kills one of their units."
 *   (sfd-134-221 "Cull" in the scrape is a name collision — irrelevant.)
 *
 * Q: Does Retreat trigger the Dreaming Tree, and why doesn't Cull the Weak?
 * A: Retreat TARGETS ("a friendly unit") → choosing your unit at the Tree triggers it. Cull the Weak does not target:
 *    each player picks a unit as it resolves, which is not "choosing with a spell" in the targeting sense → no draw.
 * Rules: 355 (targets are the choices made as a spell is played), 383.4.b (choose-triggers fire when the spell is
 *        finalized, above it on the chain), 359.3 (resolution-time selections are not targets).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";
const DREAMING_TREE = "ogn-292-298";
const CULL_THE_WEAK = "ogn-209-298";
const FILLER = "ogn-175-298";

/**
 * P1's turn. P1 controls The Dreaming Tree (live) with a 3-Might Dreamer on it; P2 has a Bystander in base. P1 has
 * exactly the spell's cost, a known deck (d1…d4) and two runes left in the rune deck.
 */
function board(spell: string, res: { energy: number; power?: Record<string, number> }) {
  return scenario()
    .resources(P1, res)
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, spell, "spell")
    .deck(P1, [FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4"]);
}

describe("Ruling 336addefb9609922 — Retreat targets (Tree draws), Cull the Weak doesn't (no draw)", () => {
  test("Retreat on my Dreamer at the Tree: the target is chosen on play, so the Tree's trigger lands ABOVE Retreat and resolves first — I draw 1; then Retreat returns the Dreamer and I channel 1 rune exhausted", async () => {
    const game = await board(RETREAT, { energy: 1 }).build();
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("spell", { targets: "dreamer" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["spell", "tree"]);
    expect(game.chain()[0]).toMatchObject({ targets: ["dreamer"], triggered: false });
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    // Tree first (LIFO).
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("dreamer")).toBe("battlefield-tree");
    expect(game.chain().map((c) => c.cardId)).toEqual(["spell"]);
    // Then Retreat.
    await game.settle();
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.zoneOf("dreamer")).toBe("hand");
    expect(new Set(game.p1.hand())).toEqual(new Set(["d1", "dreamer"]));
    expect(game.p1.deck()[0]).toBe("d2"); // exactly one Tree draw
    expect(game.p1.runes().length).toBe(runesBefore + 1);
    expect(game.p1.runes({ ready: false }).length).toBeGreaterThanOrEqual(1); // channeled exhausted
    expect(game.violations()).toEqual([]);
  });

  test("Cull the Weak: nothing is targeted — no Tree item is ever created; P1 picks the Dreamer as it resolves, it dies, and P1 draws nothing", async () => {
    const game = await board(CULL_THE_WEAK, { energy: 2, power: { order: 1 } }).unit(P1, "base", { might: 1, name: "Spare" }, "spare").build();
    // The engine may collect the caster's own choice up front; either way it must not count as a target for the Tree.
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
    let treeEverOnChain = game.chain().some((c) => c.cardId === "tree");
    for (let i = 0; i < 10; i++) {
      const r = await game.settle();
      treeEverOnChain ||= game.chain().some((c) => c.cardId === "tree");
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
        expect(d.seat).toBe(P2);
        await game.p2.pick(d.options[0]?.key as string);
      }
      treeEverOnChain ||= game.chain().some((c) => c.cardId === "tree");
    }
    expect(p1Chose).toBe(true);
    expect(treeEverOnChain).toBe(false);
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

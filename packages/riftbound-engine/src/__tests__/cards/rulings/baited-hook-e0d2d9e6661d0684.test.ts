/**
 * Ruling e0d2d9e6661d0684 — Baited Hook (OGN-242 → ogn-242-298) · Gear "[1][order], [Exhaust]: Kill a friendly unit. Look at
 *     the top 5 cards of your Main Deck. You may banish a unit … and play it, ignoring its cost. Then recycle the rest."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) "When a player chooses a friendly unit here with a spell for the first time
 *     each turn, they draw 1."
 *   × Cull the Weak (OGN-209 → ogn-209-298) "Each player kills one of their units." (the scrape lists sfd-134 "Cull" — a
 *     name collision)
 *
 * Q: Does Baited Hook (choosing my unit at the Dreaming Tree to kill) trigger the Tree?
 * A: No. Baited Hook does target, but the Tree needs a SPELL to do the choosing; a gear's ability is not a spell.
 *    Nuance: Cull the Weak doesn't trigger it either — each player choosing on resolution is not targeting.
 * Rules: 383.4.b (targeting effects), 355.6 (what counts as targeting), 132/135 (spell vs ability), 355.10 (per-player
 *        choices at resolution are not targets).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const DREAMING_TREE = "ogn-292-298";
const CULL_THE_WEAK = "ogn-209-298";
const DISCIPLINE = "ogn-058-298"; // [Reaction] [2] "Give a unit +2 [Might] this turn. Draw 1." — a SPELL that chooses

const JUNK = (n: number) => ({ cardType: "spell", energyCost: 1, name: `Junk ${n}` }) as const;

/**
 * P1's turn. P1 controls The Dreaming Tree (live text) with a 3-Might Dreamer on it. P1: Baited Hook ready in base,
 * [3][order][order] (Hook [1][order] / Discipline [2] / Cull [2][order]). Deck = six known junk spells (nothing for the Hook
 * to play, and every draw is identifiable).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { order: 2 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .gear(P1, BAITED_HOOK, "hook")
    .deck(P1, [JUNK(1), JUNK(2), JUNK(3), JUNK(4), JUNK(5), JUNK(6)], ["j1", "j2", "j3", "j4", "j5", "j6"]);
}

describe("Ruling e0d2d9e6661d0684 — Baited Hook choosing a unit at the Dreaming Tree does not trigger the Tree", () => {
  test("Baited Hook targets the Dreamer (a real chosen target on the ability item) yet NO Dreaming Tree item is created and P1 draws nothing; the Dreamer is killed", async () => {
    const game = await board().hand(P1, DISCIPLINE, "disc").build();
    const deckBefore = game.p1.deck().length;
    const targets = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
    expect((targets?.options ?? []).flat()).toContain("dreamer"); // it DOES target…
    await game.p1.activate("hook", 0, { targets: "dreamer" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } });
    expect(game.state("hook").isExhausted).toBe(true);
    // …but it is a gear ABILITY, not a spell: only the Hook is on the chain.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hook", targets: ["dreamer"], triggered: false, type: "ability" })]);
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
    await game.settle(); // resolves: kill, look at 5 (no unit to take), recycle
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dreamer")).toBe("trash");
    expect(game.p1.hand()).toEqual(["disc"]); // no Tree draw
    expect(game.p1.deck()).toHaveLength(deckBefore); // looked-at cards recycled, none drawn
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a SPELL (Discipline) choosing the same Dreamer does trigger the Tree — a Tree item lands above the spell and P1 draws 1 from it (plus Discipline's own draw)", async () => {
    const game = await board().hand(P1, DISCIPLINE, "disc").build();
    await game.p1.cast("disc", { targets: "dreamer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "tree"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Tree resolves first
    expect(game.p1.hand()).toEqual(["j1"]);
    await game.settle(); // Discipline: +2, draw 1
    expect(game.state("dreamer").might).toBe(5);
    expect(game.p1.hand()).toEqual(["j1", "j2"]);
  });

  test.failing("BUG: nuance: Cull the Weak makes each player CHOOSE a unit on resolution — not targeting — so killing the Dreamer with it never creates a Tree item and P1 draws nothing", async () => {
    const game = await board().hand(P1, CULL_THE_WEAK, "cull").build();
    const deckBefore = game.p1.deck().length;
    // Nothing is chosen as it is played: no caster-chosen target on the item.
    const upFront = game.p1.option("cast", "cull")?.fields.find((f) => f.name === "targets");
    expect((upFront?.options ?? []).flat()).toEqual([]);
    await game.p1.cast("cull");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cull"]);
    for (let i = 0; i < 10; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered") break;
      const d = game.decision();
      if (d?.kind !== "pick") break;
      if (d.seat === P1) {
        await game.p1.pick("dreamer");
      } else {
        await game.p2.pick(d.options[0]?.key as string);
      }
      expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
    }
    expect(game.zoneOf("dreamer")).toBe("trash");
    expect(game.zoneOf("onlooker")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.p1.hand()).toEqual([]); // no Dreaming Tree draw
    expect(game.p1.deck()).toHaveLength(deckBefore);
    expect(game.violations()).toEqual([]);
  });
});

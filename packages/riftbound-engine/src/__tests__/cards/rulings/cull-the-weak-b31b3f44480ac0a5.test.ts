/**
 * Ruling b31b3f44480ac0a5 — Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · 2+[order] "Each player kills one of their units."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield "When a player chooses a friendly unit here with a spell for the
 *     first time each turn, they draw 1."   (Cull sfd-134-221 in the scrape is a name collision — irrelevant.)
 *
 * Q: I cast Cull the Weak and select my own unit at The Dreaming Tree to die — do I draw?
 * A: No. Cull the Weak does not target: each player chooses their unit as the spell RESOLVES, which is not "choosing a
 *    friendly unit with a spell" in the targeting sense the Tree requires. Only actively targeting spells trigger it.
 * Rules: 355.10 / 355.10.e (resolution-time choices are not targets), 383.4.b.2 (Targeting-Effect triggers).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const DREAMING_TREE = "ogn-292-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn. bf1 = The Dreaming Tree (live), held by P1 with P1's lone Dreamer on it. P2's Grunt in P2's base. P1: Cull + Discipline, [4]+[order]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 1 } })
    .battlefield("bf1", { controller: P1, def: DREAMING_TREE, inert: false })
    .unit(P1, "bf1", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, CULL_THE_WEAK, "cull")
    .hand(P1, DISCIPLINE, "disc");
}

describe("Ruling b31b3f44480ac0a5 — picking my Dreaming Tree unit for Cull the Weak is not 'choosing' it; no draw", () => {
  test("control: Discipline TARGETS Dreamer at the Tree → a Tree trigger lands above the spell and P1 nets +1 card beyond Discipline's own draw", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("disc", { targets: "dreamer" });
    expect(game.chain().some((c) => c.cardId === "bf1" && c.triggered && c.controller === P1)).toBe(true);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1 + 1);
  });

  test.failing("BUG: Cull the Weak has no play-time target: casting it puts ONLY the spell on the chain — no Dreaming Tree item", async () => {
    const game = await board().build();
    await game.p1.cast("cull"); // castable naming nothing — the pick happens on resolution
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1, triggered: false })]);
  });

  test.failing("BUG: on resolution each player picks their own unit (P1 names Dreamer at the Tree): Dreamer and Grunt die, the Tree never fires, P1's hand shrank by exactly the Cull and the deck is untouched", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p1.cast("cull");
    let sawTree = false;
    let stop = await game.settle();
    for (let i = 0; i < 4 && stop.reason === "unanswered"; i++) {
      sawTree ||= game.chain().some((c) => c.cardId === "bf1");
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        expect(d.options.map((o) => o.card ?? o.key)).toContain("dreamer");
        await game.p1.pick("dreamer");
      } else if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick("grunt");
      } else {
        break;
      }
      sawTree ||= game.chain().some((c) => c.cardId === "bf1");
      stop = await game.settle();
    }
    expect(stop.reason).toBe("open");
    expect(sawTree).toBe(false);
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.zoneOf("dreamer")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 - 1);
    expect(game.p1.deck()).toHaveLength(deck0);
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling 318a9f12e120d7d2 — Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · 2 + [order]
 *     "Each player kills one of their units."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield
 *     "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   (The scrape also lists Cull sfd-134-221 — a name collision; irrelevant.)
 *
 * Q: Does Cull the Weak trigger Dreaming Tree?
 * A: No. Dreaming Tree's "choose" means "target"; Cull the Weak does not target — each player picks their own
 *    unit as it resolves — so no player "chooses a unit with a spell" and nobody draws.
 * Rules: 355.10.e (each-player-kills is not targeting), 383.4.b.2 (Targeting-Effect triggers).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const DREAMING_TREE = "ogn-292-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P1's turn. bf1 = The Dreaming Tree (live abilities), held by P1 with P1's only unit Dreamer on it. P2's lone
 * Grunt sits in P2's base. P1: Cull the Weak + Discipline in hand, [4] + [order].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 1 } })
    .battlefield("bf1", { controller: P1, def: DREAMING_TREE, inert: false })
    .unit(P1, "bf1", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, CULL_THE_WEAK, "cull")
    .hand(P1, DISCIPLINE, "disc");
}

describe("Ruling 318a9f12e120d7d2 — Cull the Weak does not 'choose' a unit, so The Dreaming Tree does not trigger", () => {
  test("control: Discipline (a spell that DOES choose Dreamer at the Tree) fires the Tree — a triggered draw lands on the chain above the spell and P1 nets +1 card beyond Discipline's own draw", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length; // cull + disc
    await game.p1.cast("disc", { targets: "dreamer" });
    expect(game.chain().some((c) => c.cardId === "bf1" && c.triggered)).toBe(true);
    await game.settle();
    // -1 (Discipline left hand) +1 (Discipline's draw) +1 (Dreaming Tree) = hand0 + 1
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test.failing("BUG: Cull the Weak: casting it (even naming Dreamer, P1's unit at the Tree, as the one P1 will kill) puts NO Dreaming Tree trigger on the chain", async () => {
    const game = await board().build();
    await game.p1.cast("cull"); // rule 355.10.e — no play-time target; the caster picks dreamer on resolution
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
    expect(game.chain().some((c) => c.cardId === "bf1" || c.triggered)).toBe(false);
  });

  test.failing("BUG: Cull the Weak resolves: Dreamer and Grunt die, and P1 drew NOTHING (hand shrank by exactly the Cull) — the Tree never fired at play or at resolution", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p1.cast("cull"); // rule 355.10.e — no play-time target; the caster picks dreamer on resolution
    let stop = await game.settle();
    for (let i = 0; i < 4 && stop.reason === "unanswered"; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick("grunt");
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("dreamer");
      } else {
        break;
      }
      stop = await game.settle();
    }
    expect(stop.reason).toBe("open");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.zoneOf("dreamer")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 - 1);
    expect(game.p1.deck()).toHaveLength(deck0);
    expect(game.violations()).toEqual([]);
  });
});

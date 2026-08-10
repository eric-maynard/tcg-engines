/**
 * Ruling 7cdd6e6ee688ef57 — Drag Under (SFD-164 → sfd-164-221) · Action · [5]+[order]
 *     "I cost [2] less to play from anywhere other than your hand. Kill a unit at a battlefield."
 *   × Fizz, Trickster (SFD-140 → sfd-140-221) · [3]+[chaos] · 3 Might
 *     "When you play me, you may play a spell from your trash with Energy cost no more than [3], ignoring its
 *      Energy cost. Recycle that spell after you play it."
 *
 * Q: Can Fizz play Drag Under from the trash, since from the trash it would only cost 3? Does Fizz see 3 or 5?
 * A: No. Fizz checks the PRINTED Energy cost (5), not the discounted cost-to-play; 5 > 3, so Drag Under is
 *    not an eligible choice. (Hextech Ray, printed [1], is used as the eligible contrast.)
 * Rules: 131.4 (effects that read a card's cost use its printed cost, even if altered when paying).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAG_UNDER = "sfd-164-221";
const FIZZ = "sfd-140-221";
const HEXTECH_RAY = "ogn-009-298"; // [1]+[fury] "Deal 3 to a unit at a battlefield" — a legal ≤3 pick

/** P1's turn. P2's Wall (5) at P2's bf1. P1: Fizz in hand, [3] + chaos (Fizz) + order (Drag Under's power) + fury (Ray's power). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .hand(P1, FIZZ, "fizz")
    .trash(P1, DRAG_UNDER, "drag")
    .resources(P1, { energy: 3, power: { chaos: 1, fury: 1, order: 1 } });
}

describe("Ruling 7cdd6e6ee688ef57 — Fizz reads Drag Under's printed cost (5), so it can't replay it from the trash", () => {
  test("Drag Under is the only spell in the trash: accepting Fizz's 'you may' finds nothing eligible — Drag Under stays in the trash, the Wall lives, no order power is spent", async () => {
    const game = await board().build();
    expect(game.state("drag").energyCost).toBe(5); // printed cost, regardless of where it sits
    await game.p1.play("fizz");
    expect(game.zoneOf("fizz")).toBe("base");
    const d: Decision | null = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    }
    // Whatever the engine asks next, Drag Under must never be on offer.
    for (let i = 0; i < 6; i++) {
      const cur: Decision | null = game.decision();
      if (cur?.kind === "pick" && cur.seat === P1) {
        expect(cur.options.map((o) => o.card ?? o.key)).not.toContain("drag");
        break;
      }
      if (cur?.kind === "action" && cur.context === "chain") {
        expect(game.chain().flatMap((c) => c.targets ?? [])).not.toContain("drag");
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("drag")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 1, order: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("contrast — with Hextech Ray ([1]) also in the trash, Fizz's choice is the Ray ONLY (Drag Under is not a legal option); the Ray is played free, hits the Wall for 3 and is recycled", async () => {
    const game = await board().trash(P1, HEXTECH_RAY, "ray").build();
    await game.p1.play("fizz");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fizz" } });
    await game.p1.yes();
    // Either the single legal choice (Ray) was locked in, or a pick is shown — which must exclude Drag Under.
    const d: Decision | null = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const offered = d.options.map((o) => o.card ?? o.key);
      expect(offered).toContain("ray");
      expect(offered).not.toContain("drag");
      await game.p1.pick("ray");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fizz", targets: ["ray"], triggered: true })]);
    // Let the trigger resolve and the Ray be played; answer its target if asked.
    for (let i = 0; i < 8; i++) {
      const cur: Decision | null = game.decision();
      if (cur?.kind === "pick" && cur.seat === P1) {
        expect(cur.options.map((o) => o.card ?? o.key)).not.toContain("drag");
        const wall = cur.options.find((o) => (o.card ?? o.key) === "wall") ?? cur.options[0]!;
        await game.p1.pick(wall.card ?? wall.key);
      } else if (cur?.kind === "action" && cur.context === "chain") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("ray")).toBe("mainDeck"); // recycled after being played
    expect(game.zoneOf("drag")).toBe("trash"); // never touched
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0, order: 1 } }); // Ray's [fury] paid, no order spent
    expect(game.violations()).toEqual([]);
  });
});

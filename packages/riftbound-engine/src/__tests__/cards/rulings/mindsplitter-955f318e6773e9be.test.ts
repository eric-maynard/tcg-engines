/**
 * Ruling 955f318e6773e9be — Mindsplitter (OGN-192 → ogn-192-298, [7][chaos][chaos], 7 Might: "When you play me, choose an
 *   opponent. They reveal their hand. Choose a card from it, and they discard that card.") × Defy (OGN-045 → ogn-045-298,
 *   Reaction: "Counter a spell that costs no more than [4]…") × Rebuke (OGN-172, Action bounce) × Star-Crossed (UNL-128 →
 *   unl-128-219, Reaction [3][chaos]: "Return a friendly unit and an enemy unit to their owners' hands.")
 *
 * Q: Is there any counter to Mindsplitter's ability?
 * A: No. It is a triggered ability, not a spell — Defy cannot target it; removing Mindsplitter in response does not stop
 *    it (a chain item resolves independently of its source). You CAN react to it (Closed State) — e.g. Star-Crossed to
 *    get a unit back to hand before the discard — but the ability still resolves.
 * Rules: 425.1 (Defy counters spells only), 383 / 359 (triggered ability on the chain resolves regardless of its source),
 *        330/336 (reaction window).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MINDSPLITTER = "ogn-192-298";
const DEFY = "ogn-045-298";
const STAR_CROSSED = "unl-128-219";
const KEEPSAKE = "ogn-175-298";

/** P1 plays Mindsplitter ([7] + 2 chaos). P2 holds Defy, Star-Crossed and a Skulker, with [4] + chaos + calm; P2's Pawn (2) at P2's bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { chaos: 2 } })
    .resources(P2, { energy: 4, power: { calm: 1, chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .hand(P1, MINDSPLITTER, "ms")
    .hand(P2, DEFY, "defy")
    .hand(P2, STAR_CROSSED, "sc")
    .hand(P2, KEEPSAKE, "keep");
}

/** Mindsplitter is played; its trigger is on the chain; P1 passes → P2 holds priority. */
async function triggerPendingP2Priority(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("ms");
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options[0]?.key as string); // "choose an opponent" (forced in a 1v1)
    }
  }
  expect(game.zoneOf("ms")).toBe("base");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ms", controller: P1, triggered: true, type: "ability" })]);
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // Closed State: P2 may react
  return game;
}

describe("Ruling 955f318e6773e9be — Mindsplitter's play trigger cannot be countered or stopped, only reacted to", () => {
  test("Defy cannot be used on it: with only the triggered ABILITY on the chain, Defy (counter a SPELL) is not playable — while a real Reaction (Star-Crossed) is", async () => {
    const game = await triggerPendingP2Priority();
    expect(game.p2.can("cast", "defy")).toBe(false);
    expect((await game.p2.try((p) => p.cast("defy", { targets: "ms" }))).ok).toBe(false);
    expect(game.p2.can("cast", "sc")).toBe(true);
  });

  test("unopposed it resolves: P2's hand is revealed to P1, P1 picks a card and P2 discards it", async () => {
    const game = await triggerPendingP2Priority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "ms" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["defy", "keep", "sc"]); // P2's whole hand
    await game.p1.pick("sc");
    await game.settle();
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.p2.hand().sort()).toEqual(["defy", "keep"]);
  });

  test("reacting by REMOVING Mindsplitter (Star-Crossed bounces Pawn + Mindsplitter) does not stop the ability: it stays on the chain un-countered and still resolves — P1 then picks from P2's hand, which now even includes the rescued Pawn", async () => {
    const game = await triggerPendingP2Priority();
    await game.p2.cast("sc", { targets: ["pawn", "ms"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ms", "sc"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // Star-Crossed resolves (LIFO)
    expect(game.zoneOf("ms")).toBe("hand"); // the source is gone …
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ms", countered: false, triggered: true })]); // … the ability is not
    await game.acting().passPriority();
    await game.acting().passPriority(); // the ability resolves anyway
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "ms" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["defy", "keep", "pawn"]);
    await game.p1.pick("pawn");
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash"); // discarded after all
    expect(game.p2.hand().sort()).toEqual(["defy", "keep"]);
    expect(game.p1.hand()).toContain("ms");
    expect(game.violations()).toEqual([]);
  });
});

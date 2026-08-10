/**
 * Ruling d8fad309182791df — Mindsplitter (OGN-192 → ogn-192-298) · [7][chaos][chaos] · 7 Might "When you play me, choose an opponent.
 *   They reveal their hand. Choose a card from it, and they discard that card."
 *   × Baron Nashor (UNL-147 → unl-147-219) · 12 Might "…I can't be chosen by enemy spells and abilities. …"
 *
 * Q: Can Baron Nashor be chosen from hand and discarded by Mindsplitter?
 * A: Yes. Baron's "can't be chosen" only functions while he is a unit on the board; in hand he is just a card with no active
 *    abilities, so Mindsplitter's ability may choose him and he is discarded.
 * Rules: 384.1 (permanents' abilities are active on the board), 757 / 355.9.b ("can't be chosen" protection), 148 (cards in hand).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MINDSPLITTER = "ogn-192-298";
const BARON = "unl-147-219";
const KEEPSAKE = "ogn-175-298";

function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .hand(P1, MINDSPLITTER, "ms")
    .hand(P2, BARON, "baron")
    .hand(P2, KEEPSAKE, "keep");
}

/** Play Mindsplitter and pass priority until its trigger asks P1 to choose a card from P2's revealed hand. */
async function mindsplitterResolving(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("ms");
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "baron" || (o.card ?? o.key) === "keep")) {
      break;
    }
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options[0]!.key); // "choose an opponent" (forced in 1v1)
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.zoneOf("ms")).toBe("base");
  return game;
}

describe("Ruling d8fad309182791df — Baron Nashor in hand has no 'can't be chosen' protection against Mindsplitter", () => {
  test("premise: in hand Baron carries no active Untargetable/'can't be chosen' grant (that static only applies on the board)", async () => {
    const game = await board().build();
    expect(game.zoneOf("baron")).toBe("hand");
    expect(game.state("baron").keywords).not.toContain("Untargetable");
  });

  test("Mindsplitter's trigger reveals P2's hand and offers EVERY card in it to P1 — Baron included", async () => {
    const game = await mindsplitterResolving();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "ms" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["baron", "keep"]);
    expect(game.gameState.publicReveals?.at(-1)).toMatchObject({ cardIds: expect.arrayContaining(["baron", "keep"]), playerId: P2 });
  });

  test("P1 chooses Baron: P2 discards him to the trash", async () => {
    const game = await mindsplitterResolving();
    await game.p1.pick("baron");
    await game.settle();
    expect(game.zoneOf("baron")).toBe("trash");
    expect(game.p2.trash()).toContain("baron");
    expect(game.p2.hand()).toEqual(["keep"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: ON THE BOARD Baron does carry the protection (Untargetable) — the clause is a board-only static", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 10, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P1 })
      .hand(P2, BARON, "baron")
      .build();
    await game.p2.play("baron");
    await game.settle();
    expect(game.zoneOf("baron")).not.toBe("hand");
    expect(game.state("baron").keywords).toContain("Untargetable");
  });
});

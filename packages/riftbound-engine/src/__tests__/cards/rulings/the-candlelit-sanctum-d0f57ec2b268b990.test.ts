/**
 * Ruling d0f57ec2b268b990 — The Candlelit Sanctum (OGN-291 → ogn-291-298) · Battlefield
 *   "When you conquer here, look at the top two cards of your Main Deck. You may recycle one or both of them. Put those
 *    you don't back in any order."
 *   × Solari Shrine (OGN-072 → ogn-072-298) · Gear · [3] — "When you kill a stunned enemy unit, you may exhaust this to draw 1."
 *
 * Q: Attacking Candlelit Sanctum, combat damage kills a stunned unit and I conquer — in what order do the Shrine's draw
 *    trigger and the Sanctum's conquer trigger resolve?
 * A: The Shrine's trigger (created by the special cleanup that kills the damaged unit) resolves COMPLETELY — after a
 *    reaction window — before combat resolution finishes; only then is the conquer scored and the Sanctum's trigger
 *    put on the chain.
 * Rules: 465–467 (combat resolution & its cleanup), 383 (pending triggers finalized at cleanup), 344/442 (conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CANDLELIT_SANCTUM = "ogn-291-298";
const SOLARI_SHRINE = "ogn-072-298";
const SKULKER = "ogn-175-298";

/**
 * P1's turn. bf1 IS The Candlelit Sanctum (live), held by P2 with a STUNNED Victim (2). P1: Solari Shrine in base, a
 * Raider (3) ready in base, and a known deck (D1, D2, D3 on top).
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2, def: CANDLELIT_SANCTUM, inert: false })
    .unit(P2, "bf1", { might: 2, name: "Victim" }, "victim", { stunned: true })
    .gear(P1, SOLARI_SHRINE, "shrine")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["d1", "d2", "d3"]);
}

/** Raider attacks; both pass Focus → combat resolves: 3 damage kills the stunned Victim (which deals none back). */
async function attackAndResolveCombat(): Promise<Game> {
  const game = await board().build();
  expect(game.state("victim").isStunned).toBe(true);
  await game.p1.move("raider", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

describe("Ruling d0f57ec2b268b990 — Solari Shrine's kill trigger fully resolves before Candlelit Sanctum's conquer trigger is even added", () => {
  test("combat kills the stunned Victim → the Shrine's 'you may exhaust' is asked and its trigger is the ONLY chain item; bf1 is NOT yet conquered (still P2's, 0 points) and no Sanctum trigger exists", async () => {
    const game = await attackAndResolveCombat();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("raider").damage).toBe(0); // stunned units deal no combat damage
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "shrine" } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shrine", controller: P1, triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "bf1")).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("accepting: the Shrine exhausts, both players get a reaction window on it, and it resolves — P1 draws D1 — all still before the conquer", async () => {
    const game = await attackAndResolveCombat();
    await game.p1.yes();
    expect(game.state("shrine").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // reaction window
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    await game.p2.passPriority(); // Shrine trigger resolves
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("only then does combat resolution finish: P1 conquers bf1 (+1 point) and The Candlelit Sanctum's trigger is NOW on the chain; it resolves looking at D2/D3", async () => {
    const game = await attackAndResolveCombat();
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sanctum resolves
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).toSorted() : []).toEqual(["d2", "d3"]); // D1 was already drawn
    await game.p1.decline(); // keep both …
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 }); // … and put them back "in any order"
    await game.p1.order(["d3", "d2"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.deck().slice(0, 2)).toEqual(["d3", "d2"]);
  });
});

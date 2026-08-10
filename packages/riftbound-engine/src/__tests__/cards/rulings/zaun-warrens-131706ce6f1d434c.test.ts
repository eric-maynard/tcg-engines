/**
 * Ruling 131706ce6f1d434c — Zaun Warrens (OGN-298 → ogn-298-298) · Battlefield
 *   "When you conquer here, discard 1, then draw 1."
 *   × Gust (ogn-169-298) · Reaction · [1] — the opponent's reaction of choice.
 *
 * Q: Can I react to Zaun Warrens' conquer trigger?
 * A: Yes. It is a triggered ability placed on the chain when you conquer; players may play Reactions in response. The
 *    conquer POINT is scored as part of conquering (no chain) — the trigger comes after. Discard and draw are separate:
 *    with an empty hand you skip the discard and still draw.
 * Rules: 383 / 383.3 (triggered ability → chain), 813.1.c.1 (Reactions in response), 466.5/469.1 (conquer scores at
 *        resolution of combat, not via the chain), 421 (discard), 359.3 (do as much as possible).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZAUN_WARRENS = "ogn-298-298";
const GUST = "ogn-169-298";

/** P1's turn. The Warrens (live) are P2's, held by a 1-Might Wall; P1's 3-Might Raider attacks. P2: Gust + [1]. P1's hand as given. */
function board(p1Hand: readonly string[]) {
  const b = scenario()
    .resources(P2, { energy: 1 })
    .battlefield("warrens", { controller: P2, def: ZAUN_WARRENS, inert: false })
    .unit(P2, "warrens", { might: 1, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, GUST, "gust")
    .deck(P1, ["ogn-175-298"], ["topdeck"]);
  for (const alias of p1Hand) b.hand(P1, { cardType: "unit", energyCost: 9, might: 9, name: `Card ${alias}` }, alias);
  return b;
}

/** Raider attacks; both pass Focus; combat: Wall dies, P1 conquers the Warrens. Stops with the trigger on the chain. */
async function conquer(p1Hand: readonly string[]): Promise<Game> {
  const game = await board(p1Hand).build();
  await game.p1.move("raider", "warrens");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.zoneOf("wall")).toBe("trash");
  expect(game.gameState.battlefields.warrens?.controller).toBe(P1);
  return game;
}

describe("Ruling 131706ce6f1d434c — Zaun Warrens' conquer trigger is a chain item you can react to", () => {
  test("after the conquer: the POINT is already scored (no chain involved) while 'discard 1, then draw 1' sits on the chain as P1's triggered ability — nothing discarded or drawn yet", async () => {
    const game = await conquer(["junk"]);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "warrens", controller: P1, name: "Zaun Warrens", triggered: true })]);
    expect(game.p1.hand()).toEqual(["junk"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("reaction timing: P1 passes → P2 holds priority with the trigger pending and may play a Reaction — Gust on the (3-Might) Raider goes on top and resolves first", async () => {
    const game = await conquer(["junk"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "raider" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["warrens", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("raider")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["warrens"]); // the Warrens item still resolves afterwards
    expect(game.p1.points()).toBe(1); // the point was never on the chain — reacting can't undo it
  });

  test("then the trigger resolves normally: P1 discards 1 (junk — the only card, forced) and draws 1 (topdeck)", async () => {
    const game = await conquer(["junk"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand()).toEqual(["topdeck"]);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — EMPTY hand: the discard is skipped and P1 still draws 1", async () => {
    const game = await conquer([]);
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["topdeck"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

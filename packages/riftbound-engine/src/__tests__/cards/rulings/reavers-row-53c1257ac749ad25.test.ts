/**
 * Ruling 53c1257ac749ad25 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *     "When you defend here, you may move a friendly unit here to base."
 *   × Leona, Determined (ogn-238-298) · 4 Might · "[Shield] When I attack, stun an enemy unit here."
 *
 * Q: With Reaver's Row, does Leona's stun happen before the defender's move?
 * A: No. "When I attack" items go on the chain first and "when I defend" items second, and the chain resolves in
 *    reverse — so the Row's move resolves FIRST, then the stun (which finds its chosen unit no longer "here").
 * Rules: 464.2.e.1 (initial combat chain: attacker's triggers first, defender's last), 340 (LIFO), 355.7 (targets named at
 *        finalization, in chain order), 359.3.e.5 (target no longer legal ⇒ instruction skipped).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const LEONA_DETERMINED = "ogn-238-298";

/** P2's turn. P1 holds the live Row with Target (3) and Anchor (5, stays so P1 keeps defending). P2's Leona ready in base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P1, "row", { might: 3, name: "Target" }, "target")
    .unit(P1, "row", { might: 5, name: "Anchor" }, "anchor")
    .unit(P2, "base", LEONA_DETERMINED, "leona");
}

const pickOptions = (game: Game) => {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
};

/** Leona attacks; P2 aims the stun at Target; P1 accepts the Row and names Target too. */
async function bothOnTarget(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("leona", "row");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "leona" }, timing: "FIN" });
  expect(pickOptions(game)).toEqual(["anchor", "target"]);
  await game.p2.pick("target");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "row" }, timing: "FIN" });
  await game.p1.pick("target");
  return game;
}

describe("Ruling 53c1257ac749ad25 — Leona's stun (attack trigger) is UNDER the Row's move (defend trigger) and resolves after it", () => {
  test("chain order: Leona's 'When I attack' item is added first (bottom, P2), the Row's 'When you defend here' item second (top, P1); targets are named in that order too", async () => {
    const game = await bothOnTarget();
    expect(game.chain().map((c) => [c.cardId, c.controller, c.targets])).toEqual([
      ["leona", P2, ["target"]],
      ["row", P1, ["target"]],
    ]);
    expect(game.state("target")).toMatchObject({ isStunned: false, zone: "battlefield-row" }); // nothing resolved yet
  });

  test("resolution is reversed: the Row moves Target to base FIRST (Leona's item still waiting) …", async () => {
    const game = await bothOnTarget();
    await game.acting().passPriority();
    await game.acting().passPriority(); // top item (Row) resolves
    expect(game.locationOf("target")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["leona"]);
    expect(game.state("target").isStunned).toBe(false);
  });

  test("… THEN the stun resolves — and Target is no longer 'here', so it is not stunned (nor is Anchor re-targeted); combat then proceeds Leona 4 vs Anchor 5", async () => {
    const game = await bothOnTarget();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("target")).toMatchObject({ isStunned: false, zone: "base" });
    expect(game.state("anchor")).toMatchObject({ isStunned: false, zone: "battlefield-row" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle();
    expect(game.zoneOf("leona")).toBe("trash");
    expect(game.zoneOf("anchor")).toBe("battlefield-row");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if P1 declines the Row, only Leona's item is on the chain and Target IS stunned when it resolves", async () => {
    const game = await board().build();
    await game.p2.move("leona", "row");
    await game.p2.pick("target");
    await game.p1.no();
    expect(game.chain().map((c) => c.cardId)).toEqual(["leona"]);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("target")).toMatchObject({ isStunned: true, zone: "battlefield-row" });
  });
});

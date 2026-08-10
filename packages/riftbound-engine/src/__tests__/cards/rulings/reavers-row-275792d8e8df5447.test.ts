/**
 * Ruling 275792d8e8df5447 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *     "When you defend here, you may move a friendly unit here to base."
 *   × Yasuo, Remorseful (ogn-076-298) · 6 Might — "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: Yasuo's attack trigger targets a unit, but Reaver's Row moves that unit away before the trigger resolves. Does
 *    Yasuo still damage it?
 * A: No. Attack/defend triggers go on the chain in focus order — Yasuo's (attacker) first, the Row's (defender) second —
 *    so the Row resolves first and may move the targeted unit to base; when Yasuo's trigger resolves the target is no
 *    longer "here", so the ability does nothing.
 * Rules: 383.3.d / 464.2.d (initial combat chain: turn player's triggers first), 340 (LIFO), 402.2 (targets chosen at
 *        finalization), 359.3.e.5 (a target that no longer meets "here" is unaffected — no re-target).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const YASUO = "ogn-076-298";

/** P2's turn. P1 holds Reaver's Row (live) with Big (5) and Small (2). P2's Yasuo (6) is ready in base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P1, "row", { might: 5, name: "Big" }, "big")
    .unit(P1, "row", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", YASUO, "yasuo");
}

const pickOptions = (game: Game) => {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
};

/** Yasuo attacks; P2 aims at Small; P1 accepts the Row and also names Small. Chain = [yasuo (bottom), row (top)]. */
async function bothAimAtSmall(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("yasuo", "row");
  // Focus order: the attacker's trigger is added (and finalized) first…
  expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
    ["yasuo", P2],
    ["row", P1],
  ]);
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "yasuo" }, timing: "FIN" });
  expect(pickOptions(game)).toEqual(["big", "small"]);
  await game.p2.pick("small");
  // …then the defender's Row: opt-in, then which friendly unit here.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "row" }, timing: "FIN" });
  expect(pickOptions(game)).toEqual(["big", "small"]);
  await game.p1.pick("small");
  expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([
    ["yasuo", ["small"]],
    ["row", ["small"]],
  ]);
  return game;
}

describe("Ruling 275792d8e8df5447 — Reaver's Row whisks Yasuo's target home before his damage resolves", () => {
  test("sequence: Yasuo's attack trigger goes on the chain FIRST (P2 chooses its target first), the Row's defend trigger SECOND, on top", async () => {
    const game = await bothAimAtSmall();
    expect(game.chain().at(-1)).toMatchObject({ cardId: "row", controller: P1, triggered: true });
    expect(game.chain()[0]).toMatchObject({ cardId: "yasuo", controller: P2, triggered: true });
  });

  test("the Row resolves first and moves Small to base; Yasuo's trigger is still pending, still naming Small", async () => {
    const game = await bothAimAtSmall();
    await game.acting().passPriority();
    await game.acting().passPriority(); // top item (Row) resolves
    expect(game.locationOf("small")).toBe("base");
    expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([["yasuo", ["small"]]]);
  });

  test("when Yasuo's trigger resolves Small is no longer 'here' → it does nothing: Small undamaged in base, Big never re-targeted, back to the showdown", async () => {
    const game = await bothAimAtSmall();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("small")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("big")).toMatchObject({ damage: 0, zone: "battlefield-row" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P1 declines the Row: Small stays 'here' and takes Yasuo's 6 when his trigger resolves (dies)", async () => {
    const game = await board().build();
    await game.p2.move("yasuo", "row");
    await game.p2.pick("small");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" } });
    await game.p1.no();
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-row");
  });
});

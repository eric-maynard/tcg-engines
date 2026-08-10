/**
 * Ruling 5fc85d37bf834743 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *   "When you defend here, you may move a friendly unit here to base."
 *
 * Q: Does Reaver's Row count as targeting the friendly unit even if you end up not returning it?
 * A: Yes — the friendly unit is declared as the target when the ability is put on the chain (not when it resolves);
 *    priority then passes to the opponent. [The ruling adds that whether to actually move it is decided when priority
 *    comes back / on resolution — see RULING-CONFLICT below.]
 * Rules: 383.3.a (leading "you may" = opt-in at finalization), 383.3.a.1 (that is the only decision), 383.3.b / 402.2
 *        (targets chosen at finalization), 355.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";

/** P2's turn. P1 holds the live Row with Big (3) and Small (2). P2's Raider (5) attacks from base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 3, name: "Big" }, "big")
    .unit(P1, "row", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

/** Raider attacks; P1 opts in and declares Small as the target. */
async function declareSmall(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "row");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row", pendingChoiceType: "opt-in" }, timing: "FIN" });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "row" }, timing: "FIN" });
  await game.p1.pick("small");
  return game;
}

describe("Ruling 5fc85d37bf834743 — Reaver's Row targets the friendly unit as it goes on the chain", () => {
  test("the target is declared at the moment the ability is put on the chain: the chain item already names Small before anyone has priority, and nothing has moved", async () => {
    const game = await declareSmall();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, targets: ["small"], triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.locationOf("small")).toBe("row");
  });

  test("priority then passes to the opponent with the targeted item on the chain (this is where 'was it targeted?' already answers YES)", async () => {
    const game = await declareSmall();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2, source: { cardId: "row" } });
    expect(game.chain()[0]?.targets).toEqual(["small"]);
  });

  // RULING-CONFLICT: riftjudge 5fc85d37bf834743 says that when priority returns you "then decide whether to actually
  // return the unit or not" (the may exercised at RESOLUTION, target chosen but possibly not moved). CR 383.3.a /
  // 383.3.a.1 say a leading "you may" is the opt-in answered at FINALIZATION and is solely whether to perform the
  // ability; 383.3.a.2: declining removes the item (then nothing was targeted at all) — engine follows CR: once opted in
  // and targeted, resolution moves Small with no second question; the only way to "not return it" is to decline up
  // front, in which case no target is ever declared.
  test("CR 383.3.a (contra the ruling's resolution-time choice): opted in ⇒ Small IS moved on resolution with no further prompt; declined at finalization ⇒ no item, no target, nobody moves", async () => {
    const moved = await declareSmall();
    await moved.p1.passPriority();
    await moved.p2.passPriority();
    expect(moved.chain()).toEqual([]);
    expect(moved.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // no RES yes/no in between
    expect(moved.locationOf("small")).toBe("base");
    expect(moved.locationOf("big")).toBe("row");

    const declined = await board().build();
    await declined.p2.move("raider", "row");
    await declined.p1.no();
    expect(declined.chain()).toEqual([]); // removed — never targeted anything
    expect(declined.decision()?.kind).not.toBe("pick");
    expect(declined.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(declined.locationOf("small")).toBe("row");
    expect(declined.locationOf("big")).toBe("row");
    expect(declined.violations()).toEqual([]);
  });
});

/**
 * Ruling c8e33a421ee96691 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *   "When you defend here, you may move a friendly unit here to base."
 *
 * Q: When is the "may" decided — when the trigger goes on the chain or when it resolves? Can you target a unit to bait
 *    a reaction and then decline the move on resolution?
 * A (riftjudge): target when the trigger goes on the chain, decide the "may" on resolution (so yes, you can bait);
 *    you are asked on every defense.
 * Rules: 383.3.a/b + 402.2 (a leading "you may" is decided as the item is FINALIZED; declined ⇒ never a chain item;
 *        accepted ⇒ targets chosen then, effect mandatory on resolution), 383.4.f (defend triggers), 355.15.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";

/** P2's turn. P1 holds Reaver's Row (live text) with Big (5) and Small (2). P2: two Raiders (3) in base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 5, name: "Big" }, "big")
    .unit(P1, "row", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", { might: 3, name: "Raider 1" }, "raider1")
    .unit(P2, "base", { might: 3, name: "Raider 2" }, "raider2");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling c8e33a421ee96691 — Reaver's Row: when the 'may' and the target are decided", () => {
  // RULING-CONFLICT: riftjudge c8e33a421ee96691 says the target is chosen as the trigger goes on the chain but the "may"
  // (whether to move it) is decided on RESOLUTION, so a player can target a unit to bait Reactions and then not move it.
  // CR 383.3.a/383.3.b + 402.2 (leading "you may" on a triggered ability is answered as the Pending Item is finalized;
  // declined ⇒ the item is removed and never becomes a chain item; accepted ⇒ its target is chosen then and the
  // instruction is performed on resolution — 383.3.a.1, no second opt-out) say otherwise — engine follows CR
  // (`may-at-finalization`, abilities/optional-kind.ts; core spec core-rules/optional-instructions-timing.test.ts).
  test("the 'you may' is asked FIRST, at finalization (a P1 yes/no, timing FIN, sourced from the Row) — before any target and before anyone has priority", async () => {
    const game = await board().build();
    await game.p2.move("raider1", "row");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "row", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row", pendingChoiceType: "opt-in" }, timing: "FIN" });
    expect(game.chain().every((c) => c.cardId !== "row" || c.triggered)).toBe(true);
    expect(game.locationOf("small")).toBe("row");
  });

  test("accepting THEN asks the target (P1 pick over the friendly units here, timing FIN); the finalized item sits on the chain with that target and P2 gets a window to respond", async () => {
    const game = await board().build();
    await game.p2.move("raider1", "row");
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "row" }, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["big", "small"]);
    await game.p1.pick("small");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, targets: ["small"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // the "bait" window exists…
  });

  test("…but there is no second opt-out: on resolution nothing more is asked and the targeted Small IS moved to base (383.3.a.1) — Big stays and defends", async () => {
    const game = await board().build();
    await game.p2.move("raider1", "row");
    await game.p1.yes();
    await game.p1.pick("small");
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves
    expect(game.decision()?.kind).toBe("action"); // no yes/no, no pick at RES
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("base");
    expect(game.locationOf("big")).toBe("row");
    expect(showdown(game)?.active).toBe(true);
  });

  test("declining at finalization means no chain item and NO target at all (nothing to bait with); the combat just proceeds and both P1 units stay", async () => {
    const game = await board().build();
    await game.p2.move("raider1", "row");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle();
    expect(game.locationOf("small")).toBe("row");
    expect(game.locationOf("big")).toBe("row");
    expect(game.zoneOf("raider1")).toBe("trash"); // 3 into 5+2
  });

  test("the choice is made afresh on EVERY defense here: a second attack the same turn asks P1 the yes/no again", async () => {
    const game = await board().build();
    await game.p2.move("raider1", "row");
    await game.p1.no();
    await game.settle();
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    await game.p2.move("raider2", "row");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
    await game.p1.yes();
    await game.p1.pick("small");
    await game.settle();
    expect(game.locationOf("small")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});

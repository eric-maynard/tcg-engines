/**
 * Ruling 2accd023d78fc75c — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *   "When you defend here, you may move a friendly unit here to base."
 *
 * Q: When do you choose the target for Reaver's Row, and when do you decide whether to move it?
 * A (riftjudge): choose the target when the ability triggers; decide whether or not to move it when the ability resolves.
 * Rules: 383.3.a / 383.3.a.1 / 383.3.a.2 (a LEADING "you may" is decided during FINALIZATION and is solely whether to
 *        perform the ability; declined ⇒ removed), 402.2 (targets chosen at finalization), 383.4.f (defend trigger).
 * RULING-CONFLICT: riftjudge 2accd023d78fc75c puts the move-or-not decision at RESOLUTION; CR 383.3.a/.a.1 (and the
 *    Unleashed-era ruling 6d6f177ae63f7aba on this card) decide the "may" at finalization with the move then mandatory —
 *    engine follows CR (FIXER-PRIMER §2 `may-at-finalization`). The shared fact — the target IS chosen when the trigger
 *    is put on the chain, before anyone gets priority — is asserted as ruled.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";

/** P2's turn. P1 holds the live Row with Big (4) and Small (1); P2's Raider (3) attacks from base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 4, name: "Big" }, "big")
    .unit(P1, "row", { might: 1, name: "Small" }, "small")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

async function raiderAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "row");
  expect(game.state("small").combatRole).toBe("defender");
  return game;
}

describe("Ruling 2accd023d78fc75c — Reaver's Row: target chosen as it triggers; the 'may' per CR at finalization", () => {
  test("Step 1 as ruled: the target is chosen WHEN THE ABILITY TRIGGERS — P1 opts in (FIN) and is at once asked which friendly unit here (Big | Small), before any priority; the finalized item carries the target and nothing has moved", async () => {
    const game = await raiderAttacks();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "row" }, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["big", "small"]);
    await game.p1.pick("small");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", targets: ["small"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.locationOf("small")).toBe("row");
  });

  // RULING-CONFLICT: riftjudge 2accd023d78fc75c says "decide whether to move the targeted unit when the ability resolves";
  // CR 383.3.a.1 says the leading "you may" was the finalization opt-in and there is no second decision — engine follows CR.
  test("Step 2 per CR 383.3.a.1 (contra ruling): no 'move it?' question at resolution — both pass and Small is simply moved to base; Big stays and defends", async () => {
    const game = await raiderAttacks();
    await game.p1.yes();
    await game.p1.pick("small");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("base");
    expect(game.state("small").isExhausted).toBe(false); // an effect move, not a standard move
    expect(game.locationOf("big")).toBe("row");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the optional part IS a real choice — declining at finalization removes the item (383.3.a.2): no target asked, nobody moves, the showdown continues", async () => {
    const game = await raiderAttacks();
    await game.p1.no();
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("row");
    expect(game.locationOf("big")).toBe("row");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });
});

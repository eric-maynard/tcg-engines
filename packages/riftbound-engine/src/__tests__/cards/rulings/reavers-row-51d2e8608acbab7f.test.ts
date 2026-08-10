/**
 * Ruling 51d2e8608acbab7f — Reaver's Row (OGN-285 → ogn-285-298, Battlefield)
 *   "When you defend here, you may move a friendly unit here to base."
 *   × Discipline (ogn-058-298, [Reaction] [2]) "Give a unit +2 [Might] this turn. Draw 1." — the opponent's reaction
 *
 * Q: Can my opponent play a reaction before the Row's "when defending" retreat effect resolves, even with no other
 *    attack/defend effects around?
 * A: Yes. The Row trigger is a defend trigger placed on the (combat) chain when combat begins; both players may add
 *    Reactions before it resolves; items resolve top-down until the Row is topmost and both pass. Nuances: the unit to
 *    retreat is chosen when the trigger goes on the chain; (per the ruling) whether to move it is decided on resolution.
 * Rules: 383.4.f, 464.2.e (combat chain), 337–340 (finalize → priority round → resolve LIFO), 383.3.a (leading "you may"
 *        decided at finalization), 402.2 (targets chosen at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const DISCIPLINE = "ogn-058-298";

/** P2's turn. P1 holds the Row (live) with Big (3) and Small (2). P2: Raider (5) in base, Discipline + [2]. No other triggers anywhere. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "row", { might: 3, name: "Big" }, "big")
    .unit(P1, "row", { might: 2, name: "Small" }, "small")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P2, DISCIPLINE, "disc");
}

/** Raider attacks; P1 opts in and names Small → the Row trigger is finalized on the combat chain. */
async function rowTriggerFinalized(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "row");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row", pendingChoiceType: "opt-in" }, timing: "FIN" });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["big", "small"]);
  await game.p1.pick("small");
  return game;
}

describe("Ruling 51d2e8608acbab7f — reactions can be played on top of the Reaver's Row trigger before it resolves", () => {
  test("combat begins and the Row trigger goes on the chain automatically — the ONLY item — with its unit (Small) chosen as it was put there, nothing moved yet", async () => {
    const game = await rowTriggerFinalized();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, targets: ["small"], triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // Closed state: a priority round follows
    expect(game.locationOf("small")).toBe("row");
  });

  test("both players receive priority before it resolves; the attacker (P2) may put a Reaction (Discipline on the Raider) on top of the lone trigger", async () => {
    const game = await rowTriggerFinalized();
    // CR 337.4: the controller of the newest item (P1, the Row's controller) holds priority first; the ruling lists the
    // attacker first — either way both get a window before resolution, which is what is asserted here.
    const seats: string[] = [];
    if (game.actingSeat() === P1) {
      seats.push(P1);
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    seats.push(P2);
    expect(game.p2.can("cast", "disc")).toBe(true);
    await game.p2.cast("disc", { targets: "raider" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["row", "disc"]);
    expect(game.p2.energy()).toBe(0);
    expect(seats).toContain(P2);
  });

  test("LIFO: the topmost item (Discipline) resolves first — Raider 5 → 7, P2 draws — while the Row trigger is still on the chain; then, both passing, the Row resolves and Small retreats", async () => {
    const game = await rowTriggerFinalized();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("disc", { targets: "raider" });
    const hand = game.p2.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority(); // Discipline resolves
    expect(game.state("raider").might).toBe(7);
    expect(game.p2.hand()).toHaveLength(hand + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["row"]);
    expect(game.locationOf("small")).toBe("row");
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("base");
    expect(game.locationOf("big")).toBe("row");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "row" });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — the retreat is opted into at FINALIZATION; on resolution the chosen unit just moves, no second 'move it?' question is asked", async () => {
    // RULING-CONFLICT: riftjudge 51d2e8608acbab7f says "you decide whether to actually move the chosen unit when the trigger
    // resolves"; CR 383.3.a / 383.3.a.1 say a leading "you may" is decided solely at finalization (declined ⇒ removed,
    // 383.3.a.2) and the effect is then performed — engine follows CR.
    const game = await rowTriggerFinalized();
    let askedAgain = false;
    while (game.chain().length > 0) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        askedAgain = true;
        break;
      }
      if (d?.kind !== "action") {
        break;
      }
      await game.acting().passPriority();
    }
    expect(askedAgain).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("base");
    // And declining up front removes the trigger entirely: nothing on the chain, nobody retreats.
    const declined = await board().build();
    await declined.p2.move("raider", "row");
    await declined.p1.no();
    expect(declined.chain()).toEqual([]);
    expect(declined.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(declined.p1.units("row").sort()).toEqual(["big", "small"]);
  });
});

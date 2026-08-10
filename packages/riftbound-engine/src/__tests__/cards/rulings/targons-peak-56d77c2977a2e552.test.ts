/**
 * Ruling 56d77c2977a2e552 — Targon's Peak (OGN-289 → ogn-289-298) · Battlefield
 *     "When you conquer here, ready up to 2 runes at the end of this turn."
 *
 * Q: Does conquering Targon's Peak several times in one turn ready 2 runes each time?
 * A: No. Each battlefield can be scored by you only once per turn; if you already scored it (e.g. held it at the start of
 *    your turn), taking control of it again that turn is not a Conquer, so no conquer trigger. Nuance: on the OPPONENT's
 *    turn you have not scored anything yet, so gaining control there then IS a conquer (point + trigger).
 * Rules: 469.1 (Conquer = gain control of a battlefield you did not yet score this turn), 469.2 (Hold), 471.2.c, 383.4.c.2.a
 *        (conquer abilities fire only when the battlefield is Scored).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TARGONS_PEAK = "ogn-289-298";

/** "[Reaction] Move a friendly unit to a battlefield." — lets P1 arrive on P2's turn. */
const FLANK = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, to: { battlefield: "any" }, type: "move" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Flank (inline Reaction: move a friendly unit to a battlefield)",
  timing: "reaction",
} as const;
/** "Recall a friendly unit." */
const RETREAT = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "recall" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Retreat (inline: recall a friendly unit)",
  timing: "action",
} as const;

describe("Ruling 56d77c2977a2e552 — once you've scored the Peak this turn, re-taking it is not a Conquer: no second trigger", () => {
  test("P1 HOLDS the Peak at turn start (1 point, Peak marked scored), walks the holder home (control lapses), then moves a fresh unit in: showdown, control regained — but NO point, NO Peak trigger, and no rune prompt at end of turn", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("peak", { controller: P1, def: TARGONS_PEAK, inert: false })
      .battlefield("bf2", { controller: P2 })
      .runes(P1, "fury", 3, { exhausted: true })
      .unit(P1, "peak", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 3, name: "Reserve" }, "reserve")
      .unit(P2, "bf2", { might: 2, name: "Theirs" }, "theirs")
      .hand(P1, RETREAT, "retreat")
      .fillDecks({ main: 10, runes: 0 })
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["peak"]);
    expect(game.chain()).toEqual([]); // holding is not conquering: no Peak item

    await game.p1.cast("retreat", { targets: "holder" });
    await game.settle();
    expect(game.locationOf("holder")).toBe("base");
    expect(game.gameState.battlefields.peak?.controller).toBeNull(); // lapsed in the open cleanup

    await game.p1.move("reserve", "peak");
    expect(game.gameState.battlefields.peak).toMatchObject({ contested: true, contestedBy: P1 });
    await game.settle(); // both pass focus → showdown closes
    expect(game.gameState.battlefields.peak).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1); // no second score
    expect(game.chain()).toEqual([]); // no "when you conquer here"
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });

    await game.p1.tapRunes(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    await game.p1.endTurn();
    expect(game.decision()?.kind === "pick" && game.decision()?.seat === P1).toBe(false); // no "ready up to 2 runes" question
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: a genuine first conquer of the Peak DOES trigger it — chain item under P1, and at end of turn P1 is asked which (up to 2) runes to ready", async () => {
    const game = await scenario()
      .battlefield("peak", { controller: null, def: TARGONS_PEAK, inert: false })
      .battlefield("bf2", { controller: P2 })
      .runes(P1, "fury", 3, { exhausted: true })
      .unit(P1, "base", { might: 3, name: "Climber" }, "climber")
      .unit(P2, "bf2", { might: 2, name: "Theirs" }, "theirs")
      .build();
    await game.p1.move("climber", "peak");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "peak", controller: P1, triggered: true })]);
    await game.settle();
    await game.p1.endTurn();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const runes = (game.decision() as { options: { key: string }[] }).options.map((o) => o.key);
    await game.p1.pick(runes[0]!, runes[1]!);
    await game.settle();
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });

  test("nuance: on the OPPONENT's turn P1 has scored nothing yet — P1's unit Flanks onto the (now empty) Peak during P2's turn, wins the showdown and CONQUERS: +1 point and the Peak's trigger fires for P1", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("peak", { controller: P2, def: TARGONS_PEAK, inert: false })
      .unit(P2, "peak", { might: 2, name: "Squatter" }, "squatter")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P2, RETREAT, "retreat")
      .hand(P1, FLANK, "flank")
      .build();
    expect(game.gameState.scoredThisTurn[P1] ?? []).toEqual([]);
    // P2 recalls its Squatter; in response P1 Flanks the Raider onto the Peak.
    await game.p2.cast("retreat", { targets: "squatter" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("flank", { targets: "raider" });
    await game.settle(); // Flank (Raider → Peak), then Retreat (Squatter → base); cleanup: P2's control lapses, P1 contests
    expect(game.locationOf("raider")).toBe("peak");
    expect(game.locationOf("squatter")).toBe("base");
    expect(game.gameState.battlefields.peak).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    if (game.p2.can("startShowdown")) {
      await game.p2.choose("startShowdown:peak");
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.acting().passFocus();
    await game.acting().passFocus(); // non-combat showdown closes → P1 establishes control = Conquer
    expect(game.gameState.battlefields.peak).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1); // conquered on P2's turn
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["peak"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "peak", controller: P1, triggered: true })]);
    await game.settle();
    const delayed = (game.gameState as { playerDelayedTriggers?: { playerId: string; sourceCardId: string }[] }).playerDelayedTriggers ?? [];
    expect(delayed).toEqual([expect.objectContaining({ playerId: P1, sourceCardId: "peak" })]); // "ready up to 2 runes at end of turn" armed for P1
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});

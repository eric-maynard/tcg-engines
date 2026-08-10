/**
 * Ruling 464e47c3020df83b — Gust (OGN-169 → ogn-169-298) · Spell · Chaos · 1 · [Reaction]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Sona, Harmonious (OGN-073 → ogn-073-298) 4 Might "At the end of your turn, if I'm at a battlefield, ready up to
 *     4 friendly runes." (the contrasting end-of-turn trigger)
 *
 * Q: Can the opponent play a Reaction (Gust) during my turn if I only play trigger-less units and pass the turn?
 * A: No. Reactions need priority, which exists only on a chain or in a showdown. Playing a plain unit and ending the
 *    turn with no end-of-turn triggers opens no window. If a unit like Sona triggered at end of turn, THAT chain
 *    would give the opponent a window.
 * Rules: 330–336 (priority only while a chain exists / showdown), 337.2 (permanents resolve immediately), 383.3.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const SONA = "ogn-073-298";
const GRUNT = { cardType: "unit", energyCost: 2, might: 2, name: "Grunt" } as const;

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Small" }, "small") // a legal Gust target, were Gust ever castable
    .hand(P1, GRUNT, "grunt")
    .hand(P2, GUST, "gust");
}

describe("Ruling 464e47c3020df83b — no chain, no showdown ⇒ no Reaction window for the opponent", () => {
  test("P1 plays a trigger-less unit: it resolves at once with no chain and P2 is never given priority; P1 ends the turn with no end-of-turn triggers and the turn passes straight to P2 — Gust was never castable during P1's turn", async () => {
    const game = await board().build();
    let p2WindowsOnP1Turn = 0;
    const observe = () => {
      const d = game.decision();
      if (game.turnPlayer() === P1 && d?.seat === P2 && d.kind === "action") {
        p2WindowsOnP1Turn += game.p2.can("cast", "gust") ? 1 : 0;
      }
    };
    await game.p1.play("grunt", { to: "base" });
    observe();
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.endTurn();
    observe();
    // Step whatever remains of P1's turn one decision at a time, watching for any P2 window.
    for (let i = 0; i < 10 && game.turnPlayer() === P1; i++) {
      const d = game.decision();
      if (!d || d.kind !== "action") break;
      observe();
      await game.seat(d.seat).pass();
    }
    await game.settle();
    expect(p2WindowsOnP1Turn).toBe(0);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("gust")).toBe("hand");
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
  });

  test("contrast: with Sona at a battlefield, P1's end of turn puts her trigger on the chain — P2 gets priority there and CAN Gust", async () => {
    const game = await board().unit(P1, "bf1", SONA, "sona").rune(P1, "calm", { exhausted: true }).build();
    await game.p1.play("grunt", { to: "base" });
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sona", controller: P1, triggered: true })]);
    for (let i = 0; i < 6 && game.actingSeat() !== P2; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.p1.answer({ keys: [d.options[0]!.key], kind: "pick" });
      } else if (d?.kind === "yes-no") {
        await game.p1.yes();
      } else {
        await game.p1.passPriority();
      }
    }
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "small" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sona", "gust"]);
    await game.settle();
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});

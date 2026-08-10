/**
 * Ruling 24ab21df68d6d152 — Teemo, Strategist (OGN-121 → ogn-121-298) · Champion Unit · Mind · 2 · [Hidden]
 *     "When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that unit for each
 *      card with [Hidden] revealed this way, then recycle the revealed cards."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield "When you defend here, you may move a friendly unit here to base."
 *
 * Q: Teemo's "When I defend" and Reaver's Row's "When you defend here" both trigger — which goes first / resolves first?
 * A: If Teemo is already face up there, both trigger at the same time and their owner CHOOSES the order they go on the
 *    chain (and so the resolution order). If Teemo is Hidden there: Reaver's Row triggers and goes on the chain; in that
 *    window the player may react by playing Teemo from Hidden; Teemo's defend trigger is added to the existing chain above
 *    Reaver's Row and therefore resolves BEFORE it.
 * Rules: 383.3.d (controller orders simultaneous triggers), 811 (play from Hidden as a Reaction), 383.4.f / 464.2.c.3
 *        (a unit arriving mid-combat gains Defender and its defend trigger fires), 336 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO = "ogn-121-298";
const REAVERS_ROW = "ogn-285-298";
const SKULKER = "ogn-175-298"; // vanilla, no [Hidden]

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** P1's deck top 5: exactly one [Hidden] card (a Teemo) → Teemo's trigger deals exactly 1. */
const DECK = [TEEMO, SKULKER, SKULKER, SKULKER, SKULKER];

describe("Ruling 24ab21df68d6d152 — Teemo's defend trigger vs Reaver's Row's defend trigger", () => {
  test("Teemo already face up at Reaver's Row: when the Raider attacks, BOTH P1 triggers hit the chain together and P1 is asked to ORDER them (order decision, seat P1)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
      .unit(P1, "row", TEEMO, "teemo")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .deck(P1, DECK)
      .build();
    await game.p2.move("raider", "row");
    expect(game.state("teemo").combatRole).toBe("defender");
    // Reaver's Row is optional — opt in so both triggers are live.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("teemo"); // Row's "a friendly unit here" (only Teemo) if asked now
    }
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const items = d?.kind === "order" ? d.items : [];
    expect(items.map((i) => i.card).sort()).toEqual(["row", "teemo"]);
    expect(new Set(chainIds(game))).toEqual(new Set(["teemo", "row"]));
    expect(game.chain().every((c) => c.controller === P1 && c.triggered)).toBe(true);
    // P1 picks: Row at the bottom, Teemo on top → Teemo resolves first.
    const key = (card: string) => items.find((i) => i.card === card)?.key as string;
    await game.p1.order([key("row"), key("teemo")]);
    expect(chainIds(game)).toEqual(["row", "teemo"]);
    // Resolve the top item only: Teemo's 1 damage lands while Row is still pending.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("raider").damage).toBe(1);
    expect(chainIds(game)).toEqual(["row"]);
  });

  test("…and the other order is equally available: Teemo at the bottom, Row on top → Row resolves first (Teemo goes home before his own trigger resolves)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
      .unit(P1, "row", TEEMO, "teemo")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .deck(P1, DECK)
      .build();
    await game.p2.move("raider", "row");
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("teemo");
    }
    const d = game.decision();
    expect(d?.kind).toBe("order");
    const items = d?.kind === "order" ? d.items : [];
    const key = (card: string) => items.find((i) => i.card === card)?.key as string;
    await game.p1.order([key("teemo"), key("row")]);
    expect(chainIds(game)).toEqual(["teemo", "row"]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("teemo");
    }
    expect(game.locationOf("teemo")).toBe("base"); // Row resolved first
    expect(chainIds(game)).toEqual(["teemo"]);
    expect(game.state("raider").damage).toBe(0); // Teemo's trigger has not resolved yet
  });

  test("Teemo HIDDEN at Reaver's Row (a Guard defends): Row's trigger goes on the chain first; P1 reacts by playing Teemo from Hidden; his defend trigger is added ABOVE Row's and resolves BEFORE it", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
      .unit(P1, "row", { might: 2, name: "Guard" }, "guard")
      .facedown(P1, "row", TEEMO, "teemo")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .deck(P1, DECK)
      .build();
    await game.p2.move("raider", "row");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes(); // keep Row's trigger
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("guard");
    }
    expect(chainIds(game)).toEqual(["row"]); // the Initial Chain: only Row (Teemo is not a unit yet)
    expect(game.zoneOf("teemo")).toBe("facedown-row");
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    // The priority window created by Row's trigger is where the Hidden Teemo can be played.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "teemo")).toBe(true);
    await game.p1.reveal("teemo");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("raider");
    }
    expect(game.zoneOf("teemo")).toBe("battlefield-row");
    expect(game.state("teemo").combatRole).toBe("defender");
    expect(chainIds(game)).toEqual(["row", "teemo"]); // Teemo's trigger on top of the existing chain
    // LIFO: Teemo's trigger resolves first (1 [Hidden] card in the top 5 → 1 to the Raider) while Row is still pending…
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("raider").damage).toBe(1);
    expect(chainIds(game)).toEqual(["row"]);
    expect(game.locationOf("guard")).toBe("row");
    // …then Row resolves (the Guard goes home).
    await game.acting().passPriority();
    await game.acting().passPriority();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("guard");
    }
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("guard")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});

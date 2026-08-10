/**
 * Ruling 57c76349e769fb6e — (filed under Loose Cannon OGN-251 → ogn-251-298, the Jinx Legend: "At the start of your Beginning
 *   Phase, if you have 1 or fewer cards in hand, draw 1" — a CONDITIONAL trigger, like Gutter Palace unl-088-219 / Sona ogn-073-298)
 *   × Warwick, Hunter (OGN-159 → ogn-159-298) · 5 Might · "I enter ready. When I attack, kill all damaged enemy units here."
 *   × Flurry of Blades (OGN-133 → ogn-133-298) · Reaction · [1] "Deal 1 to all units at battlefields."
 *
 * Q: Conditional triggers (Jinx Legend, Gutter Palace) only go on the chain if their condition holds. Does Warwick's "When I
 *    attack" ALWAYS create a chain item, even with no damaged unit at the battlefield he attacks?
 * A: Yes. His condition is just "When I attack" — no "if …" rider — so the ability triggers and goes on the chain whenever he
 *    becomes an attacker; "damaged enemy units here" is only evaluated on resolution (none → it does nothing). That window is
 *    what lets you Flurry of Blades in response so that, LIFO, the units are damaged by the time Warwick's ability resolves.
 * Rules: 383.4.e (attack triggers), 383.2 (an "if" condition is checked to trigger at all — contrast Loose Cannon), 336/340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK = "ogn-159-298";
const FLURRY_OF_BLADES = "ogn-133-298";
const LOOSE_CANNON = "ogn-251-298";

/** P1's turn with [1] and Flurry. P2 holds bf1 with two UNDAMAGED 3-Might units. Warwick ready in P1's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", WARWICK, "ww")
    .unit(P2, "bf1", { might: 3, name: "Enemy One" }, "e1")
    .unit(P2, "bf1", { might: 3, name: "Enemy Two" }, "e2")
    .hand(P1, FLURRY_OF_BLADES, "flurry");
}

const ids = (game: Game) => game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);

describe("Ruling 57c76349e769fb6e — Warwick's 'When I attack' always goes on the chain; damaged units are checked only on resolution", () => {
  test("Warwick attacks a battlefield with NO damaged unit: his ability still triggers — it is a chain item and a priority window opens", async () => {
    const game = await board().build();
    expect(game.state("e1").damage + game.state("e2").damage).toBe(0);
    await game.p1.move("ww", "bf1");
    expect(game.state("ww").combatRole).toBe("attacker");
    expect(ids(game)).toEqual(["ww*"]);
    expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("left alone it resolves and simply does nothing (no damaged enemy here at resolution) — both units untouched, combat proceeds", async () => {
    const game = await board().build();
    await game.p1.move("ww", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("e1")).toBe("battlefield-bf1");
    expect(game.zoneOf("e2")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("the strategic point: with the trigger on the chain P1 responds with Flurry of Blades; Flurry resolves first (1 to everything at battlefields), THEN Warwick's ability resolves and kills both now-damaged units", async () => {
    const game = await board().build();
    await game.p1.move("ww", "bf1");
    expect(game.p1.can("cast", "flurry")).toBe(true);
    await game.p1.cast("flurry");
    expect(ids(game)).toEqual(["ww*", "flurry"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Flurry
    expect(game.state("e1")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("e2")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("ww").damage).toBe(1);
    expect(ids(game)).toEqual(["ww*"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Warwick's ability
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.zoneOf("e2")).toBe("trash");
    await game.settle();
    expect(game.locationOf("ww")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast (a genuinely conditional trigger): Loose Cannon's 'if you have 1 or fewer cards in hand' is checked up front — with a 3-card hand nothing is drawn beyond the normal draw, with an empty hand it draws the extra card", async () => {
    const full = await scenario()
      .turn(3)
      .active(P2)
      .legend(P1, LOOSE_CANNON, "jinx")
      .hand(P1, { might: 1, name: "A" }, "a")
      .hand(P1, { might: 1, name: "B" }, "b")
      .hand(P1, { might: 1, name: "C" }, "c")
      .build();
    await full.advanceTurn();
    expect(full.turnPlayer()).toBe(P1);
    expect(full.p1.hand()).toHaveLength(3 + 1); // just the Draw Phase card

    const empty = await scenario().turn(3).active(P2).legend(P1, LOOSE_CANNON, "jinx").build();
    expect(empty.p1.hand()).toHaveLength(0);
    await empty.advanceTurn();
    expect(empty.turnPlayer()).toBe(P1);
    expect(empty.p1.hand()).toHaveLength(0 + 1 + 1); // Loose Cannon's draw + the Draw Phase card
  });
});

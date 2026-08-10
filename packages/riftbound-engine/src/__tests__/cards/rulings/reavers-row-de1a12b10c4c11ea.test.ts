/**
 * Ruling de1a12b10c4c11ea — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *   "When you defend here, you may move a friendly unit here to base."
 *   × Wuju Bladesman (Yi legend, ogs-019-024) "While a friendly unit defends alone, it gets +2 [Might]."
 *   × Ride the Wind (ogn-173-298) · Action · [2][chaos] "Move a friendly unit and ready it." — to move a unit IN mid-combat.
 *
 * Q: How does Yi interact with Reaver's Row when units move in or out?
 * A: Yi's bonus is live exactly while you have ONE (defending) unit at the Row. Two defenders → use the Row to send one
 *    home → the remaining one is alone → +2. Conversely a lone defender (+2) loses it as soon as another friendly unit
 *    moves in.
 * Rules: 364.3 (a "while" static is continuously re-evaluated), 383.4.f (defend trigger), 323.2.a (a unit arriving at the
 *        combat battlefield gains its controller's designation).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const WUJU_BLADESMAN = "ogs-019-024";
const RIDE_THE_WIND = "ogn-173-298";

/** P2's turn. P1 (Yi legend) holds the Row (live text). P2's 4-Might Raider attacks from base. */
function base() {
  return scenario()
    .active(P2)
    .legend(P1, WUJU_BLADESMAN, "yi")
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Their Holder" }, "th")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

describe("Ruling de1a12b10c4c11ea — Yi's 'defends alone' bonus follows the unit count at Reaver's Row as units move out or in", () => {
  test("moving OUT: two defenders (Big 3, Small 2) → no Yi bonus; P1 accepts the Row's trigger (a 'may': yes/no, then which unit) and sends Small to base → Big now defends ALONE at 3 + 2 = 5", async () => {
    const game = await base().unit(P1, "row", { might: 3, name: "Big" }, "big").unit(P1, "row", { might: 2, name: "Small" }, "small").build();
    await game.p2.move("raider", "row");
    // both are defenders, neither is alone
    expect(game.state("big")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("small")).toMatchObject({ combatRole: "defender", might: 2 });
    // Reaver's Row: optional defend trigger for P1 — surfaced as P1's decisions
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["big", "small"]);
    await game.p1.pick("small");
    // resolve the Row's item (initial chain)
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const cur = game.decision();
      if (cur?.kind !== "action" || !cur.passKey) break;
      await game.seat(cur.seat).pass();
    }
    expect(game.locationOf("small")).toBe("base");
    expect(game.state("small").combatRole).toBe(null);
    expect(game.state("big")).toMatchObject({ combatRole: "defender", might: 5 }); // Yi switched ON
    // and it decides the fight: 5 kills the 4-Might Raider, Big survives 4 < 5, P1 keeps the Row
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-row");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.state("big").might).toBe(3); // no longer defending → bonus off again
    expect(game.violations()).toEqual([]);
  });

  test("moving IN: a lone defender Big (3 + 2 = 5) loses Yi's bonus the moment P1 Rides the Wind a second friendly unit (Pal) into the Row — Big back to 3, Pal a plain 2", async () => {
    const game = await base()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .unit(P1, "row", { might: 3, name: "Big" }, "big")
      .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
      .hand(P1, RIDE_THE_WIND, "ride")
      .build();
    await game.p2.move("raider", "row");
    // decline the Row's own trigger this time
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.state("big")).toMatchObject({ combatRole: "defender", might: 5 }); // alone → +2
    // attacker has Focus first; then P1 may play an Action
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("ride", { answers: ["row"], targets: "pal" });
    for (let i = 0; i < 6 && (game.chain().length > 0 || game.decision()?.kind === "pick"); i++) {
      const cur = game.decision();
      if (cur?.kind === "pick" && cur.seat === P1) {
        await game.p1.pick(cur.options.find((o) => o.key.includes("row"))?.key ?? (cur.options[0]?.key as string));
      } else if (cur?.kind === "action" && cur.passKey) {
        await game.seat(cur.seat).pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.locationOf("pal")).toBe("row");
    expect(game.state("pal")).toMatchObject({ combatRole: "defender", isReady: true, might: 2 });
    expect(game.state("big")).toMatchObject({ combatRole: "defender", might: 3 }); // Yi switched OFF: not alone any more
    expect(game.violations()).toEqual([]);
  });

  test("baseline: exactly one unit defending at the Row and nothing moves — Yi's +2 holds for the whole combat (3+2 = 5 beats the 4-Might Raider)", async () => {
    const game = await base().unit(P1, "row", { might: 3, name: "Big" }, "big").build();
    await game.p2.move("raider", "row");
    await game.p1.no();
    expect(game.state("big").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-row");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
  });
});

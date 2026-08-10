/**
 * Ruling b0729eff27820fcc — Abandoned Hall (UNL-205 → unl-205-219, battlefield) "When a player plays a spell, they may give a unit
 *     they control here +1 [Might] this turn."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] · [2][chaos] · "Move a friendly unit and ready it."
 *
 * Q: When does Abandoned Hall activate — if I Ride the Wind a unit TO the Hall, do I get the +1?
 * A: The Hall triggers after the spell has COMPLETED its resolution, not when it is placed on the chain. Sequence: play RTW
 *    (target chosen, on the chain) → both players may react → RTW resolves (unit moved to the Hall, readied) → trigger condition
 *    met → Hall trigger placed on the chain → it resolves: the moved unit is at the Hall and may take the +1 (it is +1, not more).
 * Rules: 419.4.a, 383.2.c, 336–340 (reaction window while the spell is on the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ABANDONED_HALL = "unl-205-219";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn, [2][chaos]. The Hall is uncontrolled and EMPTY (bf2 is P2's with a Guard). P1's Scout (2) waits in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("hall", { controller: null, def: ABANDONED_HALL, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

const hallOnChain = (game: Game) => game.chain().some((c) => c.cardId === "hall" && c.triggered);

describe("Ruling b0729eff27820fcc — Abandoned Hall triggers after the spell resolves; the unit Ridden there gets +1", () => {
  test("steps 1–2: RTW is played (Scout → Hall chosen) and sits on the chain; the Hall has NOT triggered; P2 gets a reaction window", async () => {
    const game = await board().build();
    await game.p1.cast("rtw", { targets: "scout" });
    await game.p1.pick("battlefield-hall");
    expect(game.chain().map((c) => c.cardId)).toEqual(["rtw"]);
    expect(hallOnChain(game)).toBe(false);
    expect(game.locationOf("scout")).toBe("base"); // nothing has moved yet
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // step 2: opponent may react
    expect(hallOnChain(game)).toBe(false);
  });

  test("steps 3–5: RTW resolves (Scout at the Hall, ready, spell trashed) → THEN the Hall trigger is placed on the chain, controlled by P1 (the player who played the spell)", async () => {
    const game = await board().build();
    await game.p1.cast("rtw", { targets: "scout" });
    await game.p1.pick("battlefield-hall");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.state("scout")).toMatchObject({ isReady: true, location: "hall" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hall", controller: P1, triggered: true })]);
  });

  test("step 6: resolving the trigger — P1 may (yes) give the Scout, now 'a unit they control here', exactly +1 this turn (2 → 3); then the staged showdown at the empty Hall hands P1 control", async () => {
    const game = await board().build();
    await game.p1.cast("rtw", { targets: "scout" });
    await game.p1.pick("battlefield-hall");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["scout"]);
      await game.p1.pick("scout");
    }
    await game.settle();
    expect(game.state("scout")).toMatchObject({ location: "hall", might: 3, mightModifier: 1 });
    await game.settle(); // pass focus through the non-combat showdown at the Hall
    expect(game.gameState.battlefields.hall?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

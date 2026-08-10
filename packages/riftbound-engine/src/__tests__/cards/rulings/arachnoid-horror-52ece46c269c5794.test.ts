/**
 * Ruling 52ece46c269c5794 — Arachnoid Horror (UNL-117 → unl-117-219) · 6 Might · "[Hunt 2] … Friendly units can be played to
 *   an occupied battlefield if an enemy unit is alone there."
 *   × Nidalee, Cat Form (UNL-114 → unl-114-219) · 4 Might · "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)"
 *
 * Q: With Arachnoid Horror in my BASE, can I Ambush Nidalee in as a reaction when the enemy moves onto an open battlefield?
 * A: No. Ambush only lets you play to a battlefield where you already control units; the Horror is in base, so you have no
 *    unit at that battlefield and the Reaction-timed play is unavailable there.
 * Rules: 822.1.b (Ambush: as a Reaction, to a battlefield where you have units), 340 (showdown timing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ARACHNOID_HORROR = "unl-117-219";
const NIDALEE_CAT_FORM = "unl-114-219";

/**
 * P2's turn. bf1 is open (uncontrolled, empty). P1: Arachnoid Horror in BASE, Nidalee in hand with exactly [3][body].
 * P2's Raider (3) walks onto bf1. Optionally P1 already has a 1-might Scout at bf1 (the contrast case).
 */
function board(opts: { scoutAtBf1?: boolean } = {}) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 3, power: { body: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", ARACHNOID_HORROR, "horror")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, NIDALEE_CAT_FORM, "nidalee");
  return opts.scoutAtBf1 ? s.unit(P1, "bf1", { might: 1, name: "Scout" }, "scout") : s;
}

describe("Ruling 52ece46c269c5794 — a Horror in base does not satisfy Ambush's 'where you have units'", () => {
  test("enemy moves onto the open bf1; in the showdown P1 has NO way to play Nidalee there (Horror is in base, P1 has no unit at bf1)", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.locationOf("horror")).toBe("base");
    expect(game.p1.can("play", "nidalee")).toBe(false);
    const r = await game.p1.try((p) => p.play("nidalee", { to: "bf1" }));
    expect(r.ok).toBe(false);
    // The showdown just ends with P2 conquering the empty battlefield.
    await game.settle();
    expect(game.zoneOf("nidalee")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 1 } });
  });

  test("contrast — with a friendly unit actually AT bf1, Ambush does allow Nidalee to be played there at Reaction speed during the showdown (and only there)", async () => {
    const game = await board({ scoutAtBf1: true }).build();
    await game.p2.move("raider", "bf1");
    await game.p2.pass();
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    expect(game.p1.can("play", "nidalee")).toBe(true);
    const to = game.p1.option("playUnit", "nidalee")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(to).toEqual(["battlefield-bf1"]); // not base, not anywhere P1 lacks units
    await game.p1.play("nidalee", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.locationOf("nidalee")).toBe("bf1");
  });
});

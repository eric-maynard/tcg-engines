/**
 * Ruling 1181b2eb517d3f88 — Soul Harvest (UNL-159 → unl-159-219) · Spell · Order · [2][order]
 *   "Kill a unit at a battlefield with 3 [Might] or less."
 *   × Nidalee, Cat Form (unl-114-219) · 4 Might · "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)"
 *
 * Q: I Soul Harvest an enemy unit at a battlefield where I have no units — can my opponent Ambush a unit onto that
 *    battlefield in response?
 * A: Yes. Soul Harvest on the chain is a Closed State; the opponent still controls a unit there, so Ambush grants the
 *    Reaction-timed play to that battlefield. The Ambush unit enters play, then Soul Harvest resolves and kills its
 *    target; the Ambush unit remains, so the opponent keeps presence (and control) there. If they wait until after
 *    Soul Harvest resolves and the unit is dead, Ambush no longer applies (no units there).
 * Rules: 822.1.b (Ambush permission + Reaction), 822.3 (no units there ⇒ not a valid location), 336/343 (closed state).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SOUL_HARVEST = "unl-159-219";
const NIDALEE = "unl-114-219";

/** P1's turn with exactly [2][order]. P2 holds bf1 with a lone Scout (3); P2 has Nidalee in hand and [3][body]. P1 has no unit at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 3, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Scout" }, "scout")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
    .hand(P1, SOUL_HARVEST, "harvest")
    .hand(P2, NIDALEE, "nidalee");
}

describe("Ruling 1181b2eb517d3f88 — the opponent may Ambush a unit onto the battlefield in response to Soul Harvest", () => {
  test("Soul Harvest on the chain targeting the Scout: once P1 passes priority, P2 CAN play Nidalee (Ambush ⇒ Reaction) — and only to bf1, where P2 still has the Scout", async () => {
    const game = await board().build();
    expect(game.p2.can("play", "nidalee")).toBe(false); // P1's open state: nothing for P2 to do yet
    await game.p1.cast("harvest", { targets: "scout" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "harvest", controller: P1, targets: ["scout"] })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("play", "nidalee")).toBe(true);
    const to = game.p2.option("playUnit", "nidalee")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(to).toEqual(["battlefield-bf1"]);
  });

  test("Nidalee enters bf1 first (LIFO), then Soul Harvest resolves and kills the Scout — Nidalee stays, so P2 keeps presence and control of bf1", async () => {
    const game = await board().build();
    await game.p1.cast("harvest", { targets: "scout" });
    await game.p1.passPriority();
    await game.p2.play("nidalee", { to: "bf1" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("harvest")).toBe("trash");
    expect(game.locationOf("nidalee")).toBe("bf1");
    expect(game.p2.units("bf1")).toEqual(["nidalee"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the catch: if P2 lets Soul Harvest resolve first, the Scout is dead, P2 has no unit at bf1 and Ambush no longer permits the play (822.3) — control of the empty battlefield lapses", async () => {
    const game = await board().build();
    await game.p1.cast("harvest", { targets: "scout" });
    await game.settle(); // both pass; it resolves
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p2.can("play", "nidalee")).toBe(false);
    const r = await game.p2.try((p) => p.play("nidalee", { to: "bf1" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("nidalee")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
  });
});

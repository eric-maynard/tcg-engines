/**
 * Ruling 27e882281e19a681 — Bullet Time (OGN-268 → ogn-268-298) · Body/Chaos · [1] · [Action]
 *   "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *
 * Q: Does the caster have to recycle the runes (pay the Power) before I get to react?
 * A: No. Playing it costs only [1]; the Power is paid as the spell RESOLVES. The opponent's reaction window
 *    comes while Bullet Time is on the chain, i.e. before any Power is committed — they decide blind. Once
 *    both pass and it starts resolving there is no further window.
 * Rules: 204.3.b (an X paid on resolution is not a play cost), 135.2.e, 419.2 (priority windows on the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BULLET_TIME = "ogn-268-298";
const SMOKE_SCREEN = "ogn-093-298"; // [2][mind] Reaction — the opponent's blind answer

/** P1's turn with [1] Energy and 3 spare Power. P2 holds bf1 with two units and a Reaction in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 3 } })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "bf1", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "base", { might: 2, name: "Reserve" }, "reserve")
    .hand(P1, BULLET_TIME, "bt")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

/** Cast Bullet Time and take it to the point where P2 holds priority. */
async function castAndPass(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bt");
  await game.p1.passPriority();
  return game;
}

describe("Ruling 27e882281e19a681 — Bullet Time's Power is paid on RESOLUTION, after the opponent's blind reaction window", () => {
  test("playing it asks for no X and costs only [1]: the 3 Power is still in the pool while it sits on the chain", async () => {
    const game = await board().build();
    const fields = game.p1.option("cast", "bt")?.fields ?? [];
    expect(fields.some((f) => f.arg === "x" || f.name === "xAmount")).toBe(false);
    await game.p1.cast("bt");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 3 } }); // nothing recycled yet
    expect(game.chain().map((c) => c.cardId)).toEqual(["bt"]);
  });

  test("ruling: the opponent reacts FIRST — P2 holds priority with Bullet Time unpaid and can still play their Reaction", async () => {
    const game = await castAndPass();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "smoke")).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 3 } }); // they decide blind
  });

  test("…only once P2 passes is P1 asked how much Power to pay, and that ask belongs to the resolution", async () => {
    const game = await castAndPass();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "integer", seat: P1 });
    expect(d?.kind === "integer" ? d.max : -1).toBe(3); // capped by the pool
  });

  test("…and after the payment the damage lands with no further window: P2 never gets priority again", async () => {
    const game = await castAndPass();
    await game.p2.passPriority();
    await game.p1.answer(2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } }); // 2 recycled on resolution
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(2);
    expect(game.zoneOf("squire")).toBe("trash"); // 2 ≥ 2
    expect(game.state("reserve").damage).toBe(0); // not at a battlefield
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the blind reaction really can change the outcome: P2 Smoke Screens the Guard before P1 has committed anything", async () => {
    const game = await castAndPass();
    await game.p2.cast("smoke", { targets: "guard" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bt", "smoke"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Smoke Screen resolves
    expect(game.state("guard").might).toBe(1); // 3 − 4, floored at 1
    await game.settle({ maxSteps: 4 });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "integer", seat: P1 });
    await game.p1.answer(1);
    expect(game.zoneOf("guard")).toBe("trash"); // 1 damage is now lethal
    expect(game.violations()).toEqual([]);
  });
});

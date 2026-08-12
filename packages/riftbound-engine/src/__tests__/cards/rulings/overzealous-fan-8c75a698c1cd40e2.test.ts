/**
 * Ruling 8c75a698c1cd40e2 — Overzealous Fan (SFD-128 → sfd-128-221) · Unit · Chaos · [2] · 2 Might
 *     "When I defend, you may kill me to move an attacking unit to its base."
 *   × Draven, Audacious (sfd-148-221) · 6 Might · "[Deflect] (Opponents must pay [rainbow] to choose me with a spell
 *     or ability.)"
 *
 * Q: Using Overzealous Fan's ability on a [Deflect] unit — do I have to pay the Deflect cost?
 * A: Yes. The attacking unit is chosen as the trigger is put on the Chain, and choosing a [Deflect] unit owes its
 *    surcharge right then; if you cannot pay it, that unit is not a legal choice. The move itself happens later, when
 *    the ability resolves.
 * Rules: 809.1.c.1 ([Deflect] surcharge owed when the unit is chosen), 402.2 (a trigger's targets are chosen at
 *        finalization), 355.10.d.2 (a sole legal option is still a choice).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const DRAVEN_AUDACIOUS = "sfd-148-221";

const cards = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []);

/** P1's turn. P2 holds bf1 with the Fan; P1 attacks with Draven ([Deflect]) and a plain Charger. P2 has `rainbow` power. */
function board(rainbow: number) {
  return scenario()
    .resources(P2, { energy: 0, power: { rainbow } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P1, "base", DRAVEN_AUDACIOUS, "draven")
    .unit(P1, "base", { might: 5, name: "Charger" }, "charger");
}

describe("Ruling 8c75a698c1cd40e2 — choosing a [Deflect] attacker with the Fan's ability costs its surcharge, at choice time", () => {
  test("ruling 8c75a698c1cd40e2 — with [rainbow] in the pool Draven IS offered, carries the surcharge, and picking him spends it", async () => {
    const game = await board(1).build();
    await game.p1.move(["draven", "charger"], "bf1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "fan" }, timing: "FIN" });
    await game.p2.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, timing: "FIN" });
    expect(cards(d)).toEqual(["charger", "draven"]);
    expect(d?.kind === "pick" ? d.options.find((o) => (o.card ?? o.key) === "draven")?.deflect : undefined).toBeTruthy();
    expect(d?.kind === "pick" ? d.options.find((o) => (o.card ?? o.key) === "charger")?.deflect : undefined).toBeFalsy();
    await game.p2.pick("draven");
    expect(game.p2.power("rainbow")).toBe(0); // the [Deflect] surcharge, charged as he is chosen
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", targets: ["draven"], triggered: true })]);
  });

  test("…and the MOVE only happens when the ability resolves: Draven is still at bf1 while the item waits, and goes home afterwards", async () => {
    const game = await board(1).build();
    await game.p1.move(["draven", "charger"], "bf1");
    await game.p2.yes();
    await game.p2.pick("draven");
    expect(game.locationOf("draven")).toBe("bf1");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.locationOf("draven")).toBe("base");
    expect(game.state("draven").combatRole).toBeNull();
    expect(game.locationOf("charger")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("ruling 8c75a698c1cd40e2 — without the [rainbow] the surcharge cannot be paid, so Draven is not a legal choice at all: the Charger is the only candidate left and is bound unasked", async () => {
    const game = await board(0).build();
    await game.p1.move(["draven", "charger"], "bf1");
    await game.p2.yes();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", targets: ["charger"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.locationOf("draven")).toBe("bf1"); // never moved — he could not be chosen
    expect(game.locationOf("charger")).toBe("base");
    expect(game.p2.power("rainbow")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 8c75a698c1cd40e2 says the "kill me" half is a cost-within-instruction decided and paid
  // only at RESOLUTION. CR 383.3.a/.b and 204.3.a — which names Overzealous Fan — make a leading "you may [cost] to …"
  // the trigger's BASE COST, decided and paid while the item is FINALIZED. The engine follows the CR.
  test("the 'kill me' half is the trigger's BASE COST paid at finalization (CR 383.3.b / 204.3.a): the Fan is already in the trash while its item still sits on the Chain", async () => {
    const game = await board(1).build();
    await game.p1.move(["draven", "charger"], "bf1");
    await game.p2.yes();
    await game.p2.pick("draven");
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["fan"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("declining the trigger costs nothing at all: the Fan lives, no [rainbow] is spent and both attackers stay", async () => {
    const game = await board(1).build();
    await game.p1.move(["draven", "charger"], "bf1");
    await game.p2.no();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    expect(game.p2.power("rainbow")).toBe(1);
    expect(game.locationOf("draven")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});

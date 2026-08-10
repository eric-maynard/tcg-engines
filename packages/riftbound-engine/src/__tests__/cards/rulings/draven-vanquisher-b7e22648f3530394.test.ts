/**
 * Ruling b7e22648f3530394 — Draven, Vanquisher (SFD-020 → sfd-020-221) · Unit · Fury · 4 · 4 Might
 *     "When I win a combat, play a Gold gear token exhausted. When I attack or defend, you may pay [fury]. If you do,
 *      give me +2 Might this turn."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · Spell · Chaos · 2 · [Hidden] [Action] "Move a unit from a battlefield to its base."
 *   × Vex, Cheerless (sfd-146-221) · Unit · 5 Might "While I'm in combat, friendly spells cost [1][rainbow] less …, and
 *     enemy spells cost [1][rainbow] more."
 *
 * Q: Draven holds a battlefield with a hidden Fight or Flight; the opponent's Vex attacks. On Draven's defend trigger,
 *    can I respond with the hidden Fight or Flight for its hidden cost ([0]) or does Vex tax it?
 * A: You may respond with it, but Hidden only sets the BASE cost to 0 — Vex's increase applies on top, so it costs
 *    [1]+[rainbow]. Chain: Draven's trigger → hidden Fight or Flight above it → LIFO: Fight or Flight resolves first
 *    (Vex to base), then Draven's trigger resolves and you decide/pay the [fury] then for +2 Might.
 * Rules: 811.1.b (hidden play cost 0 = base cost), 356.4 (cost increases apply after the base cost), 340 (LIFO),
 *        383.4.f (defend trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN_VANQUISHER = "sfd-020-221";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const VEX_CHEERLESS = "sfd-146-221";

/** P2's turn. P1 holds bf1 with Draven (4) and a Fight or Flight hidden there since an earlier turn. P2's Vex (5) attacks from base. */
function board(p1: { energy: number; power: Record<string, number> }) {
  return scenario()
    .active(P2)
    .resources(P1, p1)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", DRAVEN_VANQUISHER, "draven")
    .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P2, "base", VEX_CHEERLESS, "vex");
}

const isDravenPayOffer = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P1 && (d.source?.cardId === "draven" || /Draven/.test(d.prompt));

/** Vex attacks; Draven's defend trigger goes on the chain (P1 opts in to "you may pay [fury]" wherever the engine asks); P1 then holds priority. */
async function vexAttacksDravenTriggerPending(game: Game): Promise<void> {
  await game.p2.move("vex", "bf1");
  expect(game.state("vex").combatRole).toBe("attacker");
  expect(game.state("draven").combatRole).toBe("defender");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "draven", controller: P1, triggered: true })]);
  if (isDravenPayOffer(game.decision())) {
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // P1's own choice
    await game.p1.yes();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // the Reaction window on Draven's trigger
}

describe("Ruling b7e22648f3530394 — hidden Fight or Flight answers Draven's defend trigger, but Vex taxes it [1]+[rainbow]", () => {
  test("Vex's increase applies on top of the hidden [0]: with NO energy the hidden Fight or Flight is NOT playable in the reaction window", async () => {
    const game = await board({ energy: 0, power: { fury: 1 } }).build();
    await vexAttacksDravenTriggerPending(game);
    expect(game.p1.can("reveal", "fof")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
  });

  test("with [1] + a spare power it IS playable in response: revealing it costs exactly [1]+[1 power] (not [0]) and it goes on the chain ABOVE Draven's trigger, targeting Vex", async () => {
    const game = await board({ energy: 1, power: { fury: 2 } }).build();
    await vexAttacksDravenTriggerPending(game);
    expect(game.p1.can("reveal", "fof")).toBe(true);
    await game.p1.reveal("fof", { answers: ["vex"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } }); // 1 energy + 1 power paid to Vex's tax
    expect(game.chain().map((c) => c.cardId)).toEqual(["draven", "fof"]);
    expect(game.chain().at(-1)).toMatchObject({ cardId: "fof", controller: P1, targets: ["vex"] });
  });

  test("LIFO: Fight or Flight resolves first (Vex → P2's base); THEN Draven's trigger resolves and the [fury] is paid at that point for +2 Might (4 → 6); P1 keeps bf1", async () => {
    const game = await board({ energy: 1, power: { fury: 2 } }).build();
    await vexAttacksDravenTriggerPending(game);
    await game.p1.reveal("fof", { answers: ["vex"] });
    expect(game.p1.power("fury")).toBe(1); // Draven's [fury] not spent yet — that happens when his trigger resolves
    // Resolve the top item only.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("vex")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["draven"]); // Draven's trigger still waiting underneath
    expect(game.state("draven").might).toBe(4);
    // Now Draven's trigger resolves: both pass, and the "pay [fury]?" decision is put to P1 AT RESOLUTION.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(isDravenPayOffer(game.decision())).toBe(true);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "RES" });
    expect(game.p1.power("fury")).toBe(1);
    await game.p1.yes();
    expect(game.chain()).toEqual([]);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.state("draven")).toMatchObject({ might: 6, mightModifier: 2 });
    // The attacker left: the showdown winds down with Draven still holding bf1.
    await game.settle();
    expect(game.zoneOf("draven")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("vex")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});

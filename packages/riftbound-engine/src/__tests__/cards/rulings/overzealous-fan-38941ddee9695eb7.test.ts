/**
 * Ruling 38941ddee9695eb7 — Overzealous Fan (SFD-128 → sfd-128-221) · Unit · Chaos · 2 · 2 Might
 *     "When I defend, you may kill me to move an attacking unit to its base."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action · [2][chaos] "Move a friendly unit and ready it."
 *
 * Q: My only attacking unit is pushed back to base by Overzealous Fan. Can I still use an Action?
 * A: Yes. The combat showdown does not end when the attacker leaves; it only concludes when all players pass Focus on
 *    an empty chain. Until then you may play an Action (e.g. Ride the Wind to send the unit back in) when you have Focus.
 * Rules: 347 / 348 (showdown ends only on consecutive passes over an empty chain), 345 (Focus lets you play
 *        Action-speed), 464.2.c.3.a (a unit arriving mid-combat gains the Attacker designation).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P1's turn. P2 holds bf1 with Overzealous Fan (2) and a 2-Might Usher. P1's lone Charger (5) is ready in base and P1
 * holds Ride the Wind with exactly [2][chaos].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P2, "bf1", { might: 2, name: "Usher" }, "usher")
    .unit(P1, "base", { might: 5, name: "Charger" }, "charger")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};
const isFanOffer = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P2 && (d.source?.cardId === "fan" || /Overzealous Fan/.test(d.prompt));

/** Charger attacks alone; P2 accepts the Fan's offer (killing it) and sends Charger home; drain that chain. */
async function fanBouncesLoneAttacker(game: Game): Promise<void> {
  await game.p1.move("charger", "bf1");
  expect(game.state("charger").combatRole).toBe("attacker");
  expect(game.state("fan").combatRole).toBe("defender");
  let offered = 0;
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (isFanOffer(d)) {
      offered += 1;
      await game.p2.yes();
    } else if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick(d.options.find((o) => (o.card ?? o.key) === "charger")?.key ?? (d.options[0]?.key as string));
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  expect(offered).toBe(1);
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("fan")).toBe("trash");
  expect(game.zoneOf("charger")).toBe("base");
  expect(game.p1.units("bf1")).toEqual([]); // no attacker left at bf1
}

describe("Ruling 38941ddee9695eb7 — the showdown survives Overzealous Fan emptying the attack; the attacker's player may still play an Action", () => {
  test("after the Fan sends my ONLY attacker home, bf1's combat showdown is still open (Contested, P2 still controls) and P1 holds Focus with a live action menu", async () => {
    const game = await board().build();
    await fanBouncesLoneAttacker(game);
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "rtw")).toBe(true); // an Action is playable right now
  });

  test("P1 uses that window: Ride the Wind moves Charger back into bf1 READY; it re-gains Attacker in the same showdown, and the combat then resolves (5 vs Usher 2 → P1 conquers)", async () => {
    const game = await board().build();
    await fanBouncesLoneAttacker(game);
    await game.p1.cast("rtw", { targets: "charger" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    for (let i = 0; i < 8 && game.zoneOf("rtw") !== "trash"; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => /bf1/.test(o.key))?.key ?? (d.options[0]?.key as string));
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      const d = game.decision() as Extract<Decision, { kind: "pick" }>;
      await game.p1.pick(d.options.find((o) => /bf1/.test(o.key))?.key ?? (d.options[0]?.key as string));
    }
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.zoneOf("charger")).toBe("battlefield-bf1");
    expect(game.state("charger")).toMatchObject({ combatRole: "attacker", isReady: true });
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true }); // same showdown, still going
    await game.settle(); // everyone passes → combat damage
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("usher")).toBe("trash");
    expect(game.zoneOf("charger")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — if P1 just passes instead, THEN the showdown concludes (both pass on an empty chain): no combat damage, Usher keeps bf1 for P2, Charger sits in base", async () => {
    const game = await board().build();
    await fanBouncesLoneAttacker(game);
    await game.p1.passFocus();
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("usher")).toBe("battlefield-bf1");
    expect(game.state("usher").damage).toBe(0);
    expect(game.zoneOf("charger")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toEqual(["rtw"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

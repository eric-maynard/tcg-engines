/**
 * Ruling 12c02a8c520de66e — Overzealous Fan (SFD-128 → sfd-128-221) · Unit · Chaos · 2 · 2 Might
 *   "When I defend, you may kill me to move an attacking unit to its base."
 *   × Draven, Vanquisher (SFD-020 → sfd-020-221) · Unit · Fury · 4 · 4 Might
 *     "When I win a combat, play a Gold gear token exhausted. When I attack or defend, you may pay [fury]. If you do,
 *      give me +2 [Might] this turn."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · [2][chaos] · Action — "Move a friendly unit and ready it."
 *
 * Q: I attack into Fan + Draven; they decline Draven's trigger but use Fan to bounce my attacker to base. If I Ride
 *    the Wind it back into the battlefield, can Draven use his defend trigger again in that combat showdown?
 * A: No. "When I defend" is fulfilled once per combat (declined or not). The showdown does not end when my unit
 *    leaves; my unit re-enters as an Attacker, but Draven never re-gains Defender and could not re-trigger anyway.
 * Rules: 383.4.f / 383.4.f.2.a (defend triggers checked once per combat), 383.4.e.2.a (same for attack), 347
 *        (showdown continues until all pass), 464.2.c.3.a (a unit arriving mid-combat gains the designation).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const DRAVEN = "sfd-020-221";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P1's turn. P2 holds bf1 with Overzealous Fan (2) + Draven (4) and has a spare [fury] (so declining is a real
 * choice). P1's Charger (5) is ready in base; P1 holds Ride the Wind with exactly [2][chaos].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P2, "bf1", DRAVEN, "draven")
    .unit(P1, "base", { might: 5, name: "Charger" }, "charger")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

const isDravenOffer = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P2 && (d.source?.cardId === "draven" || /Draven/.test(d.prompt));
const isFanOffer = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P2 && (d.source?.cardId === "fan" || /Overzealous Fan/.test(d.prompt));
const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/**
 * Charger attacks bf1. Both P2 defend triggers hit the Initial Chain; P2 DECLINES Draven and ACCEPTS the Fan
 * (killing it) to send Charger home; the chain is then resolved. Returns how many times each offer appeared.
 */
async function attackFanBouncesCharger(game: Game): Promise<{ draven: number; fan: number }> {
  const seen = { draven: 0, fan: 0 };
  await game.p1.move("charger", "bf1");
  expect(game.state("charger").combatRole).toBe("attacker");
  expect(game.state("draven").combatRole).toBe("defender");
  expect(game.state("fan").combatRole).toBe("defender");
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.seat === P2) {
      await game.acceptTriggerOrder(); // P2 orders its two simultaneous defend triggers (383.3.d) — listed order is fine
    } else if (isDravenOffer(d)) {
      seen.draven += 1;
      await game.p2.no();
    } else if (isFanOffer(d)) {
      seen.fan += 1;
      await game.p2.yes();
    } else if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick(d.options.find((o) => (o.card ?? o.key) === "charger")?.key ?? (d.options[0]?.key as string));
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return seen;
}

/** With Focus in the still-open showdown, P1 Rides the Wind Charger back into bf1 and lets it resolve. */
async function rideChargerBackIn(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "charger" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  for (let i = 0; i < 6 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options.find((o) => o.key === "battlefield-bf1")?.key ?? (d.options[0]?.key as string));
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick(d.options.find((o) => o.key === "battlefield-bf1")?.key ?? (d.options[0]?.key as string));
  }
  expect(game.zoneOf("rtw")).toBe("trash");
}

describe("Ruling 12c02a8c520de66e — Draven's 'When I defend' cannot fire twice in one combat, even after Fan + Ride the Wind", () => {
  test("initial chain: BOTH P2 defend triggers go on the chain (P2 orders them); P2 declines Draven's [fury] and kills the Fan to send Charger to base — each offer appeared exactly once", async () => {
    const game = await board().build();
    await game.p1.move("charger", "bf1");
    const first = game.decision();
    // P2's first question is about ITS two simultaneous defend triggers: a finalization opt-in (383.3.a — the Fan's
    // costed "kill me?" / Draven's free "use it?") or their 383.3.d order — never anything for P1.
    expect(first?.seat).toBe(P2);
    expect(first?.kind === "order" || (first?.kind === "yes-no" && first.timing === "FIN")).toBe(true);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["draven", "fan"]);
    expect(game.chain().every((c) => c.triggered && c.controller === P2)).toBe(true);
    // Continue from here with the shared driver (it accepts the order offer first).
    const seen = { draven: 0, fan: 0 };
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (d?.kind === "order") {
        await game.acceptTriggerOrder();
      } else if (isDravenOffer(d)) {
        seen.draven += 1;
        await game.p2.no();
      } else if (isFanOffer(d)) {
        seen.fan += 1;
        await game.p2.yes();
      } else if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick(d.options[0]?.key as string);
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(seen).toEqual({ draven: 1, fan: 1 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fan")).toBe("trash"); // "kill me" paid
    expect(game.state("draven").might).toBe(4); // declined: no +2
    expect(game.p2.power("fury")).toBe(1); // nothing paid
    expect(game.zoneOf("charger")).toBe("base");
    expect(game.state("charger").combatRole).not.toBe("attacker");
  });

  test("the showdown does NOT end when the attacker is bounced: bf1's combat showdown is still open and P1 (attacker) holds Focus", async () => {
    const game = await board().build();
    await attackFanBouncesCharger(game);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("Ride the Wind brings Charger back READY and it re-gains Attacker — but NO new defend trigger: the chain is empty, P2 is not offered Draven's [fury] again, Draven stays 4", async () => {
    const game = await board().build();
    const seen = await attackFanBouncesCharger(game);
    expect(seen).toEqual({ draven: 1, fan: 1 });
    await rideChargerBackIn(game);
    expect(game.zoneOf("charger")).toBe("battlefield-bf1");
    expect(game.state("charger")).toMatchObject({ combatRole: "attacker", isReady: true });
    expect(game.state("draven").combatRole).toBe("defender"); // he never left
    // The crux: nothing triggered off the re-entry.
    expect(game.chain()).toEqual([]);
    expect(isDravenOffer(game.decision())).toBe(false);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("draven").might).toBe(4);
    expect(game.p2.power("fury")).toBe(1);
  });

  test("through to the end of that combat P2 is never asked about Draven again; Charger (5) beats Draven (4) and P1 conquers bf1", async () => {
    const game = await board().build();
    await attackFanBouncesCharger(game);
    await rideChargerBackIn(game);
    let dravenAskedAgain = false;
    game.script(P2, [
      (d) => {
        if (isDravenOffer(d)) {
          dravenAskedAgain = true;
        }
        return undefined;
      },
    ]);
    await game.settle();
    expect(dravenAskedAgain).toBe(false);
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.zoneOf("charger")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.power("fury")).toBe(1); // never spent on Draven
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

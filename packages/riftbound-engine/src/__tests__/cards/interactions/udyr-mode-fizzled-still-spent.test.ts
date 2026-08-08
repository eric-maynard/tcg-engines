/**
 * Interaction: Udyr, Wildman (ogn-157-298) "Spend my buff: Choose one you've not chosen this turn — Deal 2 to a unit
 *   at a battlefield. · Stun a unit at a battlefield. · Ready me. · Give me [Ganking] this turn."
 *   × Fight or Flight (ogn-168-298) [Hidden] [Action] "Move a unit from a battlefield to its base." — facedown at bf2
 *
 * Question: P1's turn; buffed, exhausted Udyr in P1's base; P2 holds bf2 with V (2 Might) and Fight or Flight facedown
 * there. P1 activates Udyr choosing "Deal 2" → V.
 *   (a) Activated abilities follow the play process (377): mode (355.3 / 402.2), that mode's target (355.5) and the cost
 *       (spend the buff) are all fixed during FINALIZATION — before P2 ever holds priority. Buff already gone; mode +
 *       target public on the chain item.
 *   (b) P2 flips Fight or Flight for 0 in response: legal on P1's turn (facedown ⇒ [Reaction], 811.6 / 811.1.b), target
 *       must be at bf2 (811.1.d.2) — V. It resolves first, V goes home. Udyr's ability then resolves: V is no longer
 *       "a unit at a battlefield" → mistargeted, no damage (359.3.e.5 / 359.3.e.9); choices are locked (355.15) so no
 *       other mode / no other unit; the ability resolves with no effect (359.3.e.10). The buff stays spent.
 *   (c) "not chosen this turn" keys off the CHOICE: Deal 2 was chosen, so a re-buffed Udyr is offered only Stun / Ready
 *       me / Ganking — even though Deal 2 did nothing.
 *   (d) No unit at any battlefield: Deal 2 / Stun have no valid target and cannot be selected (355.8 / 402.3); Ready me
 *       and Ganking remain, so the activation itself stays legal.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UDYR = "ogn-157-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const STAND_UNITED = "ogn-053-298"; // [Action] 3 energy: Buff a friendly unit — re-buffs Udyr for (c)

/**
 * P1's turn. P1: buffed+exhausted Udyr in base, a 3-Might Bystander holding bf1 (a unit at ANOTHER battlefield, so a
 * wrongly substituted target would be observable). P2: V (2) at bf2 with Fight or Flight facedown there, 0 energy.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Bystander" }, "bystander")
    .unit(P2, "bf2", { might: 2, name: "V" }, "vee")
    .facedown(P2, "bf2", FIGHT_OR_FLIGHT, "fof")
    .unit(P1, "base", UDYR, "udyr", { buffed: true, exhausted: true })
    .resources(P1, { energy: 3 })
    .hand(P1, STAND_UNITED, "standUnited");
}

function modeKey(d: PickDecision, label: string): string {
  const opt = d.options.find((o) => o.label.includes(label));
  expect(opt).toBeDefined();
  return opt!.key;
}

/**
 * Activate Udyr intending "Deal 2 → V". If the engine asks mode/target at finalization (the rules' timing) they are
 * answered here; returns whether that happened. Otherwise the (late) prompt is answered by `answerLateMode`.
 */
async function activateDeal2AtV(game: Game): Promise<boolean> {
  await game.p1.activate("udyr");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick(modeKey(d, "Deal 2"));
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("vee");
    }
    return true;
  }
  return false;
}

/** P1 passes; P2 flips Fight or Flight from facedown (V is its only legal object at bf2) and everyone passes. */
async function p2RespondsWithFightOrFlight(game: Game) {
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.reveal("fof");
  return game.settle(); // FoF resolves first (V → base), then Udyr's ability
}

describe("Udyr, Wildman × Fight or Flight (facedown) — a fizzled mode is still 'chosen' and still paid for", () => {
  // ---------------------------------------------------------------- (a) finalization
  test("(a) the cost is paid at finalization: activating spends the buff at once (7 → 6 Might) and the ability is a chain item before P2 can act", async () => {
    const game = await board().build();
    expect(game.state("udyr")).toMatchObject({ isBuffed: true, might: 7 });
    await activateDeal2AtV(game);
    expect(game.state("udyr")).toMatchObject({ isBuffed: false, might: 6 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "udyr", controller: P1, triggered: false })]);
    expect(game.actingSeat()).toBe(P1); // the activator keeps priority first
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("udyr").isBuffed).toBe(false); // still gone while P2 decides
  });

  test("(a) mode AND target are chosen during finalization (355.3 / 355.5 / 402.2) — asked before anyone gets priority and shown on the chain item", async () => {
    // Expected: right after activate() P1 is asked the mode (timing FIN) and then the target, and the finalized chain
    // item carries { mode, targets: [vee] } for P2 to see. Actual: activate() goes straight to the priority window;
    // the mode/target prompt only appears when the ability RESOLVES (timing RES).
    const game = await board().build();
    const lockedAtFinalization = await activateDeal2AtV(game);
    expect(lockedAtFinalization).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "udyr", targets: ["vee"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // ---------------------------------------------------------------- (b) the response
  test("(b) P2 may flip the facedown Fight or Flight for 0 on P1's turn in response (811.6 / 811.1.b): it stacks above Udyr's ability, costs nothing", async () => {
    const game = await board().build();
    await activateDeal2AtV(game);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().map((i) => i.cardId)).toEqual(["udyr", "fof"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(b) Fight or Flight resolves first and its object is restricted to bf2 (811.1.d.2): V goes to P2's base, the Bystander at bf1 is untouched", async () => {
    const game = await board().build();
    await activateDeal2AtV(game);
    await p2RespondsWithFightOrFlight(game);
    expect(game.zoneOf("vee")).toBe("base");
    expect(game.p2.units("base")).toContain("vee");
    expect(game.locationOf("bystander")).toBe("bf1");
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.state("udyr").isBuffed).toBe(false); // nothing refunded along the way
  });

  test("(b) Udyr's ability then resolves with NO effect — V mistargeted (359.3.e.5/.9), choices locked (355.15): nobody damaged or stunned, Udyr still exhausted, no new choice offered (359.3.e.10)", async () => {
    // Expected: after both items resolve the chain is empty, P1 is back in an open main phase, V/Bystander have 0
    // damage and Udyr is still exhausted and unbuffed. Actual: because the mode was never locked, the engine now
    // opens a fresh "Choose a mode" prompt at resolution, letting P1 redirect to Stun/Ready/another unit.
    const game = await board().build();
    await activateDeal2AtV(game);
    const stop = await p2RespondsWithFightOrFlight(game);
    expect(stop.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.state("vee").damage).toBe(0);
    expect(game.state("bystander")).toMatchObject({ damage: 0, isStunned: false });
    expect(game.state("udyr")).toMatchObject({ isBuffed: false, isExhausted: true, isStunned: false });
  });

  test("(b) the buff is NOT refunded when the chosen mode does nothing — costs were paid at finalization", async () => {
    const game = await board().build();
    await activateDeal2AtV(game);
    await p2RespondsWithFightOrFlight(game);
    // Whatever the engine asks next, the spent buff has not come back.
    expect(game.state("udyr")).toMatchObject({ isBuffed: false, might: 6 });
    expect(game.state("vee").damage).toBe(0); // and V, safe in base, was never hit
  });

  // ---------------------------------------------------------------- (c) "not chosen this turn"
  test("(c) 'Deal 2' counts as CHOSEN this turn even though it did nothing: a re-buffed Udyr is offered exactly Stun / Ready me / Ganking", async () => {
    const game = await board().build();
    const early = await activateDeal2AtV(game);
    await p2RespondsWithFightOrFlight(game);
    if (!early) {
      // Engine asks late (see BUG above): name Deal 2 now so the mode is on record for this turn.
      const d = game.decision() as PickDecision;
      expect(d).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick(modeKey(d, "Deal 2"));
      await game.settle({ policy: "first" });
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.cast("standUnited", { targets: "udyr" });
    await game.settle();
    expect(game.state("udyr").isBuffed).toBe(true);
    expect(game.p1.can("activate", "udyr")).toBe(true);
    await game.p1.activate("udyr");
    let d = game.decision();
    if (d?.kind !== "pick") {
      await game.settle();
      d = game.decision();
    }
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const labels = (d as PickDecision).options.map((o) => o.label);
    expect(labels).toEqual(["Stun", "Ready me", "Ganking"]);
    expect(labels).not.toContain("Deal 2");
  });

  // ---------------------------------------------------------------- (d) no battlefield unit at all
  test("(d) variant — no unit at any battlefield: Deal 2 / Stun have no valid target and are not selectable (355.8 / 402.3); Ready me / Ganking keep the activation legal", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "base", { might: 2, name: "V" }, "vee") // in a base — not "at a battlefield"
      .unit(P1, "base", UDYR, "udyr", { buffed: true, exhausted: true })
      .build();
    expect(game.p1.can("activate", "udyr")).toBe(true);
    await game.p1.activate("udyr");
    let d = game.decision();
    if (d?.kind !== "pick") {
      await game.settle();
      d = game.decision();
    }
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const labels = (d as PickDecision).options.map((o) => o.label);
    expect(labels).toEqual(["Ready me", "Ganking"]);
    await game.p1.pick(modeKey(d as PickDecision, "Ready me"));
    await game.settle();
    expect(game.state("udyr")).toMatchObject({ isBuffed: false, isReady: true });
    expect(game.state("vee")).toMatchObject({ damage: 0, isStunned: false });
  });
});

/**
 * Ruling a3e52323f716dacf — Ride the Wind (OGN-173 → ogn-173-298) · Action · [2][chaos] · "Move a friendly unit and ready it."
 *   × Yasuo, Remorseful (ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Reaver's Row (ogn-285-298) · Battlefield · "When you defend here, you may move a friendly unit here to base."
 *   (Fight or Flight OGN-168 is cited as another way to move a unit out.)
 *
 * Q: Yasuo attacks and aims his 'when I attack' at my unit — can I respond with Ride the Wind to save it?
 * A: No: Ride the Wind is an Action, not a Reaction; it is only playable after the initial chain of attack/defend
 *    triggers has resolved (i.e. after his damage). But 'when you defend' triggers go on that same chain AFTER the
 *    attacker's and so resolve FIRST — a battlefield like Reaver's Row can move his target home before his ability
 *    resolves, and then no damage is dealt.
 * Rules: 464.2 (initial chain: attacker triggers, then defender triggers), 332 (LIFO), 343–347 (Closed state: only
 *        Reactions; Actions need Focus on an empty chain), 355.11 (target no longer "here" → nothing happens).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";

type Pick = Extract<Decision, { kind: "pick" }>;
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const YASUO = "ogn-076-298";
const REAVERS_ROW = "ogn-285-298";

/** P1's turn. P2 holds the battlefield with Victim (3) + Buddy (2) and has Ride the Wind + [2][chaos]. Yasuo ready in P1's base. */
function board(bfDef?: string) {
  return scenario()
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", bfDef ? { controller: P2, def: bfDef, inert: false } : { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P2, RIDE_THE_WIND, "ride");
}

/** Yasuo attacks bf1 and names Victim for his trigger. */
async function yasuoAttacks(bfDef?: string): Promise<Game> {
  const game = await board(bfDef).build();
  await game.p1.move("yasuo", "bf1");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("victim");
  expect(game.state("yasuo").combatRole).toBe("attacker");
  return game;
}

describe("Ruling a3e52323f716dacf — Ride the Wind can't answer Yasuo's attack trigger; a 'when you defend' trigger can", () => {
  test("plain battlefield: Yasuo's trigger (→ Victim) is the initial chain; in every priority window before it resolves P2 CANNOT cast the Action-speed Ride the Wind", async () => {
    const game = await yasuoAttacks();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["victim"], triggered: true })]);
    expect(game.p2.can("cast", "ride")).toBe(false);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ride")).toBe(false);
    const r = await game.p2.try((p) => p.cast("ride", { targets: "victim" }));
    expect(r.ok).toBe(false);
    expect(game.p2.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
  });

  test("plain battlefield: the trigger resolves — Victim (3) takes 6 and dies — and only THEN, holding Focus on an empty chain, may P2 cast Ride the Wind (too late to save it)", async () => {
    const game = await yasuoAttacks();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("trash");
    // Focus passes around the showdown; when it reaches P2, Ride the Wind is finally legal.
    if (game.actingSeat() === P1) {
      await game.p1.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ride")).toBe(true);
  });

  test("Reaver's Row: the defend trigger goes on the chain ABOVE Yasuo's attack trigger (attacker triggers first, then defender's) — P2 is asked 'you may' (yes/no) and which friendly unit here to send home", async () => {
    const game = await yasuoAttacks(REAVERS_ROW);
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "bf1"]);
    const ask: Decision | null = game.decision();
    expect(ask).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    const pick = game.decision();
    expect(pick).toMatchObject({ kind: "pick", seat: P2 });
    expect((pick as Pick).options.map((o) => o.card ?? o.key).sort()).toEqual(["buddy", "victim"]);
    await game.p2.pick("victim");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "yasuo", targets: ["victim"], triggered: true }),
      expect.objectContaining({ cardId: "bf1", controller: P2, targets: ["victim"], triggered: true }),
    ]);
  });

  test("Reaver's Row: LIFO — the Row resolves first and moves Victim to base; Yasuo's trigger then resolves with its target no longer 'here' and deals NO damage to anyone", async () => {
    const game = await yasuoAttacks(REAVERS_ROW);
    await game.p2.yes();
    await game.p2.pick("victim");
    // Resolve the Row (top item).
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", targets: ["victim"] })]);
    // Resolve Yasuo's trigger.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("victim")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("buddy")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // not redirected
    expect(game.state("yasuo").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

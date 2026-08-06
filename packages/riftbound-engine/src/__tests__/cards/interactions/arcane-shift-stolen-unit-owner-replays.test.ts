/**
 * Interaction: Arcane Shift (sfd-200-221) · Spell · Mind/Chaos · 3 + [rainbow] · Action
 *     "Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 to an enemy unit at a
 *      battlefield. Banish this."
 *   × Possession (ogn-203-298) · Spell · Chaos · 8 + [chaos]x3 · Action
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it."
 *   × Thousand-Tailed Watcher (ogn-116-298) · Unit · Mind · 7 + [mind] · 7 Might
 *     "[Accelerate] (You may pay [1][mind] … enter ready.) When you play me, give enemy units -3 [Might]
 *      this turn, to a minimum of 1 [Might]."
 *
 * Question: P1 Possessed P2's Watcher earlier (it sits in P1's base, damaged and exhausted). P1 Arcane
 * Shifts it. (a) Is the stolen Watcher "friendly" to P1? (b) Who replays it, who controls it after, where
 * may it go, who may pay Accelerate? (c) Whose units eat the Watcher's play trigger, and when relative to
 * "Deal 3"? (d) Contrast: P1 Arcane Shifts a Watcher it owns that is damaged, stunned and buffed.
 *
 * Expected: (a) yes — friendly = shares a controller (740.1.a); ownership is irrelevant. (b) It is banished
 * and becomes a new object (124); "its OWNER plays it" = P2 (127.1) gets the pending play, which per 354.3
 * waits until Arcane Shift has fully resolved (deal 3, banish itself). P2 picks P2's base or a battlefield
 * P2 controls (355.2.a); cost ignored (356.1.b.1) but P2 may pay Accelerate [1][mind] to enter ready
 * (356.2.b.1), else it enters exhausted (143.4). P2 played it ⇒ P2 controls it (191.1/191.3) — Possession's
 * control change is gone. (c) The play trigger is P2's (191.3.d) ⇒ P1's units get -3 Might (min 1); it
 * happens after the Deal 3 and after Arcane Shift banished itself. (d) Own Watcher: P1 replays it (base or a
 * battlefield P1 controls — including the one it just left) as a fresh object: damage/stun/buff gone
 * (124.1/705), exhausted unless P1 pays Accelerate, and its trigger fires again under P1 (hits P2's units).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Policy, Seat } from "../../../harness";
import { P1, P2, passivePolicy, scenario } from "../../../harness";

const ARCANE_SHIFT = "sfd-200-221";
const POSSESSION = "ogn-203-298";
const WATCHER = "ogn-116-298";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Passive settling (pass priority, forced picks) plus: answer NO to any "you may pay …" question. */
const declineOptional: Policy = (d, g) => (d.kind === "yes-no" ? { kind: "yes-no", value: false } : passivePolicy(d, g));

/** Passive settling plus: if the engine (wrongly) asks to pick ONE enemy unit for the Watcher's trigger, name the victim. */
const pickVictimIfAsked: Policy = (d, g) =>
  d.kind === "pick" && d.options.some((o) => o.key === "victim") ? { keys: ["victim"], kind: "pick" } : passivePolicy(d, g);

/** The [friendly, enemy] target pairs Arcane Shift offers `seat`. */
function pairsOffered(game: G, seat: Seat, alias: string): string[][] {
  const opt = game.seat(seat).option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []).map((v) => (Array.isArray(v) ? (v as string[]) : [v as string]));
}

/**
 * P1's turn. P2's Watcher (2 damage, exhausted) sits alone at bf1; P2 also has "victim" (5 Might) at bf2
 * (P2-controlled) and a 2-Might unit in base. P1 controls "home" with a 4-Might unit and has another
 * 4-Might unit in base. P1: Possession + Arcane Shift in hand, 8+3 energy, chaos for both spells (+ optional
 * mind for Accelerate in variant d). P2 has exactly [1][mind] for Accelerate.
 */
function board(opts: { p1Mind?: number } = {}) {
  return scenario()
    .resources(P1, { energy: 14, power: { chaos: 4, mind: opts.p1Mind ?? 0 } })
    .resources(P2, { energy: 1, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("home", { controller: P1 })
    .unit(P2, "bf1", WATCHER, "watcher", { damage: 2, exhausted: true })
    .unit(P2, "bf2", { might: 5 }, "victim")
    .unit(P2, "base", { might: 2 }, "p2Small")
    .unit(P1, "home", { might: 4 }, "p1AtBf")
    .unit(P1, "base", { might: 4 }, "p1AtBase")
    .hand(P1, POSSESSION, "poss")
    .hand(P1, ARCANE_SHIFT, "shift");
}

/** "Earlier, P1 took P2's Watcher with Possession": resolve it for real so the engine's own control state is used. */
async function possessed(opts: { p1Mind?: number } = {}): Promise<G> {
  const game = await board(opts).build();
  await game.p1.cast("poss", { targets: "watcher" });
  await game.settle();
  expect(game.state("watcher")).toMatchObject({ controller: P1, owner: P2, location: "base", damage: 2, isExhausted: true });
  return game;
}

/** P1 Arcane Shifts the stolen Watcher (enemy target: victim) and everyone passes until a real prompt appears. */
async function shiftStolen(game: G): Promise<Decision | null> {
  await game.p1.cast("shift", { targets: ["watcher", "victim"] });
  const r = await game.settle();
  return r.decision;
}

/** Variant (d): P1's OWN Watcher (2 damage, stunned, buffed) at "home" instead of the Possession story. */
function ownBoard(opts: { p1Mind?: number } = {}) {
  return scenario()
    .resources(P1, { energy: 5, power: { chaos: 1, mind: opts.p1Mind ?? 0 } })
    .battlefield("bf2", { controller: P2 })
    .battlefield("home", { controller: P1 })
    .unit(P1, "home", WATCHER, "ownWatcher", { buffed: true, damage: 2, stunned: true })
    .unit(P2, "bf2", { might: 5 }, "victim")
    .unit(P2, "base", { might: 2 }, "p2Small")
    .unit(P1, "base", { might: 4 }, "p1AtBase")
    .hand(P1, ARCANE_SHIFT, "shift");
}

describe("Arcane Shift × Possession-stolen Thousand-Tailed Watcher — 'its owner plays it'", () => {
  // ------------------------------------------------------------------ (a) targeting

  test.failing("BUG: (a) the stolen Watcher is a legal 'friendly unit' for P1's Arcane Shift — friendly means controlled-by (740.1.a)", async () => {
    // Expected: [watcher, victim] is among the offered pairs and the cast is accepted.
    // Actual: friendliness is keyed on OWNER, so the P1-controlled / P2-owned Watcher is not offered.
    const game = await possessed();
    const pairs = pairsOffered(game, P1, "shift");
    expect(pairs).toContainEqual(["watcher", "victim"]);
    await game.p1.cast("shift", { targets: ["watcher", "victim"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["shift"]);
    expect(game.p1.resources()).toEqual({ energy: 14 - 8 - 3, power: { chaos: 0, mind: 0 } });
  });

  test("(a) contrast: the enemy half only offers ENEMY units AT A BATTLEFIELD — never P2's base unit, never P1's own units", async () => {
    const game = await possessed();
    const enemies = new Set(pairsOffered(game, P1, "shift").map((p) => p[1]));
    expect([...enemies]).toEqual(["victim"]);
    const friends = new Set(pairsOffered(game, P1, "shift").map((p) => p[0]));
    expect(friends.has("victim")).toBe(false);
    expect(friends.has("p2Small")).toBe(false);
    expect(friends.has("p1AtBf")).toBe(true);
    expect(friends.has("p1AtBase")).toBe(true);
  });

  // ------------------------------------------------------------------ (b) who replays / where / control

  test.failing("BUG: (b) the Watcher is banished and its OWNER P2 — not P1 — is asked where to play it: P2's base or bf2 (a battlefield P2 controls), never P1's 'home' (124, 127.1, 355.2.a)", async () => {
    // Expected: after Arcane Shift resolves, a destination pick for seat P2 with {base, battlefield-bf2}.
    // Actual: the cast itself is rejected (see (a)).
    const game = await possessed();
    const d = await shiftStolen(game);
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const keys = (d as Extract<Decision, { kind: "pick" }>).options.map((o) => o.key).sort();
    expect(keys).toEqual(["base", "battlefield-bf2"]);
    expect(game.p2.banishment()).toContain("watcher"); // waiting in its owner's banishment meanwhile
  });

  test.failing("BUG: (b)+(c) ordering — by the time P2 is prompted, Arcane Shift has already dealt 3 to the victim and banished itself (354.3)", async () => {
    const game = await possessed();
    const d = await shiftStolen(game);
    expect(d?.seat).toBe(P2);
    expect(game.state("victim").damage).toBe(3);
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.chain()).toEqual([]);
  });

  test.failing("BUG: (b) P2 plays it to bf2 without Accelerate: it arrives exhausted, undamaged, controlled AND owned by P2 — Possession's control change is gone (143.4, 124.1, 191.1)", async () => {
    const game = await possessed();
    await shiftStolen(game);
    await game.p2.pick("battlefield-bf2");
    await game.settle({ policy: declineOptional });
    await game.settle({ policy: "first" });
    const s = game.state("watcher");
    expect(s.zone).toBe("battlefield-bf2");
    expect(s.controller).toBe(P2);
    expect(s.owner).toBe(P2);
    expect(s.damage).toBe(0);
    expect(s.isExhausted).toBe(true);
    expect(game.p2.units("bf2")).toContain("watcher");
    expect(game.p1.units()).not.toContain("watcher");
    // Cost ignored: P2's single energy/mind untouched when Accelerate is declined (356.1.b.1).
    expect(game.p2.resources()).toEqual({ energy: 1, power: { mind: 1 } });
  });

  test.failing("BUG: (b) P2 — the player playing it — may pay Accelerate [1][mind]; then the Watcher enters READY and P2's pool is drained (356.2.b.1)", async () => {
    // Expected: a P2 opt-in for Accelerate around the destination choice; yes ⇒ ready, P2 at 0/0.
    const game = await possessed();
    await shiftStolen(game);
    // Answer P2's prompts: destination bf2, say YES to any optional-cost question.
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || d.seat !== P2 || d.kind === "action") {
        break;
      }
      if (d.kind === "pick") {
        const dest = d.options.find((o) => o.key === "battlefield-bf2") ?? d.options[0];
        await game.p2.answer({ keys: [dest?.key as string], kind: "pick" });
      } else if (d.kind === "yes-no") {
        await game.p2.yes();
      } else {
        break;
      }
      await game.settle();
    }
    await game.settle({ policy: "first" });
    expect(game.state("watcher").zone).toBe("battlefield-bf2");
    expect(game.state("watcher").isReady).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    // P1 never pays for P2's Accelerate.
    expect(game.p1.power("mind")).toBe(0);
  });

  // ------------------------------------------------------------------ (c) whose units the play trigger hits

  test.failing("BUG: (c) the replayed Watcher's 'When you play me' is P2's trigger: ALL of P1's units get -3 Might (min 1); P2's units are untouched (191.3.d)", async () => {
    const game = await possessed();
    await shiftStolen(game);
    await game.p2.pick("base");
    await game.settle({ policy: "first" });
    expect(game.state("p1AtBf").might).toBe(1); // 4 - 3
    expect(game.state("p1AtBase").might).toBe(1); // 4 - 3
    expect(game.state("victim").might).toBe(5);
    expect(game.state("p2Small").might).toBe(2);
    expect(game.state("watcher").might).toBe(7);
  });

  // ------------------------------------------------------------------ (d) contrast: P1's own Watcher

  test("(d) own Watcher: Arcane Shift costs 3 + 1 power; on resolution the Deal 3 lands and the spell banishes itself BEFORE P1 (the owner) is asked where to replay the banished Watcher (354.3)", async () => {
    const game = await ownBoard().build();
    await game.p1.cast("shift", { targets: ["ownWatcher", "victim"] });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0, mind: 0 } });
    const r = await game.settle();
    expect(r.decision).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.zoneOf("ownWatcher")).toBe("banishment");
    expect(game.state("victim").damage).toBe(3);
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.chain()).toEqual([]);
  });

  test("(d) own Watcher: valid destinations are P1's base or a battlefield P1 controls — including 'home', the one it just left — and not P2's bf2 (355.2.a)", async () => {
    const game = await ownBoard().build();
    await game.p1.cast("shift", { targets: ["ownWatcher", "victim"] });
    const r = await game.settle();
    const keys = (r.decision as Extract<Decision, { kind: "pick" }>).options.map((o) => o.key).sort();
    expect(keys).toEqual(["base", "battlefield-home"]);
    await game.p1.pick("battlefield-home");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("ownWatcher")).toBe("battlefield-home");
    expect(game.state("ownWatcher").controller).toBe(P1);
    expect(game.state("ownWatcher").owner).toBe(P1);
  });

  test.failing("BUG: (d) the replayed Watcher is a NEW object: damage cleared, stun cleared, buff gone → plain 7 Might (124.1, 705)", async () => {
    // Expected: 0 damage, not stunned, not buffed, might 7. Actual: it keeps 2 damage, the stun and the buff (8 Might).
    const game = await ownBoard().build();
    await game.p1.cast("shift", { targets: ["ownWatcher", "victim"] });
    await game.settle();
    await game.p1.pick("base");
    await game.settle({ policy: "first" });
    const s = game.state("ownWatcher");
    expect(s.zone).toBe("base");
    expect(s.damage).toBe(0);
    expect(s.isStunned).toBe(false);
    expect(s.isBuffed).toBe(false);
    expect(s.might).toBe(7);
  });

  test("(d) without Accelerate the replayed Watcher enters EXHAUSTED (143.4)", async () => {
    // Expected: exhausted. Actual: it comes back ready for free.
    const game = await ownBoard().build(); // P1 has no [mind] → cannot Accelerate
    await game.p1.cast("shift", { targets: ["ownWatcher", "victim"] });
    await game.settle();
    await game.p1.pick("base");
    await game.settle({ policy: declineOptional });
    await game.settle({ policy: "first" });
    expect(game.state("ownWatcher").isExhausted).toBe(true);
  });

  test.failing("BUG: (d) with a spare [1][mind] P1 is offered Accelerate on the free replay; paying it → enters ready and the [1][mind] is spent (356.2.b.1)", async () => {
    // Expected: an opt-in prompt for P1; yes ⇒ ready, P1 at 1 energy / 0 mind. Actual: no prompt at all.
    const game = await ownBoard({ p1Mind: 1 }).build();
    await game.p1.cast("shift", { targets: ["ownWatcher", "victim"] });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0, mind: 1 } });
    await game.settle();
    let offered = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || d.seat !== P1 || d.kind === "action") {
        break;
      }
      if (d.kind === "yes-no") {
        offered = true;
        await game.p1.yes();
      } else if (d.kind === "pick") {
        const dest = d.options.find((o) => o.key === "base");
        if (!dest) {
          break; // some other prompt (e.g. the play trigger) — leave it to settle below
        }
        await game.p1.answer({ keys: ["base"], kind: "pick" });
      } else {
        break;
      }
      await game.settle();
    }
    await game.settle({ policy: "first" });
    expect(offered).toBe(true);
    expect(game.state("ownWatcher").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0, mind: 0 } });
  });

  test("(d) its 'When you play me' fires again under P1 and hits ALL of P2's units: p2Small 2→1 (minimum 1) and victim 5→2 — which, already carrying Arcane Shift's 3 damage, now has lethal damage and dies; P1's units untouched", async () => {
    // Expected: no choice — every enemy unit is affected. Actual: the engine asks P1 to pick ONE enemy unit
    // (we name the victim, so it does die, but p2Small keeps its 2 Might).
    const game = await ownBoard().build();
    await game.p1.cast("shift", { targets: ["ownWatcher", "victim"] });
    await game.settle();
    await game.p1.pick("base");
    await game.settle({ policy: pickVictimIfAsked });
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("p2Small").might).toBe(1);
    expect(game.state("p1AtBase").might).toBe(4);
    expect(game.state("ownWatcher").controller).toBe(P1);
  });

  test("(d) the trigger's -3 Might is applied after Arcane Shift's Deal 3: the 5-Might victim (3 damage) drops to 2 Might and is cleaned up as dead", async () => {
    const game = await ownBoard().build();
    await game.p1.cast("shift", { targets: ["ownWatcher", "victim"] });
    await game.settle();
    expect(game.state("victim")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bf2" });
    await game.p1.pick("base");
    await game.settle({ policy: pickVictimIfAsked });
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.units("bf2")).toEqual([]);
  });
});

/**
 * Relentless Pursuit — sfd-184-221 · Spell · Fury/Body · 2 energy + [rainbow] · [Action]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Move a friendly unit. You may attach an Equipment with the same controller to it. This turn,
 *   that unit has "When I conquer, you may move me to my base."
 *
 * Head-judge checklist for this card:
 *  1. Three clauses, one target: (a) MOVE a friendly unit (an effect move — the controller picks the
 *     destination, base ↔ battlefield; moving into an enemy battlefield stages a combat fought once
 *     the spell has resolved), (b) optionally ATTACH an Equipment P1 controls to it (an effect attach,
 *     434 — no Equip cost is paid, +Might bonus applies, 434.4.a "not a Move"), (c) a turn-scoped
 *     granted trigger "When I conquer, you may move me to my base" (optional; expires at end of turn).
 *  2. [Action] timing: own turn in an open state, or with Focus in a showdown — the classic use is
 *     pulling a base unit INTO a battlefield under attack on the opponent's turn so it defends.
 *  3. Targeting: friendly units only; an enemy unit is never a legal target. Equipment: only P1's;
 *     none available → no attach prompt at all.
 *  4. Hit-and-run: move in, win, conquer (+1 point), take the "you may" → the unit is home in base and
 *     the freshly conquered battlefield is left empty (P1 loses control at the next cleanup, 190.4.c)
 *     but the point stays.
 *  5. Cost: 2 energy + 1 power of ANY domain ([rainbow], engine: paid from power.rainbow); → trash.
 *  6. Same-domain partner: Harpoon Squad-style "when I move" units trigger off this effect move too
 *     (covered in sfd-137-221); here we pair it with B.F. Sword (+3 Equipment) for the attach clause.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game, Policy } from "../../harness";
import { P1, P2, passivePolicy, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-184-221";
const BF_SWORD = "sfd-161-221"; // Equipment · Order · +3 Might · [Equip] [order]
const COST = { energy: 2, power: { rainbow: 1 } } as const;

/** P1's turn: runner (3) + bystander in base, P2 holds bf1 with a 2-Might guard, bf2 open, unattached Sword in P1's base. */
function board() {
  return scenario()
    .resources(P1, COST)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .unit(P1, "base", { might: 1, name: "Bystander" }, "bystander")
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 4, name: "Reserve" }, "reserve")
    .gear(P1, BF_SWORD, "sword")
    .hand(P1, CARD, "rp");
}

/** Cast on `unit`, resolve, and send it to `dest` ("base" | "battlefield-bfN"). Leaves any follow-up prompt pending. */
async function pursue(game: Game, unit: string, dest: string): Promise<void> {
  await game.p1.cast("rp", { targets: unit });
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick(dest);
}

/** Say no to every optional prompt of P1's (attach / move-home), pass everything else. */
const declineOptional: Policy = (d, g) =>
  d.kind === "yes-no" ? false : d.kind === "pick" && d.allowDecline ? "decline" : d.kind === "pick" ? d.options[0]?.key : passivePolicy(d, g);

/** Settle declining optional riders, and settle once more if an auto-begun non-combat showdown (344.2) was handed back. */
async function drain(game: Game): Promise<void> {
  await game.settle({ policy: declineOptional });
  await game.settle({ policy: declineOptional });
}

/** Accept whatever shape the optional-attach prompt takes (yes/no then pick, or a declinable pick). */
async function acceptAttach(game: Game, equipment: string): Promise<void> {
  const d = game.decision();
  if (d?.kind === "yes-no" && d.seat === P1) {
    await game.p1.yes();
  }
  const p = game.decision();
  if (p?.kind === "pick" && p.seat === P1) {
    await game.p1.pick(equipment);
  }
}

describe("Relentless Pursuit (sfd-184-221)", () => {
  test("registry payload carries all three clauses — move friendly unit + optional attach-Equipment + this-turn granted 'When I conquer, you may move me to my base'", async () => {
    await board().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: ["fury", "body"], energyCost: 2, name: "Relentless Pursuit", powerCost: ["rainbow"], timing: "action" });
    const abilities = (def?.abilities ?? []) as { type: string; timing?: string; effect?: unknown }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ timing: "action", type: "spell" });
    const text = JSON.stringify(abilities[0]?.effect);
    expect(text).toContain('"type":"move"');
    expect(text).toContain('"controller":"friendly"');
    expect(text).toMatch(/attach/i);
    expect(text).toMatch(/equipment/i);
    expect(text).toMatch(/conquer/i);
    expect(text).toMatch(/"duration":"turn"/);
  });

  test("cost: 2 energy + 1 [rainbow]; the spell resolves to the trash; missing either resource → not castable", async () => {
    const game = await board().build();
    await game.p1.cast("rp", { targets: "runner" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("rp")).toBe("chain");
    await game.settle();
    await game.p1.pick("battlefield-bf2");
    await drain(game);
    expect(game.zoneOf("rp")).toBe("trash");
    expect((await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 1 }, "u").hand(P1, CARD, "x").build()).p1.can("cast", "x")).toBe(false);
    expect((await scenario().resources(P1, { energy: 1, power: { rainbow: 1 } }).unit(P1, "base", { might: 1 }, "u").hand(P1, CARD, "x").build()).p1.can("cast", "x")).toBe(false);
  });

  test("targets: FRIENDLY units only (runner, bystander) — the enemy Guard/Reserve are never offered", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "rp")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["runner"], ["bystander"]]));
    const bad = await game.p1.try((p) => p.cast("rp", { targets: "guard" }));
    expect(!bad.ok && bad.error.code).toBe("ILLEGAL_ARGS");
    const none = await scenario().resources(P1, COST).unit(P2, "base", { might: 1 }, "foe").hand(P1, CARD, "x").build();
    expect(none.p1.can("cast", "x")).toBe(false);
  });

  test("clause 1 — Move: base → open bf2; the runner arrives (not exhausted — an effect move has no exhaust cost) and P1 takes the empty battlefield", async () => {
    const game = await board().build();
    await pursue(game, "runner", "battlefield-bf2");
    await drain(game); // the empty battlefield opens a non-combat showdown; everyone passes
    expect(game.locationOf("runner")).toBe("bf2");
    expect(game.state("runner").isReady).toBe(true);
    expect(game.locationOf("bystander")).toBe("base");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("clause 1 — Move works battlefield → base too (destinations include the base)", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", { might: 3, name: "Runner" }, "runner")
      .hand(P1, CARD, "rp")
      .build();
    await game.p1.cast("rp", { targets: "runner" });
    await game.settle();
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toContain("base");
    expect(keys).toContain("battlefield-bf2");
    expect(keys).not.toContain("battlefield-bf1"); // not where it already is
    await game.p1.pick("base");
    await drain(game);
    expect(game.locationOf("runner")).toBe("base");
  });

  test("clause 1 — moving into the enemy-held bf1 stages a combat after resolution: Runner (3) kills Guard (2) and conquers (+1 point)", async () => {
    const game = await board().build();
    await pursue(game, "runner", "battlefield-bf1");
    // Decline anything optional (attach / move-home) so only the move + combat are exercised.
    await game.settle();
    while (game.decision()?.seat === P1 && (game.decision()?.kind === "yes-no" || game.decision()?.kind === "pick")) {
      await (game.decision()?.kind === "yes-no" ? game.p1.no() : game.p1.decline());
      await game.settle();
    }
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("clause 2 — 'you may attach an Equipment with the same controller': after the move P1 is offered the Sword; accepting attaches it for free (+3 → 6 Might, no [order] paid)", async () => {
    // An optional prompt naming "sword"; afterwards sword.attachedTo === runner, runner might 6, and P1's
    // pool is untouched beyond the spell's own cost (an effect attach pays no [Equip] cost, 434).
    const game = await board().build();
    await pursue(game, "runner", "battlefield-bf2");
    // rule 355.4: the destination was chosen as the spell was played; the spell still has to resolve
    // before the attach clause executes — pass the chain priority window rather than settling past it.
    await game.acting().passPriority();
    await game.acting().passPriority();
    const d = game.decision();
    expect(d?.seat === P1 && (d.kind === "yes-no" || d.kind === "pick")).toBe(true);
    await acceptAttach(game, "sword");
    await game.settle({ policy: "first" });
    expect(game.state("sword").attachedTo).toBe("runner");
    expect(game.state("runner").attachments).toContain("sword");
    expect(game.state("runner").might).toBe(6);
    expect(game.locationOf("sword")).toBe("bf2"); // 434.4: an attached card is where its unit is
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("clause 2 is optional and scoped — declining leaves the Sword in base; an OPPONENT's Equipment is never offered", async () => {
    // The prompt lists only P1's "sword" (not P2's "theirs"); declining keeps everything as is.
    const game = await board().gear(P2, BF_SWORD, "theirs").build();
    await pursue(game, "runner", "battlefield-bf2");
    // rule 355.4: destination chosen at play; resolve the chain item before the attach clause
    await game.acting().passPriority();
    await game.acting().passPriority();
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    if (d?.kind === "yes-no") {
      await game.p1.yes();
    }
    const p = game.decision();
    expect(p?.kind).toBe("pick");
    const cards = p?.kind === "pick" ? p.options.map((o) => o.card ?? o.key) : [];
    expect(cards).toContain("sword");
    expect(cards).not.toContain("theirs");
    expect(p?.kind === "pick" && p.allowDecline).toBe(true);
    await game.p1.decline();
    await game.settle({ policy: "first" });
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.locationOf("sword")).toBe("base");
    expect(game.state("runner").might).toBe(3);
  });

  test("clause 2 — with NO Equipment under P1's control there is nothing to attach: move resolves straight through, no prompt", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", { might: 2 }, "guard")
      .unit(P1, "base", { might: 3 }, "runner")
      .gear(P2, BF_SWORD, "theirs")
      .hand(P1, CARD, "rp")
      .build();
    await pursue(game, "runner", "battlefield-bf2");
    // No equipment pick may appear; taking the empty bf2 is a conquer (469.1) so
    // the granted "you may move me home" offer legitimately does — decline it.
    const first = await game.settle();
    const second = first.reason === "open" && game.decision()?.kind === "action" && (game.decision() as ActionDecision).context !== "main" ? await game.settle() : first;
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    } else {
      expect(second.reason).toBe("open");
    }
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("runner")).toBe("bf2");
    expect(game.state("theirs").attachedTo).toBeUndefined();
  });

  test("clause 3 — 'This turn, that unit has \"When I conquer, you may move me to my base\"': after Runner conquers bf1 P1 is asked and may send it home (point kept, bf1 left empty)", async () => {
    // Conquer → optional granted trigger for P1 → yes → runner back in base, P1 still on 1 point.
    const game = await board().build();
    await pursue(game, "runner", "battlefield-bf1");
    // Skip the (also missing) attach step if it ever appears, then fight.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.seat === P1 && d.kind === "pick" && d.allowDecline) {
        await game.p1.decline();
      } else if (d?.seat === P1 && d.kind === "yes-no" && game.zoneOf("guard") !== "trash") {
        await game.p1.no();
      } else if (d?.kind === "action" && (d as ActionDecision).context !== "main") {
        await game.settle();
      } else {
        break;
      }
    }
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    // Now the granted conquer trigger must be asking.
    const ask = game.decision();
    expect(ask).toMatchObject({ seat: P1 });
    expect(ask?.kind === "yes-no" || ask?.kind === "pick").toBe(true);
    await (ask?.kind === "yes-no" ? game.p1.yes() : game.p1.pick("base"));
    await game.settle();
    expect(game.locationOf("runner")).toBe("base");
    expect(game.p1.points()).toBe(1);
  });

  test("clause 3 says 'When I conquer' with no 'after an attack' — taking the EMPTY bf2 is a conquer too (469.1, cf. Plundering Poro), so the move-home offer must appear; declining keeps the Runner there", async () => {
    // Expected: after the Runner walks onto open bf2 and P1 scores it, P1 gets the optional "move me to my base"
    // prompt (we decline → Runner stays, 1 point). Actual: the granted trigger is gated on conquer-after-attack.
    const game = await board().build();
    await pursue(game, "runner", "battlefield-bf2");
    let offered = false;
    const watch: Policy = (d) => {
      if (d.seat === P1 && game.gameState.battlefields.bf2?.controller === P1 && (d.kind === "yes-no" || (d.kind === "pick" && d.allowDecline))) {
        offered = true;
      }
      return declineOptional(d, game);
    };
    await game.settle({ policy: watch });
    await game.settle({ policy: watch });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(offered).toBe(true);
    expect(game.locationOf("runner")).toBe("bf2");
  });

  test("clause 3 is 'this turn' only: the Pursued Runner (given Ganking) parks on empty bf2, and when it ganks into bf1 and conquers on P1's NEXT turn nobody is asked anything", async () => {
    const game = await board().unit(P1, "base", { might: 3, name: "Striker" }, "striker", { grantedKeywords: [{ duration: "permanent", keyword: "Ganking" }] }).build();
    await pursue(game, "striker", "battlefield-bf2");
    await drain(game); // decline attach / any same-turn move-home offer
    expect(game.locationOf("striker")).toBe("bf2");
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    await game.p1.gank("striker", "bf1");
    const stop = await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(stop.reason).toBe("open"); // the grant expired with the turn it was given in
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("striker")).toBe("bf1");
  });

  test("[Action] timing: not castable on the opponent's turn in an open state", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "rp")).toBe(false);
  });

  test("[Action] in a showdown on the opponent's turn: P2's Reserve (4) attacks P1's bf; with Focus P1 Pursues Runner (3) in as a second defender → 2+3 kill the Reserve, bf held", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, COST)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .unit(P2, "base", { might: 4, name: "Reserve" }, "reserve")
      .hand(P1, CARD, "rp")
      .build();
    await game.p2.move("reserve", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "rp")).toBe(true);
    await game.p1.cast("rp", { targets: "runner" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf1");
    }
    await game.settle({ policy: (d) => (d.kind === "yes-no" ? false : d.kind === "pick" && d.allowDecline ? "decline" : undefined) });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("reserve")).toBe("trash"); // 2 + 3 = 5 ≥ 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    // Reserve's 4 must be assigned lethally in order: Sentry (2) dies, Runner takes 2 and survives.
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.locationOf("runner")).toBe("bf1");
  });
});

/**
 * Loyal Pup — sfd-126-221 · Unit · Chaos · 3 energy · 3 Might
 *
 *   When you defend at a battlefield, you may move me there.
 *
 * Rules: 383.4.f ("When you defend" = Defend Trigger: fires when the PLAYER gains the Defender
 * designation for the first time in a combat), 383.4.f.2.a (checked once per combat, however many
 * units defend), 464.2.c.2 (the Defender is the player who did NOT apply Contested — designations
 * exist only in a combat, never in a Non-Combat Showdown), 464.2.c.3.a (a unit that becomes
 * present at the combat battlefield later gains its controller's designation at the next Cleanup →
 * the Pup fights), 359.3.f.3 ("there" = the battlefield from the trigger condition), effect moves
 * are not the Standard Move (no exhaust cost, no Ganking needed battlefield→battlefield), 365.1-style
 * zone rule: a unit's trigger works only from the board. The "you may" is decided by P1 either as
 * the item is put on the chain or as it resolves — the tests accept both orderings.
 *
 * Head-judge corner cases considered:
 *   - the marquee line: Pup in base, your other unit is attacked → Pup jumps in and swings the
 *     combat (2+3 defenders vs a 4-Might attacker);
 *   - "you may": declining leaves everything as a normal combat;
 *   - exhausted Pup still comes (it is moved, it does not Move-as-an-action); a ready Pup stays ready;
 *   - Pup at ANOTHER battlefield hops battlefield→battlefield; Pup already there: harmless no-op;
 *   - negative space: YOU attacking is the opponent defending — no trigger; a walk-in on your empty
 *     battlefield is a Non-Combat Showdown — no Defender, no trigger; Pup in hand — no trigger;
 *   - two of your units defend at once → still ONE trigger (once per combat); but a second combat
 *     at another battlefield the same turn triggers it again.
 */

import { describe, expect, test } from "bun:test";
import type { Game, Policy } from "../../harness";
import { P1, P2, loadDefaultCardPool, passivePolicy, scenario } from "../../harness";

const CARD = "sfd-126-221";

/** P2 to act; P1 holds bf1 with a 2-Might Holder; P2 has a Raider in base; Pup placed by the caller. */
function siege(raiderMight = 4) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: raiderMight, name: "Raider" }, "raider");
}

/** settle() policy that also answers every "you may" with `accept` and counts how often it was asked. */
function answering(accept: boolean, seen = { prompts: 0 }): Policy {
  return (d, g) => {
    if (d.kind === "yes-no") {
      seen.prompts += 1;
      return { kind: "yes-no", value: accept };
    }
    return passivePolicy(d, g);
  };
}

/**
 * Drive the Pup's chain item(s) to resolution — pass priority for both seats and answer P1's
 * "you may" with `accept` whenever it is asked — but stop before anybody passes Focus, so the
 * combat is still open afterwards. Returns how many times P1 was asked.
 */
async function resolveTrigger(game: Game, accept: boolean): Promise<number> {
  let prompts = 0;
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      prompts += 1;
      await (accept ? game.p1.yes() : game.p1.no());
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return prompts;
}

const pupItems = (game: Game) => game.chain().filter((c) => c.cardId === "pup").length;

describe("Loyal Pup (sfd-126-221)", () => {
  test("costs 3 energy; a 3-Might Chaos unit that enters exhausted; unaffordable at 2", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "pup").build();
    await game.p1.play("pup", { to: "base" });
    await game.settle();
    expect(game.zoneOf("pup")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("pup")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.state("pup").domains).toEqual(["chaos"]);
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "pup").build()).p1.can("play", "pup")).toBe(false);
  });

  test("when the opponent attacks your unit at bf1, the Pup (in base) triggers: one P1-controlled item on the chain, and P1 is asked 'you may' exactly once", async () => {
    const game = await siege().unit(P1, "base", CARD, "pup").build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pup", controller: P1, triggered: true })]);
    expect(game.state("holder").combatRole).toBe("defender");
    expect(game.zoneOf("pup")).toBe("base"); // nothing moves before it resolves
    expect(await resolveTrigger(game, false)).toBe(1);
    expect(pupItems(game)).toBe(0);
  });

  test("accepting moves the Pup from base to THAT battlefield, where it becomes a defender and swings the combat (4 vs 2+3 → Raider dies, P1 keeps bf1)", async () => {
    const game = await siege().unit(P1, "base", CARD, "pup").build();
    await game.p2.move("raider", "bf1");
    await resolveTrigger(game, true);
    expect(game.zoneOf("pup")).toBe("battlefield-bf1");
    expect(game.state("pup").combatRole).toBe("defender"); // gained at the Cleanup after arriving (464.2.c.3.a)
    expect(game.state("pup").isReady).toBe(true); // moved by an effect, not exhausted
    await game.settle({ policy: answering(true) });
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("pup")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("'you may': declining leaves the Pup home — Holder dies alone and the Raider conquers bf1", async () => {
    const game = await siege().unit(P1, "base", CARD, "pup").build();
    await game.p2.move("raider", "bf1");
    expect(await resolveTrigger(game, false)).toBe(1);
    await game.settle({ policy: answering(false) });
    expect(game.zoneOf("pup")).toBe("base");
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("an EXHAUSTED Pup is still moved there (being moved is not the Standard Move — no ready requirement, no exhaust cost)", async () => {
    const game = await siege().unit(P1, "base", CARD, "pup", { exhausted: true }).build();
    await game.p2.move("raider", "bf1");
    expect(pupItems(game)).toBe(1); // it does trigger
    await resolveTrigger(game, true);
    expect(game.zoneOf("pup")).toBe("battlefield-bf1");
    expect(game.state("pup").isExhausted).toBe(true);
  });

  test("a ready Pup at ANOTHER battlefield (bf2) hops straight to bf1 and stays ready", async () => {
    const game = await siege().unit(P1, "bf2", CARD, "pup").build();
    await game.p2.move("raider", "bf1");
    await resolveTrigger(game, true);
    expect(game.zoneOf("pup")).toBe("battlefield-bf1");
    expect(game.state("pup").isReady).toBe(true);
    expect(game.p1.units("bf2")).toEqual([]);
  });

  test("Pup already AT the attacked battlefield: it defends itself, accepting is a harmless no-op, and 3+2 defenders kill the 4-Might Raider", async () => {
    const game = await siege().unit(P1, "bf1", CARD, "pup").build();
    await game.p2.move("raider", "bf1");
    expect(game.state("pup").combatRole).toBe("defender");
    expect(pupItems(game)).toBe(1); // Holder + Pup defend → still one "you defend"
    await game.settle({ policy: answering(true) });
    expect(game.locationOf("pup")).toBe("bf1");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space — when YOU attack, the opponent is the defender: the Pup must not trigger at all", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Their Holder" }, "theirs")
      .unit(P1, "base", CARD, "pup")
      .unit(P1, "base", { might: 4, name: "My Raider" }, "mine")
      .build();
    await game.p1.move("mine", "bf1");
    expect(pupItems(game)).toBe(0);
    const seen = { prompts: 0 };
    await game.settle({ policy: answering(false, seen) });
    expect(seen.prompts).toBe(0);
    expect(game.zoneOf("pup")).toBe("base");
    expect(game.zoneOf("theirs")).toBe("trash");
  });

  test("negative space — a walk-in on your EMPTY battlefield is a Non-Combat Showdown: nobody defends, no trigger, P2 conquers bf2", async () => {
    const game = await siege().unit(P1, "base", CARD, "pup").build();
    await game.p2.move("raider", "bf2");
    expect(pupItems(game)).toBe(0);
    const seen = { prompts: 0 };
    await game.settle({ policy: answering(false, seen) });
    await game.settle({ policy: answering(false, seen) }); // a handed-back auto showdown, if any
    expect(seen.prompts).toBe(0);
    expect(game.zoneOf("pup")).toBe("base");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  test("negative space — a Pup in HAND is not on the board: your unit being attacked puts nothing on the chain", async () => {
    const game = await siege().hand(P1, CARD, "pup").build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([]);
    const seen = { prompts: 0 };
    await game.settle({ policy: answering(true, seen) });
    expect(seen.prompts).toBe(0);
    expect(game.zoneOf("pup")).toBe("hand");
    expect(game.zoneOf("holder")).toBe("trash");
  });

  test("383.4.f.2.a — two of your units defending in the same combat is still ONE 'you defend' → exactly one Pup trigger and one prompt", async () => {
    const game = await siege(6).unit(P1, "bf1", { might: 1, name: "Second" }, "second").unit(P1, "base", CARD, "pup").build();
    await game.p2.move("raider", "bf1");
    expect(pupItems(game)).toBe(1);
    expect(await resolveTrigger(game, true)).toBe(1);
    expect(pupItems(game)).toBe(0);
    // and no further prompt for the same combat (the Pup arriving is not a new "you defend")
    const seen = { prompts: 0 };
    await game.settle({ policy: answering(true, seen) });
    expect(seen.prompts).toBe(0);
    expect(game.zoneOf("raider")).toBe("trash"); // 2+1+3 defending Might ≥ 6
  });

  test("the trigger is per combat, not per turn: declined in combat #1 at bf1, it is offered again when a second attacker hits bf2 later this turn", async () => {
    const game = await siege()
      .unit(P1, "bf2", { might: 2, name: "Holder2" }, "holder2")
      .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
      .unit(P1, "base", CARD, "pup")
      .build();
    await game.p2.move("raider", "bf1");
    expect(pupItems(game)).toBe(1);
    expect(await resolveTrigger(game, false)).toBe(1);
    await game.settle({ policy: answering(false) });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    await game.p2.move("scout", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pup", triggered: true })]);
    expect(await resolveTrigger(game, false)).toBe(1);
    await game.settle({ policy: answering(false) });
    expect(game.zoneOf("pup")).toBe("base");
    expect(game.zoneOf("scout")).toBe("trash"); // 1 vs 2
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("registry payload: one optional triggered ability — defend, scoped to the controller ('you'), moving SELF", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 3, might: 3, name: "Loyal Pup" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const a = def?.abilities?.[0] as { type: string; optional?: boolean; trigger: Record<string, unknown>; effect: Record<string, unknown> };
    expect(a).toMatchObject({ optional: true, trigger: { event: "defend", on: "controller" }, type: "triggered" });
    expect(a.effect).toMatchObject({ target: "self", type: "move" });
  });

  test("registry payload — 'move me THERE' must point at the battlefield being defended (trigger location), not 'here' (the Pup's own location)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    const to = (def?.abilities?.[0] as { effect: { to?: unknown } }).effect.to;
    expect(to).toBeDefined();
    expect(to).not.toBe("here");
    expect(to).not.toBe("base");
  });
});

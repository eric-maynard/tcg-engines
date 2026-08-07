/**
 * Iascylla — unl-050-219 · Unit · Calm · 7 energy + 1 [calm] · 6 Might
 *
 *   When I hold, at the start of your next Main Phase, you may move an enemy unit to this battlefield.
 *
 * Rules: 469.2 / 315.2.b (Hold: the TURN player keeps control of a battlefield in their Scoring Step and
 * scores 1), 383.4.d.2.a (a unit's Hold effect triggers only if the unit is AT the held battlefield and
 * goes on the chain), 390.2 / 392 (a delayed trigger fires at its stated time, independent of its
 * source), 316.3-316.4 (start-of-Main-Phase effects happen after channel + draw and after pools empty),
 * 359.3.f.3.b (Iascylla by name: "this battlefield" = the battlefield she held), 383.3.a ("you may" →
 * optional), 316.7.a + 464.2.c.1 (an enemy unit arriving at your battlefield starts a combat in which
 * ITS controller is the attacker), 143.4-ish enter exhausted.
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. Timing: the hold trigger itself resolves in the Beginning Phase, but the CHOICE and the MOVE
 *      belong to the start of the Main Phase — after 2 runes were channeled and a card drawn.
 *   2. Only when SHE holds: Iascylla in base while another unit holds → nothing; the opponent's turn
 *      start → nothing (only the turn player holds); no enemy units → nothing hangs.
 *   3. Target menu: ENEMY units only, from anywhere (base or another battlefield) — never Iascylla or a
 *      friendly unit. "You may": declining moves nobody and leaves a normal main phase.
 *   4. The payoff: the dragged-in unit contests her battlefield, a combat follows with the enemy as the
 *      attacker, and a 3-Might victim dies to her 6 while P1 keeps the battlefield and the hold point.
 *   5. Cost: 7 + [calm]; 7 alone or 6 + [calm] is not enough; enters exhausted; playing her triggers nothing.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, passivePolicy, scenario } from "../../harness";

const CARD = "unl-050-219";

/** P2 is about to end their turn; P1 controls bf1 with Iascylla on it; P2 has Home (base, 3) and Far (bf2, 2). */
function holding() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", CARD, "ias")
    .unit(P1, "base", { might: 2, name: "Friend" }, "friend")
    .unit(P2, "base", { might: 3, name: "Home" }, "home")
    .unit(P2, "bf2", { might: 2, name: "Far" }, "far");
}

/** From P2's open main phase: P2 ends the turn, then pass/auto-step until P1 faces a real prompt (or P1's open main phase). */
async function toHoldPrompt(game: Game): Promise<Decision | null> {
  await game.p2.endTurn();
  const r = await game.settle();
  return r.reason === "unanswered" ? r.decision : null;
}

const offeredCards = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card).filter(Boolean).sort() : []);

/** settle() policy: pass priority as usual, answer Iascylla's "you may" with `use`, decline any target pick. */
const answering = (use: boolean) => (d: Decision, g: Game) =>
  d.kind === "yes-no" ? ({ kind: "yes-no", value: use } as const) : d.kind === "pick" && d.seat === P1 ? ({ kind: "decline" } as const) : passivePolicy(d, g);

/** If the engine staged the resulting combat as a turn-player option rather than opening it in Cleanup, open it. */
async function fight(game: Game, bf = "bf1") {
  await game.settle();
  if (game.p1.can("startShowdown")) {
    await game.p1.choose(`startShowdown:${bf}`);
  }
  await game.settle();
}

describe("Iascylla (unl-050-219)", () => {
  // Expected: a hold trigger (on self) whose effect is a DELAYED, optional "move an enemy unit to here"
  // scheduled for the start of the controller's next Main Phase. Actual: the payload is an immediate
  // optional move on hold — the "at the start of your next Main Phase" clause is not represented at all.
  test("parsed abilities keep the 'at the start of your next Main Phase' delay on the hold trigger (390.2)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 7, might: 6, name: "Iascylla", powerCost: ["calm"] });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({ trigger: { event: "hold", on: "self" }, type: "triggered" });
    const text = JSON.stringify(def?.abilities?.[0]);
    expect(text).toContain('"controller":"enemy"');
    expect(text).toContain('"type":"move"');
    expect(text).toMatch(/optional/);
    expect(text).toMatch(/main/i); // some marker of the delayed "start of your next Main Phase" timing
  });

  test("cost: 7 energy + 1 calm, enters exhausted, and PLAYING her triggers nothing; 7 without calm or 6 + calm is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { calm: 1 } }).unit(P2, "base", { might: 3 }, "home").hand(P1, CARD, "ias").build();
    await game.p1.play("ias");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("ias")).toMatchObject({ isExhausted: true, might: 6, zone: "base" });
    expect(game.zoneOf("home")).toBe("base");
    expect((await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "ias").build()).p1.can("play", "ias")).toBe(false);
    expect((await scenario().resources(P1, { energy: 6, power: { calm: 1 } }).hand(P1, CARD, "ias").build()).p1.can("play", "ias")).toBe(false);
  });

  test("When I hold: as P1's turn begins the hold trigger goes on the chain in the Beginning Phase and P1 scores the hold point", async () => {
    const game = await holding().build();
    expect(game.p1.points()).toBe(0);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ias", controller: P1, triggered: true })]);
    await game.settle({ policy: answering(false) });
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("the choice offers ENEMY units only — Home (base) and Far (other battlefield) — never Iascylla or a friendly unit", async () => {
    const game = await holding().build();
    const d = await toHoldPrompt(game);
    expect(d).not.toBeNull();
    expect(d?.seat).toBe(P1);
    if (d?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(offeredCards(game.decision())).toEqual(["far", "home"]);
  });

  test("'you may': declining moves nobody, leaves P1 in an ordinary open main phase with the hold point, and nothing re-prompts on P2's next turn", async () => {
    const game = await holding().build();
    const d = await toHoldPrompt(game);
    expect(d?.seat).toBe(P1);
    await (d?.kind === "yes-no" ? game.p1.no() : game.p1.decline());
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("home")).toBe("base");
    expect(game.zoneOf("far")).toBe("battlefield-bf2");
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("home")).toBe("base");
  });

  test("the payoff: drag Home (3) to bf1 — it arrives as the ATTACKER, dies to Iascylla's 6, she survives, P1 keeps bf1 and the point; Far is untouched", async () => {
    const game = await holding().build();
    const d = await toHoldPrompt(game);
    if (d?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    expect(game.decision()?.kind).toBe("pick");
    await game.p1.pick("home");
    // Home now stands at bf1, still P2's (moved, not stolen), contesting P1's battlefield as the attacker.
    expect(game.state("home")).toMatchObject({ controller: P2, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    if (game.state("home").combatRole !== null) {
      expect(game.state("home").combatRole).toBe("attacker");
    }
    await fight(game);
    expect(game.zoneOf("home")).toBe("trash");
    expect(game.state("ias")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // 3 < 6, healed after combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("far")).toBe("battlefield-bf2");
    expect(game.p1.points()).toBe(1); // hold point only — defending is not conquering
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });

  test("picking Far pulls the lone unit off P2's battlefield: it fights at bf1 and dies (2 vs 6), and P2 — with no unit left at bf2 — loses control of it (190.4.c)", async () => {
    const game = await holding().build();
    const d = await toHoldPrompt(game);
    if (d?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
    }
    await game.p1.pick("far");
    await fight(game);
    expect(game.zoneOf("far")).toBe("trash");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.p2.units("bf2")).toEqual([]);
    expect(game.gameState.battlefields.bf2?.controller ?? null).toBeNull();
    expect(game.zoneOf("ias")).toBe("battlefield-bf1");
  });

  // Expected (316.3-316.4, 390.2): the hold trigger resolves in the Beginning Phase WITHOUT asking
  // anything; the "you may move" decision is raised at the start of the Main Phase — i.e. only once the
  // phase reads "main", after P1 channeled 2 runes and drew 1. Actual: the prompt is raised while the
  // hold trigger resolves, still in the Beginning Phase with nothing channeled or drawn yet.
  test("the move choice belongs to the start of P1's next Main Phase (after channel + draw), not to the Beginning Phase (316.4, 390.2)", async () => {
    const game = await holding().build();
    const handBefore = game.p1.hand().length;
    const d = await toHoldPrompt(game);
    expect(d?.seat).toBe(P1);
    expect(["pick", "yes-no"]).toContain(d?.kind);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.p1.points()).toBe(1); // scoring already happened in the Beginning Phase
  });

  test("only when SHE holds: Iascylla in the base while a plain unit holds bf1 → the point is scored but no prompt and no chain item from her", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Grunt" }, "grunt")
      .unit(P1, "base", CARD, "ias")
      .unit(P2, "base", { might: 3, name: "Home" }, "home")
      .build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("home")).toBe("base");
  });

  test("only YOUR hold: when the OPPONENT's turn begins with Iascylla sitting on P1's battlefield, nobody is prompted and nothing moves", async () => {
    const game = await holding().active(P1).turn(3).build();
    await game.p1.endTurn();
    expect(game.chain()).toEqual([]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("home")).toBe("base");
    expect(game.zoneOf("far")).toBe("battlefield-bf2");
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(1); // P2 held bf2 with Far — an ordinary hold, no Iascylla text involved
  });

  test("no enemy units anywhere: the hold still scores, the trigger has nothing to offer, and P1 lands in a normal main phase with nothing pending", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "ias").build();
    await game.p2.endTurn();
    const r = await game.settle({ policy: answering(true) }); // even saying "yes" must not strand a target-less prompt
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
  });
});

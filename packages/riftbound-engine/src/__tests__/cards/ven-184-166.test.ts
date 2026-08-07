/**
 * Leona, Determined — ven-184-166 · Champion Unit (Leona) · Order · 4 energy + [order] · 4 Might
 *
 *   [Shield] (+1 [Might] while I'm a defender.)
 *   When I attack, stun an enemy unit here. (It doesn't deal combat damage this turn.)
 *
 * Rules: 814.1.b.3/c (Shield with X omitted = 1; +X Might only while a DEFENDER), 383.4.e (attack
 * trigger: fires when she gains the Attacker designation in a combat — a triggered chain item; not
 * when defending, not when walking onto an undefended battlefield), 423.1 (stun: binary, a stunned
 * unit contributes no Might to combat damage but still needs full lethal to die, cleared at end of
 * turn; choosing an already-stunned unit is legal and does nothing), 809 (Deflect taxes ABILITIES
 * too — a mandatory extra power per choice, any domain), "here" = Leona's battlefield only.
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. The stun resolves INSIDE the combat showdown before damage: Leona (4, no Shield on offence)
 *     into a lone 4-Might defender takes 0 back, kills it and conquers; into a lone 5 she takes 0,
 *     deals 4 (< 5), nobody dies and she is sent home — one short.
 *  2. Two defenders: only the chosen one is silenced; the other still hits her.
 *  3. "enemy unit HERE": enemy units at another battlefield or in a base are never offered.
 *  4. Deflect defender: with no floating power it cannot be chosen (lone Deflect unit → no stun at
 *     all); with 1 power of any domain it can, and the pip is spent.
 *  5. Negative space: defending Leona triggers nothing (but has 5 Might via Shield); moving onto an
 *     EMPTY enemy battlefield is not an attack; the stun she hands out expires at end of turn.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-184-166";
const POUTY_PORO = "ogn-013-298"; // 2-Might unit with printed [Deflect]

/** Pass chain priority around until Leona's trigger asks for its target (or the chain is gone). */
async function toTargetPrompt(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action") {
      return d;
    }
    if (d.context !== "chain") {
      return d;
    }
    await game.seat(d.seat).passPriority();
  }
  return game.decision();
}

function attackInto(defenders: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) {
  return defenders(scenario().battlefield("bf1", { controller: P2 }).battlefield("bf2", { controller: P2 })).unit(P1, "base", CARD, "leona");
}

describe("Leona, Determined (ven-184-166)", () => {
  test("registry payload: Shield (value 1) keyword + an attack-self trigger that stuns an enemy unit here; 4 energy + [order], 4 Might, champion Leona", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 4, isChampion: true, might: 4, name: "Leona, Determined", powerCost: ["order"], tags: ["Leona"] });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ keyword: "Shield", type: "keyword", value: 1 });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: { target: { controller: "enemy", location: "here", type: "unit" }, type: "stun" },
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    });
  });

  test("cost: 4 energy + 1 order; enters the base exhausted with the Shield keyword at 4 Might; no order pip or 3 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, CARD, "leona").build();
    await game.p1.play("leona");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.state("leona")).toMatchObject({ isExhausted: true, keywords: ["Shield"], might: 4, zone: "base" });
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "l").build()).p1.can("play", "l")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { order: 2 } }).hand(P1, CARD, "l").build()).p1.can("play", "l")).toBe(false);
  });

  test("[Shield]: defending she is 5 Might — a 4-Might attacker dies, Leona lives; and defending raises NO stun trigger", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "leona")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.state("leona")).toMatchObject({ combatRole: "defender", might: 5 });
    await game.settle();
    expect(game.state("raider").isStunned).toBe(false);
    expect(game.zoneOf("raider")).toBe("trash"); // took 5 ≥ 4
    expect(game.zoneOf("leona")).toBe("battlefield-bf1"); // took 4 < 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("When I attack: moving into a defended battlefield puts her triggered item on the chain; she is a 4-Might attacker (Shield is defender-only)", async () => {
    const game = await attackInto((b) => b.unit(P2, "bf1", { might: 3, name: "A" }, "a")).build();
    await game.p1.move("leona", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leona", controller: P1, triggered: true })]);
    expect(game.state("leona")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.state("a").isStunned).toBe(false); // nothing happens before it resolves
  });

  test("'an enemy unit HERE': with A and B at bf1, an enemy at bf2 and one in P2's base, only A and B are offered; the pick stuns exactly that one", async () => {
    const game = await attackInto((b) =>
      b.unit(P2, "bf1", { might: 3, name: "A" }, "a").unit(P2, "bf1", { might: 3, name: "B" }, "b").unit(P2, "bf2", { might: 3, name: "Else" }, "else").unit(P2, "base", { might: 3, name: "Home" }, "home"),
    ).build();
    await game.p1.move("leona", "bf1");
    const d = await toTargetPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["a", "b"]);
    await game.p1.pick("b");
    await game.acting().passPriority(); // rule 402 (finalization): the target is picked before priority; the stun waits for resolution
    await game.acting().passPriority();
    expect(game.state("b").isStunned).toBe(true);
    expect(game.state("a").isStunned).toBe(false);
    expect(game.state("else").isStunned).toBe(false);
    expect(game.state("home").isStunned).toBe(false);
  });

  test("two 3-Might defenders, B stunned: only A hits back (3 < 4, Leona lives); her 4 kills one defender and the battlefield holds", async () => {
    const game = await attackInto((b) => b.unit(P2, "bf1", { might: 3, name: "A" }, "a").unit(P2, "bf1", { might: 3, name: "B" }, "b")).build();
    await game.p1.move("leona", "bf1");
    await toTargetPrompt(game);
    await game.p1.pick("b");
    await game.settle();
    expect(game.zoneOf("leona")).not.toBe("trash");
    expect([game.zoneOf("a"), game.zoneOf("b")].filter((z) => z === "trash")).toHaveLength(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("exactly lethal: into a lone 4-Might defender the stun lands before damage — it deals 0, dies to her 4, Leona conquers undamaged", async () => {
    const game = await attackInto((b) => b.unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")).build();
    await game.p1.move("leona", "bf1");
    await game.settle(); // single legal target → taken, then combat
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("leona")).toBe("bf1");
    expect(game.state("leona").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("one short: into a lone 5-Might defender — stunned, it deals nothing, but 4 < 5 so it survives (423.1.c); Leona is sent home unhurt, no conquer", async () => {
    const game = await attackInto((b) => b.unit(P2, "bf1", { might: 5, name: "Big" }, "big")).build();
    await game.p1.move("leona", "bf1");
    await game.settle();
    expect(game.state("big").isStunned).toBe(true);
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("leona")).toBe("base");
    expect(game.state("leona").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("the stun is 'this turn': the surviving 5-Might defender is no longer stunned once the turn has ended (423.1.a.2)", async () => {
    const game = await attackInto((b) => b.unit(P2, "bf1", { might: 5, name: "Big" }, "big")).build();
    await game.p1.move("leona", "bf1");
    await game.settle();
    expect(game.state("big").isStunned).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("big").isStunned).toBe(false);
  });

  test("an already-stunned lone defender may still be chosen (423.1.a.1) — nothing breaks, it stays stunned, deals 0 and Leona's 4 kills the 4-Might unit", async () => {
    const game = await attackInto((b) => b.unit(P2, "bf1", { might: 4, name: "Dazed" }, "dazed", { stunned: true })).build();
    await game.p1.move("leona", "bf1");
    expect(game.chain()).toHaveLength(1); // the trigger still fires
    await game.settle();
    expect(game.zoneOf("dazed")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space: moving onto an EMPTY enemy-controlled battlefield is not an attack — no chain item, nobody stunned, she simply takes it", async () => {
    const game = await attackInto((b) => b.unit(P2, "base", { might: 3, name: "Home" }, "home")).build();
    await game.p1.move("leona", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("home").isStunned).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Deflect counter-play (809): a lone Pouty Poro defender cannot be chosen with no floating power — the trigger resolves with no stun and no power is invented", async () => {
    const game = await attackInto((b) => b.unit(P2, "bf1", POUTY_PORO, "pp")).build();
    await game.p1.move("leona", "bf1");
    expect(game.chain()).toHaveLength(0); // rule 402.4: no payable target ⇒ removed unfinalized
    const d = await toTargetPrompt(game);
    expect(d?.kind).toBe("action"); // no target prompt was possible
    expect(game.state("pp").isStunned).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Deflect paid with power of ANY domain (809.1.c.1): with 1 fury floating the Poro is offered next to a plain unit; picking it stuns it and spends the pip", async () => {
    const game = await attackInto((b) => b.unit(P2, "bf1", POUTY_PORO, "pp").unit(P2, "bf1", { might: 2, name: "Plain" }, "plain"))
      .resources(P1, { power: { fury: 1 } })
      .build();
    await game.p1.move("leona", "bf1");
    const d = await toTargetPrompt(game);
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["plain", "pp"]);
    await game.p1.pick("pp");
    await game.acting().passPriority(); // rule 402 (finalization): the stun waits for resolution
    await game.acting().passPriority();
    expect(game.state("pp").isStunned).toBe(true);
    expect(game.p1.power()).toBe(0);
  });
});

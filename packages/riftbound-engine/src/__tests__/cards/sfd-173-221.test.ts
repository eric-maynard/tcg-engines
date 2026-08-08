/**
 * Soraka, Wanderer — sfd-173-221 · Champion Unit (Soraka) · Order · 4 energy + [order] · 4 might
 *
 *   I must be assigned combat damage last.
 *   If another unit you control here would die, if it has less Might than me, instead heal it,
 *   exhaust it, and recall it. (Send it to base. This isn't a move.)
 *
 * Rules: 826 Backline ("assigned combat damage last": an invalid assignment until every non-Backline
 * unit of that side has lethal, 826.4.b / 465.2.c.6); 370–374 Replacement Effects ("would die …
 * instead": the death never happens, 370.1.a.1 → no Deathknell; 370.4 Soraka may still replace
 * deaths simultaneous with her own; 372 two replacements on one event → the dying unit's CONTROLLER
 * orders them); 454–458 Recall (to base, not a Move, statuses otherwise untouched — here the text
 * itself heals and exhausts); "another" ≠ Soraka; "you control" ≠ enemy; "here" = Soraka's location;
 * "less Might than me" = strictly less, effective Might of both at that moment.
 *
 * Head-judge corner cases for THIS card:
 *   1. Combat: a 3-Might attacker into Soraka(4)+ally(2) must put lethal on the ally first (Backline);
 *      the ally's death is replaced → healed, exhausted, in base; Soraka holds; attacker dies.
 *   2. Assignment legality: with Soraka + two 2s vs 3 damage, P2 gets a real distribute choice but
 *      any point on Soraka is refused until both 2s have lethal.
 *   3. Strictly less: an equal-Might (4) ally dies for real; Soraka pumped to 6 (Discipline) saves a 5.
 *   4. Scope: Soraka herself is never saved ("another"); an ally in base while Soraka is at bf1 is
 *      not "here"; an ENEMY small unit dying at her battlefield goes to the trash.
 *   5. 370.4: an 8-Might attacker kills Soraka AND the ally simultaneously — the ally is still saved,
 *      Soraka goes to the trash, the attacker conquers.
 *   6. Non-combat deaths count: Sandshifter's kill on Watchful Sentry here is replaced — Sentry lives
 *      exhausted in base and its Deathknell does NOT draw. Smite (deal 3, "banish instead") on the
 *      ally = two replacements on one death → P1 (controller) orders them: Soraka first saves it,
 *      Smite first banishes it (372).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-173-221";
const SANDSHIFTER = "sfd-158-221"; // 5+[order][order]: when played, kill an enemy unit with 3 might or less
const WATCHFUL_SENTRY = "ogn-096-298"; // 1 might, Deathknell — draw 1
const SMITE = "unl-007-219"; // Action 2+[fury]: deal 3 to a unit at a bf; if it would die this turn, banish it instead
const DISCIPLINE = "ogn-058-298"; // Reaction 2: a unit +2 might this turn, draw 1

/** P2 to act; P1 holds bf1 with Soraka + one ally of `allyMight`; P2 has an attacker of `attMight` in base. */
function defence(allyMight: number, attMight: number) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "soraka")
    .unit(P1, "bf1", { might: allyMight, name: "Ally" }, "ally")
    .unit(P2, "base", { might: attMight, name: "Attacker" }, "att");
}

describe("Soraka, Wanderer (sfd-173-221)", () => {
  test("registry payload: Backline keyword + a die-replacement for OTHER FRIENDLY units HERE with less Might (heal → exhaust → recall); 4+[order] champion, 4 might", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 4, isChampion: true, might: 4, name: "Soraka, Wanderer" });
    expect(def?.powerCost).toEqual(["order"]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toEqual({ keyword: "Backline", type: "keyword" });
    expect(def?.abilities?.[1]).toMatchObject({
      condition: { type: "less-might-than-source" },
      replacement: { effects: [{ type: "heal" }, { type: "exhaust" }, { type: "recall" }], type: "sequence" },
      replaces: "die",
      target: { controller: "friendly", excludeSelf: true, location: "here", type: "unit" },
      type: "replacement",
    });
  });

  test("cost: 4 energy + 1 order exactly; enters exhausted with Backline; 3 energy or no order is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, CARD, "soraka").build();
    await game.p1.play("soraka");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("soraka")).toBe("base");
    expect(game.state("soraka")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.state("soraka").keywords).toContain("Backline");
    expect((await scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, CARD, "soraka").build()).p1.can("play", "soraka")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "soraka").build()).p1.can("play", "soraka")).toBe(false);
  });

  test("combat: a 3-Might attacker into Soraka(4)+Ally(2) — lethal goes to the Ally first (Backline), its death is replaced: healed, exhausted, recalled; Soraka holds bf1; attacker dies", async () => {
    const game = await defence(2, 3).build();
    await game.p2.move("att", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
    expect(game.zoneOf("att")).toBe("trash");
    expect(game.p1.trash()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0); // "This isn't a move."
    expect(game.violations()).toEqual([]);
  });

  test("826.4.b assignment: with Soraka + two 2-Might allies vs 3 damage P2 chooses the split, but ANY damage on Soraka is refused; the ally given lethal is saved to base", async () => {
    const game = await scenario()
      .active(P2)
      .autoProcedures(false)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "soraka")
      .unit(P1, "bf1", { might: 2, name: "A" }, "a")
      .unit(P1, "bf1", { might: 2, name: "B" }, "b")
      .unit(P2, "base", { might: 3, name: "Attacker" }, "att")
      .build();
    await game.p2.move("att", "bf1");
    await game.settle();
    await game.p2.choose("resolveFullCombat:bf1");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 3 });
    expect((await game.p2.try((p) => p.distribute({ soraka: 3 }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.distribute({ a: 2, soraka: 1 }))).ok).toBe(false); // B lacks lethal
    await game.p2.distribute({ a: 1, b: 2 });
    await game.p2.choose("resolveFullCombat:bf1");
    await game.settle();
    expect(game.zoneOf("b")).toBe("base");
    expect(game.state("b")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
    expect(game.zoneOf("att")).toBe("trash");
  });

  test("'less Might than me' is strict: an equal 4-Might ally is NOT saved and dies to the trash (Soraka survives the leftover 1)", async () => {
    const game = await defence(4, 5).build();
    await game.p2.move("att", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
    expect(game.zoneOf("att")).toBe("trash"); // took 8
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Soraka's CURRENT Might is what counts: pumped to 6 by Discipline in the showdown, she saves a 5-Might ally that would otherwise die", async () => {
    const game = await defence(5, 6).resources(P1, { energy: 2 }).hand(P1, DISCIPLINE, "disc").build();
    await game.p2.move("att", "bf1");
    // Showdown: attacker (P2) has focus first; P2 passes, P1 reacts on Soraka.
    if (game.actingSeat() === P2) {
      await game.p2.pass();
    }
    await game.p1.cast("disc", { targets: "soraka" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1"); // 6 attacker: 5 lethal on ally, 1 on Soraka
    expect(game.zoneOf("att")).toBe("trash");
  });

  test("'another': Soraka's own death is not replaced — a lone Soraka hit for 4 goes to the trash and the attacker conquers", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "soraka")
      .unit(P2, "base", { might: 5, name: "Attacker" }, "att")
      .build();
    await game.p2.move("att", "bf1");
    await game.settle();
    expect(game.zoneOf("soraka")).toBe("trash");
    expect(game.zoneOf("att")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("370.4 simultaneous: an 8-Might attacker gives lethal to both — the Ally is STILL saved to base, Soraka dies, attacker conquers", async () => {
    const game = await defence(2, 8).build();
    await game.p2.move("att", "bf1");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("soraka")).toBe("trash");
    expect(game.zoneOf("att")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("'here': an ally in BASE killed by Sandshifter while Soraka sits at bf1 is not protected — it dies", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 5, power: { order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "soraka")
      .unit(P1, "base", { might: 2, name: "HomeAlly" }, "home")
      .hand(P2, SANDSHIFTER, "ss")
      .build();
    await game.p2.play("ss");
    await game.settle(); // only legal target → forced
    expect(game.zoneOf("home")).toBe("trash");
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
  });

  test("'you control': an ENEMY 1-Might attacker dying at Soraka's battlefield is not saved — it goes to P2's trash, not P2's base", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "soraka")
      .unit(P2, "base", { might: 1, name: "Gnat" }, "gnat")
      .build();
    await game.p2.move("gnat", "bf1");
    await game.settle();
    expect(game.zoneOf("gnat")).toBe("trash");
    expect(game.state("gnat").isExhausted).toBe(false);
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
  });

  test("non-combat death (Sandshifter kills Watchful Sentry here): replaced — Sentry lives exhausted at 0 damage in base and its Deathknell does NOT draw (370.1.a.1)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 5, power: { order: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "soraka")
      .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
      .hand(P2, SANDSHIFTER, "ss")
      .build();
    const p1Deck = game.p1.deck().length;
    await game.p2.play("ss");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("base");
    expect(game.state("sentry")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(p1Deck);
    expect(game.chain()).toEqual([]);
  });

  test("372 — two replacements on one death (Smite's 'banish instead' + Soraka): the dying unit's controller P1 orders them; choosing Soraka first saves the ally (base, exhausted, 0 damage, not banished)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "soraka")
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .hand(P2, SMITE, "smite")
      .build();
    await game.p2.cast("smite", { targets: "ally" });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["smite", "soraka"]);
    await game.p1.pick("soraka");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.p1.banishment()).toEqual([]);
    expect(game.zoneOf("smite")).toBe("trash");
  });

  test("372 — same spot, P1 orders Smite's replacement first: the ally is banished instead (Soraka has no death left to replace)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "soraka")
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .hand(P2, SMITE, "smite")
      .build();
    await game.p2.cast("smite", { targets: "ally" });
    await game.settle();
    await game.p1.pick("smite");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("banishment");
    expect(game.p1.trash()).toEqual([]);
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
  });
});

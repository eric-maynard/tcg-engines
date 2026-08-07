/**
 * LeBlanc, Fragmented — unl-172-219 · Champion Unit (LeBlanc) · Order · 3 energy + [order] · 3 Might
 *
 *   [Assault] (+1 [Might] while I'm an attacker.)
 *   [Deathknell][>] Draw 1. If it's your Beginning Phase, draw 2 instead. (When I die, get the effect.)
 *
 * Rules: 807 (bare Assault = Assault 1: +1 Might only while holding the attacker designation — it is real
 * Might, so it also raises her lethal threshold in that combat), 808 (Deathknell = "When I die, …", one
 * chain item per instance; 808.2 + Karthus 383.3.d: "trigger an additional time"), 428.1.a.1.b (a kill
 * puts the Deathknell on the chain before she hits the trash), 816 (Temporary kills at the START of its
 * controller's Beginning Phase — the natural way for her to die "in your Beginning Phase"), 318–319 (the
 * Beginning Phase is the turn player's; the opponent's Beginning Phase is not "yours"), a return to hand
 * is not a death.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. The "instead" clause is a REPLACEMENT of the amount, checked on resolution: 2 cards, not 1+2, and
 *     only during HER CONTROLLER's Beginning Phase (Temporary / Shadow's Call, or a Reaction sacrifice
 *     while a start-of-turn trigger holds the phase open). Dying in the opponent's Beginning Phase → 1.
 *  2. Assault is attacker-only and symmetric in effect: attacking a 3 she is a 4 (kills it, survives 3
 *     damage); defending against a 3 she is a 3 (trade) — and that trade fires Deathknell on P2's turn.
 *  3. Karthus, Eternal on her side: the Deathknell resolves twice → 2 cards mid-turn (and 4 in your
 *     Beginning Phase).
 *  4. Not a death: Retreat to hand draws nothing. A death is a death whoever causes it: enemy Soul
 *     Harvest on P2's turn still draws P1 a card.
 *  5. Turn bookkeeping when she dies to Temporary: P1's hand across that turn start = +2 (Deathknell)
 *     +1 (Draw step) — never +1+1.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-172-219";
const SHADOWS_CALL = "unl-165-219"; // 2: Choose a friendly unit without Temporary. Give it Temporary. Draw 2.
const DEATHGRIP = "sfd-163-221"; // [Reaction] 2: Kill a friendly unit. If you do, +Might to another friendly unit. Draw 1.
const KARTHUS = "ogn-236-298"; // Your [Deathknell] effects trigger an additional time.
const GUSTWALKER = "unl-075-219"; // Hunt 2 — a hold trigger that holds the Beginning Phase open
const RETREAT = "ogn-104-298"; // [Reaction] 1: Return a friendly unit to its owner's hand. …
const SOUL_HARVEST = "unl-159-219"; // 2 + [order]: Kill a unit at a battlefield with 3 Might or less.

describe("LeBlanc, Fragmented (unl-172-219)", () => {
  test("registry payload (part 1): Assault 1 keyword, a Deathknell keyword and its synthesised self-die trigger; 3 + [order], 3-Might champion", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 3, isChampion: true, might: 3, name: "LeBlanc, Fragmented" });
    expect(def?.powerCost).toEqual(["order"]);
    const abilities = (def?.abilities ?? []) as { type: string; keyword?: string; value?: number; trigger?: unknown; effect?: unknown }[];
    expect(abilities[0]).toEqual({ keyword: "Assault", type: "keyword", value: 1 });
    expect(abilities.find((a) => a.type === "keyword" && a.keyword === "Deathknell")).toBeDefined();
    const trig = abilities.filter((a) => a.type === "triggered");
    expect(trig).toHaveLength(1);
    expect(trig[0]?.trigger).toEqual({ event: "die", on: "self" });
  });

  test("registry payload (part 2) — the Deathknell effect must encode 'If it's your Beginning Phase, draw 2 instead'; the parser dropped the clause and left a bare draw 1", async () => {
    // Expected: the die-trigger's effect is conditional on the controller's Beginning Phase (amount 2 vs 1).
    // Actual: effect === { amount: 1, type: "draw" } on both the keyword and the triggered sibling.
    const def = (await loadDefaultCardPool()).get(CARD);
    const trig = ((def?.abilities ?? []) as { type: string; effect?: unknown }[]).find((a) => a.type === "triggered");
    expect(trig?.effect).not.toEqual({ amount: 1, type: "draw" });
    expect(JSON.stringify(trig?.effect)).toMatch(/beginning/i);
  });

  test("cost: 3 energy + one order power; enters base exhausted at 3 Might with Assault and Deathknell; 2 energy or off-domain power cannot pay", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, CARD, "leb").build();
    await game.p1.play("leb");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("leb")).toBe("base");
    expect(game.state("leb")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.state("leb").keywords).toEqual(expect.arrayContaining(["Assault", "Deathknell"]));
    expect(game.p1.hand()).toHaveLength(0);
    expect((await scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, CARD, "leb").build()).p1.can("play", "leb")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, CARD, "leb").build()).p1.can("play", "leb")).toBe(false);
  });

  test("[Assault]: attacking she is a 4 — kills a 3-Might defender AND survives its 3 damage (lethal is measured against 4), conquers; back in the open she reads 3 again; no death, no draw", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3, name: "Foe" }, "foe").unit(P1, "base", CARD, "leb").build();
    expect(game.state("leb").might).toBe(3);
    await game.p1.move("leb", "bf1");
    expect(game.state("leb")).toMatchObject({ combatRole: "attacker", might: 4 });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("leb")).toBe("bf1");
    expect(game.state("leb").might).toBe(3);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("[Assault] is attacker-only: defending against a 3-Might raider on P2's turn she is a 3 → they trade, and her Deathknell draws P1 exactly 1 (P2's turn is not 'your Beginning Phase')", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "leb")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("leb")).toMatchObject({ combatRole: "defender", might: 3 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("leb")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p2.hand()).toHaveLength(0);
  });

  test("[Deathknell] in her own attack (main phase, not Beginning): 4 into a 5-Might wall → she dies, the trigger is a chain item, P1 draws exactly 1", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 5, name: "Wall" }, "wall").unit(P1, "base", CARD, "leb").build();
    await game.p1.move("leb", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    if (game.decision()?.kind === "distribute") {
      await game.settle({ maxSteps: 1 });
    }
    // She is dead and her Deathknell waits on the chain.
    expect(game.zoneOf("leb")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leb", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(0);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.locationOf("wall")).toBe("bf1");
  });

  test("a death is a death whoever causes it: P2's Soul Harvest on P2's turn kills her at a battlefield → P1 (her owner) draws 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "leb")
      .hand(P2, SOUL_HARVEST, "sh")
      .build();
    await game.p2.cast("sh", { targets: "leb" });
    await game.settle();
    expect(game.zoneOf("leb")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p2.hand()).toHaveLength(0);
  });

  test("not a death: Retreat returns her to hand — no Deathknell, no draw (hand = just LeBlanc)", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "leb").hand(P1, RETREAT, "retreat").build();
    await game.p1.cast("retreat", { targets: "leb" });
    await game.settle({ policy: "first" }); // Retreat's rune-channel rider is irrelevant here
    expect(game.zoneOf("leb")).toBe("hand");
    expect(game.p1.hand()).toEqual(["leb"]);
    expect(game.chain()).toEqual([]);
  });

  test("Karthus, Eternal on her side: the Deathknell triggers an additional time → dying mid-turn draws 2 (1 + 1)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P1, "base", KARTHUS, "karthus")
      .unit(P1, "base", CARD, "leb")
      .build();
    await game.p1.move("leb", "bf1");
    await game.settle();
    expect(game.zoneOf("leb")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("'If it's your Beginning Phase, draw 2 instead' — Shadow's Call makes her Temporary; at the start of P1's next Beginning Phase she dies and P1 should net +2 (Deathknell) +1 (Draw step) = 5 cards; the engine draws only 1 for the Deathknell", async () => {
    // Timeline: cast Shadow's Call (hand 0 → 2), P1 ends, P2's turn (LeBlanc alive), P1's turn begins:
    // Temporary kill (816.1.b, before scoring) → Deathknell resolves IN P1's Beginning Phase → 2 cards → … → Draw step +1.
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "leb").hand(P1, SHADOWS_CALL, "call").build();
    await game.p1.cast("call", { targets: "leb" });
    await game.settle();
    expect(game.state("leb").keywords).toContain("Temporary");
    expect(game.p1.hand()).toHaveLength(2);
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("leb")).toBe("base");
    expect(game.p1.hand()).toHaveLength(2);
    await game.advanceTurn(); // → P1: Beginning Phase kills her
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("leb")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(5);
  });

  test("control for the above (what the engine does today): the Temporary death in P1's Beginning Phase does fire the Deathknell — she is in the trash and P1 drew at least the plain 1 (+1 Draw step)", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARD, "leb").hand(P1, SHADOWS_CALL, "call").build();
    await game.p1.cast("call", { targets: "leb" });
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("leb")).toBe("trash");
    expect(game.p1.hand().length).toBeGreaterThanOrEqual(4); // 2 + ≥1 + 1
  });

  test("sacrificed with Deathgrip DURING P1's own Beginning Phase (a Hunt hold trigger holds the phase open) → 'your Beginning Phase' → the Deathknell should draw 2 (hand: Deathgrip's 1 + 2 = 3 before the Draw step); the engine gives 1", async () => {
    // Rune pools empty at end of turn (317.2.d), so P1 pays for the Reaction by exhausting two ready runes.
    const game = await scenario()
      .turn(2)
      .active(P2)
      .runes(P1, "order", 2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", GUSTWALKER, "gw") // "When I hold, gain 2 XP" → a chain item in P1's Beginning Phase
      .unit(P1, "base", CARD, "leb")
      .unit(P1, "base", { might: 1, name: "Heir" }, "heir") // Deathgrip's "+Might to another friendly unit" recipient
      .hand(P1, DEATHGRIP, "grip")
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gw", triggered: true })]);
    await game.p1.tapRunes(2);
    expect(game.p1.can("cast", "grip")).toBe(true); // Reaction speed with priority
    await game.p1.cast("grip", { targets: "leb" });
    // Resolve Deathgrip + her Deathknell (still inside the Beginning Phase), answering the +Might recipient if asked.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.seat(d.seat).pick(d.options.find((o) => o.card === "heir")?.key ?? d.options[0]!.key);
      } else if (d?.kind === "action" && d.context === "chain" && !(game.chain().length === 1 && game.zoneOf("leb") === "trash")) {
        await game.acting().pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("leb")).toBe("trash");
    expect(game.phase()).toBe("beginning"); // the hold trigger is still holding the phase
    expect(game.chain().map((c) => c.cardId)).toEqual(["gw"]);
    expect(game.state("heir").might).toBe(4);
    expect(game.p1.hand()).toHaveLength(3); // Deathgrip drew 1, Deathknell drew 2
  });

  test("negative space for 'your': the same Deathgrip sacrifice during P2's Beginning Phase (P2's Gustwalker holds it open) draws the plain 1 → P1's hand = 1 (Deathgrip) + 1 = 2", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .runes(P1, "order", 2)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", GUSTWALKER, "gw")
      .unit(P1, "base", CARD, "leb")
      .unit(P1, "base", { might: 1, name: "Heir" }, "heir")
      .hand(P1, DEATHGRIP, "grip")
      .build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gw", triggered: true })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.tapRunes(2);
    await game.p1.cast("grip", { targets: "leb" });
    game.script(P1, [(d) => (d.kind === "pick" ? (d.options.find((o) => o.card === "heir")?.key ?? d.options[0]!.key) : undefined)]);
    await game.settle();
    expect(game.zoneOf("leb")).toBe("trash");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.state("heir").might).toBe(4); // 1 + her 3 (Assault does not count off the attack)
  });
});

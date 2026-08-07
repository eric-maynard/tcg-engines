/**
 * Pyke, Returned — unl-145-219 · Champion Unit (Pyke) · Chaos · 3 energy · 3 Might
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Backline] (I must be assigned combat damage last.)
 *   Once each turn, when an enemy unit dies while I'm at a battlefield, play a Gold gear token
 *   exhausted. (It has "[Reaction][>] Kill this, [Exhaust]: [Add] [rainbow].")
 *
 * Rules: 811 (Hidden: hide from hand for [A] at a battlefield you control; from the NEXT turn it has
 * Reaction and plays for 0; a hidden permanent is played TO that battlefield — 811.1.d.1), 826 (Backline:
 * an invalid lethal-damage assignment until every same-side unit without Backline has lethal assigned;
 * with Tank present the order is Tank → plain → Backline, 465.2.c.6), 383.3.e (a "once each turn"
 * trigger simply does not trigger again that turn), 383.2.c.2 (a unit that leaves the board in the same
 * game action as the triggering death cannot evaluate its trigger — no look-back), 187.5 (Gold token =
 * domainless GEAR token with "[Reaction] Kill this, [Exhaust]: [Add] [A]"), 184.1 ("…exhausted"
 * overrides the gear default of entering ready), 740.1.a ("enemy" = controlled by an opponent).
 *
 * Head-judge corner cases for THIS card:
 *   1. The trigger keys on PYKE's location, not the corpse's: an enemy dying anywhere (other battlefield,
 *      even to a spell) while Pyke stands at a battlefield → Gold; Pyke in base → nothing; a FRIENDLY
 *      death → nothing.
 *   2. Once each turn: two enemy deaths in one turn → exactly one Gold; a death on a later turn → a
 *      second Gold. The Gold enters EXHAUSTED, in Pyke's controller's base, and is a gear token.
 *   3. Simultaneity: Pyke (3) trades with a 3-Might attacker — both die in the same cleanup → Pyke is
 *      not on the board "immediately after" → no Gold (383.2.c.2). But Pyke surviving a combat in which
 *      an enemy dies → Gold.
 *   4. Backline is a hard assignment restriction — positions are built so that Pyke would be the cheaper
 *      kill: attacker 4 into [Pal 4, Pyke 3] MUST put all 4 on Pal → Pyke untouched; attacker 7 into
 *      [Tank 3, Plain 4, Pyke 3] → Tank then Plain die, Pyke gets 0; alone, Backline does nothing (he
 *      takes it all). It equally binds the DEFENDER's assignment when Pyke is among the attackers.
 *      (Whether the engine prompts for the split or auto-assigns, an illegal split must be refused.)
 *   5. Hidden: [rainbow] to hide at a controlled battlefield; not playable that turn nor on the
 *      opponent's open-state turn (no priority); on a later own turn plays for 0 energy AT that
 *      battlefield; from hand he is a normal 3-cost play to base.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-145-219";
const golds = (game: Game, seat: "p1" | "p2" = "p1") => game[seat].base().filter((c) => c.startsWith("token-gold-"));
const ZAP = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Zap",
  rulesText: "Deal 3 to a unit.",
  timing: "action",
};

/** Pass focus/priority for everyone; if a damage-assignment prompt appears try `alloc` first (must be refused), else default. */
async function fight(game: Game, illegalAlloc?: Record<string, number>): Promise<{ prompted: boolean; illegalAccepted: boolean }> {
  let prompted = false;
  let illegalAccepted = false;
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "distribute") {
      prompted = true;
      if (illegalAlloc) {
        const r = await game.seat(d.seat).try((s) => s.distribute(illegalAlloc));
        illegalAccepted = r.ok;
        if (r.ok) {
          continue;
        }
      }
      await game.seat(d.seat).distribute({ ...(d.defaultAllocation ?? {}) });
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return { illegalAccepted, prompted };
}

function pykeAtBf() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", CARD, "pyke")
    .unit(P2, "bf2", { might: 1, name: "E1" }, "e1")
    .unit(P2, "base", { might: 1, name: "E2" }, "e2")
    .unit(P2, "base", { might: 1, name: "E3" }, "e3")
    .hand(P1, ZAP, "z1")
    .hand(P1, ZAP, "z2")
    .hand(P1, ZAP, "z3");
}

describe("Pyke, Returned (unl-145-219)", () => {
  test("registry payload: Hidden keyword, Backline, and a once-per-turn enemy-unit 'die' trigger gated on while-at-battlefield that creates a Gold gear token", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 3, isChampion: true, might: 3, tags: ["Pyke"] });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(3);
    expect(def?.abilities?.[0]).toEqual({ keyword: "Hidden", type: "keyword" });
    expect(JSON.stringify(def?.abilities?.[1])).toMatch(/Backline/);
    expect(def?.abilities?.[2]).toMatchObject({
      condition: { type: "while-at-battlefield" },
      effect: { token: { name: "Gold", type: "gear" }, type: "create-token" },
      trigger: { event: "die", on: "enemy-units", restrictions: [{ type: "once-per-turn" }] },
      type: "triggered",
    });
  });

  // BUG — expected: "play a Gold gear token EXHAUSTED" must be encoded (gear tokens otherwise enter ready,
  // cf. every other Gold-minting card which carries `ready: false`). Actual: no `ready` field at all.
  test("parsed Gold create-token effect is missing `ready: false` (token would enter ready)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect((def?.abilities?.[2] as { effect?: { ready?: boolean } }).effect?.ready).toBe(false);
  });

  test("cost from hand: 3 energy, no power; enters the base exhausted as a 3-Might unit showing Hidden + Backline; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "pyke").build();
    await game.p1.play("pyke");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("pyke")).toBe("base");
    expect(game.state("pyke")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.state("pyke").keywords).toEqual(expect.arrayContaining(["Hidden", "Backline"]));
    expect(game.chain()).toHaveLength(0);
    expect((await scenario().resources(P1, { energy: 2, power: { chaos: 3 } }).hand(P1, CARD, "p").build()).p1.can("play", "p")).toBe(false);
  });

  test("[Hidden]: hide for [rainbow] only at a battlefield you control; not playable that turn, nor during the opponent's open turn; next own turn plays for 0 AT that battlefield", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2 }, "holder")
      .hand(P1, CARD, "pyke")
      .build();
    expect(game.p1.option("hide", "pyke")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bf1"]);
    await game.p1.hide("pyke", "bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("pyke")).toBe("facedown-bf1");
    expect(game.state("pyke").isHidden).toBe(true);
    expect(game.p1.can("reveal", "pyke")).toBe(false); // same turn
    await game.advanceTurn();
    expect(game.p1.can("reveal", "pyke")).toBe(false); // P2's neutral open state: P1 holds no priority
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    const energy = game.p1.energy();
    await game.p1.reveal("pyke");
    await game.settle();
    expect(game.p1.energy()).toBe(energy); // played for 0
    expect(game.zoneOf("pyke")).toBe("battlefield-bf1"); // 811.1.d.1: to THAT battlefield, not base
    expect(game.state("pyke")).toMatchObject({ isExhausted: true, might: 3 });
  });

  test("[Hidden] needs the [rainbow]: with an empty pool hiding is not offered", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 2 }, "holder").hand(P1, CARD, "pyke").build();
    expect(game.p1.can("hide", "pyke")).toBe(false);
  });

  // The Backline positions are built so that killing Pyke (3) would be the CHEAPER kill: any assignment
  // that ends with Pyke dead and the bigger pal alive proves Backline was ignored (826.4.b).
  test("[Backline] defending: a 4-Might attacker into [Pal 4, Pyke 3] must put all 4 (lethal) on Pal first — Pal dies, Pyke is untouched, attacker dies to 7", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "pyke")
      .unit(P1, "bf1", { might: 4, name: "Pal" }, "pal")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("pyke").combatRole).toBe("defender");
    const r = await fight(game, { pal: 1, pyke: 3 });
    expect(r.illegalAccepted).toBe(false);
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.zoneOf("pyke")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("[Backline] with Tank on the same side (465.2.c.6): 7 damage into [Tank 3, Plain 4, Pyke 3] must go Tank → Plain → Pyke: Tank and Plain die, Pyke gets 0 and lives", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "pyke")
      .unit(P1, "bf1", { keywords: ["Tank"], might: 3, name: "Tank" }, "tank")
      .unit(P1, "bf1", { might: 4, name: "Plain" }, "plain")
      .unit(P2, "base", { might: 7, name: "Giant" }, "giant")
      .build();
    await game.p2.move("giant", "bf1");
    const r = await fight(game, { plain: 1, pyke: 3, tank: 3 });
    expect(r.illegalAccepted).toBe(false);
    expect(game.zoneOf("tank")).toBe("trash");
    expect(game.zoneOf("plain")).toBe("trash");
    expect(game.zoneOf("pyke")).toBe("battlefield-bf1");
    expect(game.zoneOf("giant")).toBe("trash"); // 10 defending Might
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Backline] also binds the DEFENDER's assignment when Pyke attacks with a 4-Might pal into a 4-Might defender: pal soaks all 4 and dies, Pyke conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "pyke")
      .unit(P1, "base", { might: 4, name: "Pal" }, "pal")
      .unit(P2, "bf1", { might: 4, name: "Def" }, "def")
      .build();
    await game.p1.move(["pyke", "pal"], "bf1");
    expect(game.state("pyke").combatRole).toBe("attacker");
    const r = await fight(game, { pal: 1, pyke: 3 });
    expect(r.illegalAccepted).toBe(false);
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.locationOf("pyke")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("[Backline] alone means nothing: a lone Pyke takes all 3 from a 3-Might attacker and both die — and (383.2.c.2) dying WITH the enemy yields no Gold", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "pyke")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await fight(game);
    await game.settle();
    expect(game.zoneOf("pyke")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(golds(game)).toHaveLength(0);
    expect(game.chain()).toHaveLength(0);
  });

  // BUG — expected: E1 (enemy, at ANOTHER battlefield) dies to a spell while Pyke stands at bf1 → the
  // trigger resolves and P1 gets one exhausted Gold GEAR token in base. Actual: the `once-per-turn`
  // restriction is unknown to the trigger matcher, so the ability never triggers at all.
  test("enemy unit dies (anywhere) while Pyke is at a battlefield → play one Gold gear token, exhausted, in P1's base", async () => {
    const game = await pykeAtBf().build();
    await game.p1.cast("z1", { targets: "e1" });
    await game.settle();
    expect(game.zoneOf("e1")).toBe("trash");
    expect(golds(game)).toHaveLength(1);
    const [gold] = golds(game);
    expect(game.state(gold!)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true, name: "Gold", owner: P1 });
    expect(golds(game, "p2")).toHaveLength(0);
  });

  // BUG — expected (383.3.e.1): a second enemy death in the same turn does not trigger again → still one
  // Gold; on P1's NEXT turn a third death triggers afresh → two Golds, and the first (now ready) Gold can
  // be cashed for [rainbow]. Actual: no Gold is ever created.
  test("'Once each turn' — two deaths this turn give 1 Gold; a death next turn gives a 2nd; a ready Gold cashes for 1 rainbow", async () => {
    const game = await pykeAtBf().build();
    await game.p1.cast("z1", { targets: "e1" });
    await game.settle();
    await game.p1.cast("z2", { targets: "e2" });
    await game.settle();
    expect(game.zoneOf("e2")).toBe("trash");
    expect(golds(game)).toHaveLength(1);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    const [first] = golds(game);
    expect(game.state(first!).isReady).toBe(true); // readied in Awaken
    await game.p1.cast("z3", { targets: "e3" });
    await game.settle();
    expect(golds(game)).toHaveLength(2);
    await game.p1.activate(first!);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.has(first!) ? game.zoneOf(first!) : "gone").not.toBe("base"); // killed as its cost
  });

  // BUG — expected: Raider (enemy) dies in a combat Pyke survives (pal soaks lethal first) → Gold for P1
  // once the combat's cleanup has fired the trigger. Actual: never triggers.
  test("an enemy attacker dying in combat at Pyke's battlefield while Pyke survives → one exhausted Gold", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "pyke")
      .unit(P1, "bf1", { might: 4, name: "Pal" }, "pal")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await fight(game);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("pyke")).toBe("battlefield-bf1");
    expect(golds(game)).toHaveLength(1);
    expect(game.state(golds(game)[0]!).isExhausted).toBe(true);
  });

  test("negative space: Pyke in BASE while an enemy dies → nothing; a FRIENDLY unit dying while he is at a battlefield → nothing", async () => {
    const home = await scenario().unit(P1, "base", CARD, "pyke").unit(P2, "base", { might: 1 }, "e1").hand(P1, ZAP, "z1").build();
    await home.p1.cast("z1", { targets: "e1" });
    await home.settle();
    expect(home.zoneOf("e1")).toBe("trash");
    expect(golds(home)).toHaveLength(0);
    expect(home.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });

    const friendly = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "pyke").unit(P1, "base", { might: 1 }, "mine").hand(P1, ZAP, "z1").build();
    await friendly.p1.cast("z1", { targets: "mine" });
    await friendly.settle();
    expect(friendly.zoneOf("mine")).toBe("trash");
    expect(golds(friendly)).toHaveLength(0);
    expect(friendly.chain()).toHaveLength(0);
  });
});

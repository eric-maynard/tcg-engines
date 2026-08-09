/**
 * Bashful Bloom — unl-189-219 · Legend (Lillia) · Calm/Mind
 *
 *   [4], [Exhaust]: Play a ready 3 [Might] Sprite unit token with [Temporary]. This ability costs
 *   [1] less for each friendly unit with [Temporary].
 *
 * Rules: 187.2 (Sprite token: domainless 3-Might Fae unit token with Temporary), 184.1 ("play a
 * READY … token" overrides units-enter-exhausted 143.4), 816 (Temporary: "At the start of this
 * permanent's controller's Beginning Phase, before scoring, kill this"), 186.1 (a token leaving the
 * board ceases to exist), 356.4/356.6 (discounts; Energy cost never below 0), 376/343.1.b (legend
 * activated ability without [Action]/[Reaction]: Neutral Open State on your turn only), 315.1.b
 * (Awaken readies the legend each turn), 140 (a ready unit may Standard Move at once).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. The Sprite enters READY: it can march to a battlefield and fight the turn it is made.
 *  2. Temporary kills it at the start of MY next Beginning Phase, BEFORE scoring: a Sprite left
 *     holding a battlefield earns no hold point and the battlefield falls uncontrolled; it survives
 *     the opponent's whole turn in between. Being a token it then ceases to exist.
 *  3. Discount counts friendly UNITS with Temporary only: enemy Temporary units and my Temporary
 *     GEAR (Sumpworks Map) give nothing; four or more such units make it free (floor 0), never
 *     negative — the [Exhaust] is still required.
 *  4. Both cost parts are mandatory: 3 energy with no discount, or an exhausted legend, → illegal.
 *  5. Timing: not during a showdown, not with a chain open, not on the opponent's turn.
 *  6. Partners: Petal Pixie (+1 per friendly Temporary unit at its battlefield) grows when the
 *     Sprite joins it; Lillia, Protector of Dreams gets +1 this turn when the token is played and
 *     gives the Sprite [Tank].
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-189-219";
const SUMPWORKS_MAP = "unl-085-219"; // Gear · Mind · [Reaction] [Temporary] When an opponent scores, draw 1.
const PETAL_PIXIE = "unl-076-219"; // Unit · Mind · 2 might · +1 Might for each of your units with [Temporary] at my battlefield.
const LILLIA_PROTECTOR = "unl-058-219"; // Unit · Calm · 4 might · When you play a token unit, give me +1 Might this turn. Your token units have [Tank].
const DISINTEGRATE = "ogn-005-298"; // [Action] 4 energy: deal 3 to a unit at a battlefield
const TEMP = (name: string) => ({ keywords: ["Temporary"], might: 1, name });

const spritesOf = (game: Game, at?: string) => game.p1.units(at).filter((id) => game.state(id).name === "Sprite");

function board(energy = 4) {
  return scenario()
    .resources(P1, { energy })
    .legend(P1, CARD, "bloom")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Wall" }, "wall");
}

describe("Bashful Bloom (unl-189-219)", () => {
  test("registry payload drops the printed discount — expected an activated {energy:4, exhaust} Sprite-token ability WITH a 'costs [1] less per friendly Temporary unit' modifier", async () => {
    // Expected: the activated ability carries a cost modifier (reduction 1 per friendly unit with
    // Temporary). Actual: only cost + create-token were parsed; the second sentence vanished.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Lillia", domain: ["calm", "mind"], name: "Bashful Bloom" });
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as Record<string, unknown>;
    expect(ability).toMatchObject({
      cost: { energy: 4, exhaust: true },
      effect: { ready: true, token: { keywords: ["Temporary"], might: 3, name: "Sprite", type: "unit" }, type: "create-token" },
      type: "activated",
    });
    expect(ability.costModifier).toMatchObject({ reduction: 1 });
    expect(JSON.stringify(ability.costModifier)).toContain("Temporary");
  });

  test("[4],[Exhaust]: pays 4, exhausts the legend, uses the chain, then a READY 3-Might Sprite unit token with [Temporary] stands in my base", async () => {
    const game = await board().build();
    await game.p1.activate("bloom");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("bloom").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bloom", controller: P1, triggered: false })]);
    expect(spritesOf(game)).toHaveLength(0);
    await game.settle();
    const [sprite] = spritesOf(game, "base");
    expect(sprite).toBeDefined();
    expect(game.state(sprite as string)).toMatchObject({ baseMight: 3, cardType: "unit", controller: P1, isExhausted: false, isToken: true, might: 3, name: "Sprite" });
    expect(game.state(sprite as string).keywords).toContain("Temporary");
    expect(game.state(sprite as string).domains).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("cost negative space: 3 energy with no Temporary units → not offered; 4 energy but an exhausted legend → not offered", async () => {
    expect((await board(3).build()).p1.can("activate", "bloom")).toBe(false);
    const spent = await scenario().resources(P1, { energy: 6 }).card("bloom", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" }).build();
    expect(spent.p1.can("activate", "bloom")).toBe(false);
  });

  test("'ready' matters: the fresh Sprite marches to bf1 the same turn, kills the 2-might Wall (taking 2 < 3) and conquers", async () => {
    const game = await board().build();
    await game.p1.activate("bloom");
    await game.settle();
    const sprite = spritesOf(game)[0] as string;
    await game.p1.move(sprite, "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf(sprite)).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("[Temporary]: the Sprite survives the opponent's turn, then is killed at the start of MY Beginning Phase BEFORE scoring — no hold point, bf1 falls uncontrolled, the token ceases to exist", async () => {
    const game = await board().build();
    await game.p1.activate("bloom");
    await game.settle();
    const sprite = spritesOf(game)[0] as string;
    await game.p1.move(sprite, "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1); // the conquer
    await game.advanceTurn(); // → P2's turn: nothing happens to MY Temporary unit
    expect(game.turnPlayer()).toBe(P2);
    expect(game.locationOf(sprite)).toBe("bf1");
    await game.p2.endTurn(); // → P1's Beginning Phase: the Temporary trigger is pending
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: sprite, controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf(sprite)).toBe("gone");
    expect(game.has(sprite)).toBe(false);
    expect(game.p1.points()).toBe(1); // killed before scoring: no hold point
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.state("bloom").isExhausted).toBe(false); // Awaken readied the legend
  });

  test("timing: no [Action]/[Reaction] — illegal during a showdown, while a chain is open, and on the opponent's turn", async () => {
    const showdown = await board(8).unit(P1, "base", { might: 1, name: "Runner" }, "runner").autoProcedures(false).build();
    await showdown.p1.move("runner", "bf1");
    expect((showdown.decision() as ActionDecision).context).toBe("showdown");
    expect(showdown.p1.can("activate", "bloom")).toBe(false);

    const chainOpen = await board(8).hand(P1, DISINTEGRATE, "dis").build();
    await chainOpen.p1.cast("dis", { targets: "wall" });
    expect(chainOpen.p1.can("activate", "bloom")).toBe(false);
    await chainOpen.settle();
    expect(chainOpen.p1.can("activate", "bloom")).toBe(true);

    expect((await board(8).active(P2).build()).p1.can("activate", "bloom")).toBe(false);
  });

  test("'costs [1] less for each friendly unit with [Temporary]' — with one such unit and exactly 3 energy the ability should be legal and cost 3", async () => {
    // Expected: 4 − 1 = 3 → offered at 3 energy, pool 0 afterwards, Sprite made. Actual: full 4 is demanded.
    const game = await board(3).unit(P1, "base", TEMP("Wisp"), "wisp").build();
    expect(game.p1.can("activate", "bloom")).toBe(true);
    await game.p1.activate("bloom");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(spritesOf(game)).toHaveLength(1);
  });

  test("the discount is not applied — with one friendly Temporary unit and 4 energy, 1 energy should remain after activating", async () => {
    const game = await board(4).unit(P1, "base", TEMP("Wisp"), "wisp").build();
    await game.p1.activate("bloom");
    await game.settle();
    expect(spritesOf(game)).toHaveLength(1);
    expect(game.p1.energy()).toBe(1);
  });

  test("four friendly Temporary units make it free (356.6 floor 0) — legal at 0 energy, still exhausts; a fifth unit does not push it below 0", async () => {
    const four = await board(0).unit(P1, "base", TEMP("W1"), "w1").unit(P1, "base", TEMP("W2"), "w2").unit(P1, "base", TEMP("W3"), "w3").unit(P1, "bf1", TEMP("W4"), "w4").build();
    expect(four.p1.can("activate", "bloom")).toBe(true);
    await four.p1.activate("bloom");
    await four.settle();
    expect(four.p1.energy()).toBe(0);
    expect(four.state("bloom").isExhausted).toBe(true);
    expect(spritesOf(four)).toHaveLength(1);
    const five = await board(2).unit(P1, "base", TEMP("W1")).unit(P1, "base", TEMP("W2")).unit(P1, "base", TEMP("W3")).unit(P1, "base", TEMP("W4")).unit(P1, "base", TEMP("W5")).build();
    await five.p1.activate("bloom");
    expect(five.p1.energy()).toBe(2); // cost 0, not −1
  });

  test("discount negative space: ENEMY Temporary units and my Temporary GEAR (Sumpworks Map) do not count — 3 energy stays short", async () => {
    const enemyTemp = await board(3).unit(P2, "base", TEMP("Their Wisp"), "theirs").build();
    expect(enemyTemp.p1.can("activate", "bloom")).toBe(false);
    const gearTemp = await board(3).gear(P1, SUMPWORKS_MAP, "map").build();
    expect(gearTemp.state("map").keywords).toContain("Temporary");
    expect(gearTemp.p1.can("activate", "bloom")).toBe(false);
  });

  test("once per turn in practice: exhausted after use, readied by my next Awaken, and (funded again) makes a second Sprite while the first has already expired", async () => {
    const game = await board(4).build();
    await game.p1.activate("bloom");
    await game.settle();
    const first = spritesOf(game)[0] as string;
    expect(game.p1.can("activate", "bloom")).toBe(false);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf(first)).toBe("gone"); // Temporary took it (it sat in base)
    expect(game.state("bloom").isExhausted).toBe(false);
    await game.p1.do("addResources", { energy: 4 });
    await game.p1.activate("bloom");
    await game.settle();
    const second = spritesOf(game);
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(first);
  });

  test.failing("BUG: partner Petal Pixie — the Bloom's Sprite token played to the Pixie's battlefield is a friendly [Temporary] unit there, so the Pixie should read 2 + 1 = 3; the token's keyword is invisible to the static and it stays 2", async () => {
    // Expected: Pixie 3 once the Sprite (keywords: [Temporary]) stands at bf1 — an inline Temporary
    // unit placed there DOES count. Actual: the ability-minted token is not counted (Pixie stays 2),
    // although game.state(sprite).keywords reports "Temporary".
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .legend(P1, CARD, "bloom")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", PETAL_PIXIE, "pixie")
      .build();
    expect(game.state("pixie").might).toBe(2);
    await game.p1.activate("bloom");
    await game.settle();
    // With a controlled battlefield the token's destination is a real choice (base or bf1).
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key) : [];
    expect(offered.some((z) => String(z).includes("bf1"))).toBe(true);
    expect(offered.some((z) => String(z).includes("base"))).toBe(true);
    await game.p1.pick("bf1");
    await game.settle();
    const sprite = spritesOf(game, "bf1")[0] as string;
    expect(sprite).toBeDefined();
    expect(game.state(sprite).isExhausted).toBe(false);
    expect(game.state("pixie").might).toBe(3);
  });

  test("partner — Lillia, Protector of Dreams: playing the Sprite token gives her +1 Might this turn and the Sprite has [Tank]", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).legend(P1, CARD, "bloom").unit(P1, "base", LILLIA_PROTECTOR, "lillia").build();
    expect(game.state("lillia").might).toBe(4);
    await game.p1.activate("bloom");
    await game.settle({ policy: "first" });
    const sprite = spritesOf(game)[0] as string;
    expect(game.state(sprite).keywords).toContain("Tank");
    expect(game.state("lillia").might).toBe(5);
    await game.advanceTurn();
    expect(game.state("lillia").might).toBe(4); // "this turn"
  });
});

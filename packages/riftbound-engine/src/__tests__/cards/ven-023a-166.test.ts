/**
 * Zed, From the Shadows — ven-023a-166 · Champion Unit (Zed) · Fury · 4 energy + [fury] · 4 Might
 *
 *   You may discard 1 as an additional cost to play me.
 *   When you play me, if you paid the additional cost, play a 0 [Might] Shadow Clone unit token.
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. The discard is an OPTIONAL additional cost (356.2.b): chosen as Zed is played, the card hits
 *      the trash before Zed lands (357.2); it never reduces the [4][fury] base cost, so 3 energy + a
 *      spare card is still not enough. With an empty hand Zed is simply played without the option.
 *   2. "if you paid the additional cost" gates the play trigger: unpaid → NO Shadow Clone, and the
 *      condition-false trigger never even reaches the chain. Paid-but-discounted still counts as paid
 *      (356.4.f.1) — not reachable here, noted only.
 *   3. The Shadow Clone (187.11) is a 0-Might domainless unit TOKEN: it enters exhausted (185.2.d),
 *      does not die at 0 damage (143.2.a needs NONZERO damage), is controlled/owned by Zed's controller
 *      (182/183), and — with a controlled battlefield — its controller picks base or that battlefield.
 *   4. Zed is a champion: the same play (with or without the discard) must work from the Champion
 *      Zone (355.10.a.1), charging the same [4][fury].
 *   5. Permanents do not use the chain: Zed is on the board the moment the play completes; only the
 *      (paid) trigger would ride the chain.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-023a-166";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla discard fodder
const clones = (ids: string[]) => ids.filter((c) => c.startsWith("token-shadow-clone-"));

function inHand(energy = 4) {
  return scenario()
    .resources(P1, { energy, power: { fury: 1 } })
    .hand(P1, CARD, "zed")
    .hand(P1, FILLER, "fodder");
}

describe("Zed, From the Shadows (ven-023a-166)", () => {
  test("card data: 4-cost [fury] champion unit, 4 Might, Zed tag; the paid-cost play trigger mints a 0-Might Shadow Clone", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 4, isChampion: true, might: 4, powerCost: ["fury"], tags: ["Zed"] });
    const trigger = (def?.abilities as Record<string, unknown>[]).find((a) => a.type === "triggered");
    expect(trigger).toMatchObject({
      condition: { type: "paid-additional-cost" },
      effect: { token: { might: 0, name: "Shadow Clone", type: "unit" }, type: "create-token" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
  });

  test("parsed abilities must also model 'You may discard 1 as an additional cost to play me' (optional additional-cost-option, discard 1 — 356.2.b)", async () => {
    // Expected: two abilities — a static additional-cost-option { discard: 1, optional: true } plus the trigger.
    // Actual: the parser emitted only the triggered ability, so the option is never offered.
    const def = (await loadDefaultCardPool()).get(CARD);
    const abilities = def?.abilities as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ effect: expect.objectContaining({ additionalCost: { discard: 1 }, optional: true, type: "additional-cost-option" }), type: "static" }),
      ]),
    );
  });

  test("plain play (cost NOT paid): 4 energy + [fury], Zed enters base exhausted at 4 Might immediately, the fodder stays in hand and NO Shadow Clone appears", async () => {
    const game = await inHand().build();
    await game.p1.play("zed");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("zed")).toBe("base"); // permanents skip the chain
    expect(game.chain()).toEqual([]); // condition-false trigger never triggers
    await game.settle();
    expect(game.state("zed")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.zoneOf("fodder")).toBe("hand");
    expect(clones([...game.p1.base(), ...game.p1.units()])).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
  });

  test("cost floor: unaffordable with 3 energy (a discard never discounts Zed) or without a fury power", async () => {
    const low = await inHand(3).build();
    expect(low.p1.can("play", "zed")).toBe(false);
    const noFury = await scenario().resources(P1, { energy: 4, power: { calm: 1 } }).hand(P1, CARD, "zed").hand(P1, FILLER, "fodder").build();
    expect(noFury.p1.can("play", "zed")).toBe(false);
    const r = await noFury.p1.try((p) => p.play("zed"));
    expect(r.ok).toBe(false);
    expect(noFury.zoneOf("zed")).toBe("hand");
  });

  test("empty hand besides Zed: the optional cost simply is not available, and Zed is still playable for [4][fury] with no token", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "zed").build();
    expect(game.p1.can("play", "zed")).toBe(true);
    const paid = await game.p1.try((p) => p.play("zed", { payOptional: true }));
    expect(paid.ok).toBe(false);
    await game.p1.play("zed");
    await game.settle();
    expect(game.zoneOf("zed")).toBe("base");
    expect(clones(game.p1.base())).toEqual([]);
  });

  test("champion zone: Zed can be played from the Champion Zone for the same [4][fury] (355.10.a.1); unpaid → no token", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).champion(P1, CARD, "zed").hand(P1, FILLER, "fodder").build();
    expect(game.p1.champion()).toBe("zed");
    await game.p1.playChampion("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("zed")).toBe("base");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.zoneOf("fodder")).toBe("hand");
    expect(clones(game.p1.base())).toEqual([]);
  });

  test("paying the optional cost — discard the chosen card (to trash, before Zed lands), pay [4][fury], then the play trigger plays ONE 0-Might exhausted Shadow Clone token in base", async () => {
    // Expected (356.2.b, 357.2, 187.11, 185.2.d): a payOptional variant with a discard choice exists; after it
    // resolves P1 controls Zed + exactly one `Shadow Clone` token: might 0, isToken, exhausted, alive.
    // Actual: no paid variant is enumerated (the additional-cost option was not parsed) → play() throws.
    const game = await inHand().build();
    await game.p1.play("zed", { answers: ["fodder"], payOptional: true });
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("zed")).toBe("base");
    await game.settle();
    const [tok, ...more] = clones(game.p1.base());
    expect(tok).toBeDefined();
    expect(more).toEqual([]);
    expect(game.state(tok!)).toMatchObject({ baseMight: 0, controller: P1, isExhausted: true, isToken: true, might: 0, name: "Shadow Clone", owner: P1 });
    expect(game.state(tok!).damage).toBe(0); // 0 damage on a 0-Might unit is not lethal (143.2.a)
  });

  test("the paid trigger rides the chain after Zed is already on the board — P2 gets priority before the Shadow Clone exists", async () => {
    // Expected: Zed in base at once; chain = [Zed trigger]; no token until both players pass.
    // Actual: the paid variant cannot be played at all (see above).
    const game = await inHand().build();
    await game.p1.play("zed", { answers: ["fodder"], payOptional: true });
    expect(game.zoneOf("zed")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zed", controller: P1, triggered: true })]);
    expect(clones(game.p1.base())).toEqual([]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    await game.settle();
    expect(clones(game.p1.base())).toHaveLength(1);
  });

  test("with a controlled battlefield the controller chooses where the Shadow Clone is played — picking bf1 puts it there, not in base", async () => {
    // Expected (rule 439.2.b.1 handling in create-token): a choose-destination prompt offering base | battlefield-bf1.
    // Actual: unreachable — the optional discard cost is not offered.
    const game = await inHand().battlefield("bf1", { controller: P1 }).build();
    await game.p1.play("zed", { answers: ["fodder"], payOptional: true, to: "base" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(clones(game.p1.units("bf1"))).toHaveLength(1);
    expect(clones(game.p1.base())).toEqual([]);
  });

  test("paying the discard from the CHAMPION ZONE works the same way (discard → trash, one Shadow Clone)", async () => {
    // Expected: playFromChampionZone also enumerates the paid-additional-cost variant. Actual: only the plain variant.
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).champion(P1, CARD, "zed").hand(P1, FILLER, "fodder").build();
    await game.p1.choose("playFromChampionZone:-", { payOptional: true, to: "base" }, { answers: ["fodder"] });
    await game.settle();
    expect(game.zoneOf("zed")).toBe("base");
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(clones(game.p1.base())).toHaveLength(1);
  });

  test("Zed fights as a plain 4-Might unit: attacking a 3-Might defender kills it, Zed survives and conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "def")
      .unit(P1, "base", CARD, "zed")
      .build();
    await game.p1.move("zed", "bf1");
    expect(game.chain()).toEqual([]); // no attack trigger on Zed himself
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("zed")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});

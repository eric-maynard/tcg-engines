/**
 * Legion Quartermaster — sfd-044-221 · Unit · Calm · 3 energy · 4 might
 *
 *   As an additional cost to play me, return a friendly gear to its owner's hand.
 *
 * Head-judge notes (trickiest situations for this card):
 *  - No "may": the extra cost is MANDATORY (356.2.a.1). With no friendly gear on the board the
 *    card cannot be played at all, however much energy you have. An ENEMY gear does not help, and
 *    neither does a gear in your hand/trash — "friendly" means a board permanent you control.
 *  - Costs are paid while finalizing the play, before anything resolves: the gear is already in
 *    hand by the time the Quartermaster could be responded to, and stays there even if he never lands.
 *  - "its OWNER's hand": a gear you control but your opponent owns goes back to THEIR hand.
 *  - Equipment is gear: an attached Equipment is a legal payment; it detaches and the unit loses
 *    the Might bonus. With several friendly gear the player chooses exactly one; the rest stay.
 *  - Natural partners (Calm): Seal of Focus (0-cost gear — bounce and replay for free) and Poro Snax
 *    ("When you play this, draw 1" — bounce it, replay it, draw again).
 *  - Plain unit otherwise: 3 energy, no power, enters exhausted, standard timing only.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-044-221";
const SEAL_OF_FOCUS = "ogn-081-298"; // Gear · Calm · 0 energy
const PORO_SNAX = "sfd-046-221"; // Gear · Calm · 1 energy · "When you play this, draw 1."
const DORANS_SHIELD = "sfd-033-221"; // Equipment · Calm · +1 Might

describe("Legion Quartermaster (sfd-044-221)", () => {
  test("parsed abilities: one static, NON-optional additional cost 'return a friendly gear to hand'", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 3, might: 4 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: {
        additionalCost: { returnToHand: { controller: "friendly", type: "gear" } },
        optional: false,
        type: "additional-cost-option",
      },
      type: "static",
    });
  });

  test("energy cost: 3 energy and no power; he lands in base exhausted as a 4-might unit; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, SEAL_OF_FOCUS, "seal").hand(P1, CARD, "lq").script(P1, ["seal"]).build();
    await game.p1.play("lq");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("lq")).toBe("base");
    expect(game.state("lq").might).toBe(4);
    expect(game.state("lq").isExhausted).toBe(true);
    const poor = await scenario().resources(P1, { energy: 2 }).gear(P1, SEAL_OF_FOCUS, "seal").hand(P1, CARD, "lq").build();
    expect(poor.p1.can("play", "lq")).toBe(false);
  });

  test("standard timing: not playable on the opponent's turn even with a gear and 3 energy", async () => {
    const game = await scenario().active(P2).resources(P1, { energy: 3 }).gear(P1, SEAL_OF_FOCUS, "seal").hand(P1, CARD, "lq").build();
    expect(game.p1.can("play", "lq")).toBe(false);
  });

  test("the additional cost is mandatory — with no friendly gear on the board he cannot be played (356.2.a.1)", async () => {
    // Expected: not legal. Actual: the returnToHand cost is ignored entirely and the play is offered.
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "lq").build();
    expect(game.p1.can("play", "lq")).toBe(false);
  });

  test("an ENEMY gear, or a friendly gear in hand, does not satisfy 'return a friendly gear' — still unplayable", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .gear(P2, SEAL_OF_FOCUS, "theirSeal")
      .hand(P1, SEAL_OF_FOCUS, "sealInHand")
      .hand(P1, CARD, "lq")
      .build();
    expect(game.p1.can("play", "lq")).toBe(false);
  });

  test("paying the cost returns the friendly gear to its owner's hand; the Quartermaster lands in base", async () => {
    // Expected: seal in P1's hand after the play. Actual: seal never leaves the base.
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, SEAL_OF_FOCUS, "seal").hand(P1, CARD, "lq").script(P1, ["seal"]).build();
    await game.p1.play("lq");
    // A cost is paid up front, not on resolution: the gear is gone from the board immediately.
    expect(game.zoneOf("seal")).toBe("hand");
    await game.settle();
    expect(game.zoneOf("lq")).toBe("base");
    expect(game.p1.hand()).toEqual(["seal"]);
    expect(game.p1.gear()).toEqual([]);
  });

  test("with two friendly gear exactly ONE (the chosen one) is returned; the other and the enemy's gear stay put", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .gear(P1, SEAL_OF_FOCUS, "keep")
      .gear(P1, PORO_SNAX, "bounce")
      .gear(P2, SEAL_OF_FOCUS, "theirs")
      .hand(P1, CARD, "lq")
      .script(P1, ["bounce"])
      .build();
    await game.p1.play("lq");
    await game.settle();
    expect(game.zoneOf("lq")).toBe("base");
    expect(game.zoneOf("bounce")).toBe("hand");
    expect(game.zoneOf("keep")).toBe("base");
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.state("theirs").owner).toBe(P2);
  });

  test("'its OWNER's hand' — a gear P1 controls but P2 owns goes back to P2's hand, not P1's", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .card("borrowed", { controller: P1, def: SEAL_OF_FOCUS, owner: P2, zone: "base" })
      .hand(P1, CARD, "lq")
      .script(P1, ["borrowed"])
      .build();
    expect(game.state("borrowed")).toMatchObject({ controller: P1, owner: P2 });
    await game.p1.play("lq");
    await game.settle();
    expect(game.zoneOf("lq")).toBe("base");
    expect(game.zoneOf("borrowed")).toBe("hand");
    expect(game.p2.hand()).toContain("borrowed");
    expect(game.p1.hand()).not.toContain("borrowed");
  });

  test("Equipment is gear — an attached Doran's Shield can pay the cost; it detaches to hand and its unit loses the +1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["shield"] })
      .gear(P1, DORANS_SHIELD, "shield", { attachedTo: "squire" })
      .hand(P1, CARD, "lq")
      .script(P1, ["shield"])
      .build();
    expect(game.state("squire").might).toBe(3);
    expect(game.p1.can("play", "lq")).toBe(true); // the only friendly gear is the attached Equipment — that suffices
    await game.p1.play("lq");
    await game.settle();
    expect(game.zoneOf("lq")).toBe("base");
    expect(game.zoneOf("shield")).toBe("hand");
    expect(game.state("shield").attachedTo).toBeUndefined();
    expect(game.state("squire").attachments).toEqual([]);
    expect(game.state("squire").might).toBe(2);
  });

  test.failing("BUG: partner line — bounce Poro Snax as the cost, replay it for 1 and draw again ('When you play this, draw 1')", async () => {
    // 3 (Quartermaster) + 1 (Snax replay) energy. Expected end state: both on board, P1 drew exactly one card.
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .gear(P1, PORO_SNAX, "snax")
      .hand(P1, CARD, "lq")
      .script(P1, ["snax"])
      .build();
    const deckBefore = game.p1.deck().length;
    await game.p1.play("lq");
    await game.settle();
    expect(game.zoneOf("snax")).toBe("hand");
    expect(game.p1.energy()).toBe(1);
    await game.p1.play("snax");
    await game.settle();
    expect(game.zoneOf("snax")).toBe("base");
    expect(game.zoneOf("lq")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("partner line — a returned Seal of Focus can simply be replayed the same turn", async () => {
    // Seal of Focus is printed at 0 energy + one [calm] pip, so the replay needs that pip in pool.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .gear(P1, SEAL_OF_FOCUS, "seal", { exhausted: true })
      .hand(P1, CARD, "lq")
      .script(P1, ["seal"])
      .build();
    await game.p1.play("lq");
    await game.settle();
    expect(game.zoneOf("seal")).toBe("hand");
    await game.p1.play("seal");
    await game.settle();
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.energy()).toBe(0);
  });
});

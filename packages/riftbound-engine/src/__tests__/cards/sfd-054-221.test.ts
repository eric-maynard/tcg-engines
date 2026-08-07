/**
 * Jax, Unmatched — sfd-054-221 · Champion Unit (Jax) · Calm · 5 energy + [calm] · 5 Might
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   Your Equipment everywhere have [Quick-Draw]. (Each gains [Reaction]. When you play it,
 *   attach it to a unit you control.)
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. Deflect (809) is a MANDATORY additional cost of one power of ANY domain, and only for
 *      OPPONENTS' spells/abilities — Jax's controller targets him for free.
 *   2. "everywhere" — the grant reaches Equipment in hand (that is the whole point: Reaction-speed
 *      plays from hand, 819.1.b–d), not just Equipment already on the board.
 *   3. "Equipment", not "gear": a plain (non-Equipment) gear must NOT pick up Quick-Draw/Reaction.
 *   4. Quick-Draw's play rider: "When you play it, attach it to a unit you control" — the
 *      Equipment never sits loose in base and no [Equip] cost is paid.
 *   5. The static works only while Jax is on the board (champion zone / hand is not the board),
 *      and switches off the moment he leaves.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-054-221";
const DORANS_SHIELD = "sfd-033-221"; // Equipment · Calm · 1 energy · +1 · [Equip][calm]
const SEAL = "ogn-120-298"; // Seal of Insight — a plain (non-Equipment) gear
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
};

describe("Jax, Unmatched (sfd-054-221)", () => {
  test("registry payload: Deflect 1 keyword", async () => {
    const game = await scenario().hand(P1, CARD, "jax").build();
    expect(game.state("jax")).toMatchObject({ baseMight: 5, cardType: "unit", energyCost: 5, name: "Jax, Unmatched" });
    expect(game.state("jax").powerCost).toEqual(["calm"]);
    const abilities = peekDefaultCardPool()?.get(CARD)?.abilities as { type: string; keyword?: string; value?: number }[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toEqual({ keyword: "Deflect", type: "keyword", value: 1 });
  });

  test.failing("BUG: registry payload — the static must address your EQUIPMENT (not all gear) EVERYWHERE (not just the board)", async () => {
    // Expected: target { type: "equipment", controller: "friendly", location: "anywhere" } so plain gear is
    // excluded and hand/deck/trash copies are included. Actual: { type: "gear", controller: "friendly" }.
    await scenario().build();
    const stat = peekDefaultCardPool()?.get(CARD)?.abilities?.[1] as { type: string; effect: Record<string, unknown> };
    expect(stat.type).toBe("static");
    expect(stat.effect).toMatchObject({ keyword: "Quick-Draw", type: "grant-keyword" });
    expect(stat.effect.target).toEqual({ controller: "friendly", location: "anywhere", type: "equipment" });
  });

  test("cost: 5 energy + 1 calm deducted; enters base exhausted as a 5-Might unit with Deflect; short on either ⇒ illegal", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { calm: 1 } }).hand(P1, CARD, "jax").build();
    await game.p1.play("jax");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("jax")).toBe("base");
    expect(game.state("jax")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.state("jax").keywords).toContain("Deflect");
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "jax").build()).p1.can("play", "jax")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { calm: 1 } }).hand(P1, CARD, "jax").build()).p1.can("play", "jax")).toBe(false);
  });

  test("Deflect: an opponent's spell cannot choose Jax with no power to spare, but can hit the vanilla unit beside him", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", CARD, "jax")
      .unit(P1, "base", { might: 2 }, "plain")
      .hand(P2, BOLT, "bolt")
      .build();
    const r = await game.p2.try((p) => p.cast("bolt", { targets: "jax" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bolt")).toBe("hand");
    await game.p2.cast("bolt", { targets: "plain" });
    expect(game.p2.energy()).toBe(0);
  });

  test("Deflect: the opponent pays one power of ANY domain (809.1.c.1) on top of the spell's cost; Jax takes the 2", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .unit(P1, "base", CARD, "jax")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "jax" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("jax").damage).toBe(2);
    expect(game.zoneOf("jax")).toBe("base");
  });

  test("Deflect taxes opponents only: Jax's controller targets him at the printed cost", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "jax").hand(P1, BOLT, "bolt").build();
    await game.p1.cast("bolt", { targets: "jax" });
    expect(game.p1.resources()).toEqual({ energy: 1 - 1, power: {} });
    await game.settle();
    expect(game.state("jax").damage).toBe(2);
  });

  test("static on the board: a friendly Equipment in base shows Quick-Draw; an enemy Equipment does not", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "jax")
      .gear(P1, DORANS_SHIELD, "mine")
      .gear(P2, DORANS_SHIELD, "theirs")
      .build();
    expect(game.state("mine").keywords).toContain("Quick-Draw");
    expect(game.state("theirs").keywords).not.toContain("Quick-Draw");
  });

  test.failing("BUG: 'Equipment' only — a plain gear (Seal of Insight) must not gain Quick-Draw", async () => {
    // Expected: only cardType "equipment" is addressed. Actual: the parsed target type "gear" also
    // matches ordinary gear, so the Seal is granted Quick-Draw (and with it Reaction timing).
    const game = await scenario().unit(P1, "base", CARD, "jax").gear(P1, DORANS_SHIELD, "shield").gear(P1, SEAL, "seal").build();
    expect(game.state("shield").keywords).toContain("Quick-Draw");
    expect(game.state("seal").keywords).not.toContain("Quick-Draw");
  });

  test.failing("BUG: 'everywhere' — an Equipment in HAND has Quick-Draw while Jax is on the board", async () => {
    // Expected: the hand copy is granted Quick-Draw (that is what enables Reaction plays). Actual: static
    // grants are only evaluated for board permanents, so the hand copy shows no granted keyword.
    const game = await scenario().unit(P1, "base", CARD, "jax").hand(P1, DORANS_SHIELD, "shield").build();
    expect(game.state("shield").keywords).toContain("Quick-Draw");
  });

  test("negative space: WITHOUT Jax on the board (he waits in the champion zone) an Equipment in hand is not playable on the opponent's turn", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .resources(P2, { energy: 1 })
      .champion(P1, CARD, "jax")
      .unit(P1, "base", { might: 2 }, "plain")
      .hand(P1, DORANS_SHIELD, "shield")
      .hand(P2, BOLT, "bolt")
      .build();
    expect(game.state("shield").keywords).not.toContain("Quick-Draw");
    await game.p2.cast("bolt", { targets: "plain" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.legal().some((o) => o.card === "shield")).toBe(false);
  });

  test.failing("BUG: Quick-Draw ⇒ Reaction (819.1.b): with Jax on the board, P1 may play an Equipment from hand in response on the OPPONENT's turn", async () => {
    // Expected: after P2's bolt goes on the chain and P2 passes, P1 (1 energy) is offered playing Doran's
    // Shield; doing so spends 1 energy and, on resolution, attaches it to a unit P1 controls (Jax is the
    // only one) — Jax becomes 6 Might before the bolt resolves. Actual: playGear is only ever legal in a
    // Neutral Open state on your own turn; Quick-Draw is not implemented.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .unit(P1, "base", CARD, "jax")
      .hand(P1, DORANS_SHIELD, "shield")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "jax" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    const opt = game.p1.legal().find((o) => o.card === "shield" && (o.verb === "equip" || o.verb === "play"));
    expect(opt).toBeDefined();
    await game.p1.choose(opt!.key, {}, { answers: ["jax"] });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("jax");
      await game.settle();
    }
    expect(game.state("shield").attachedTo).toBe("jax");
    expect(game.state("jax").might).toBe(6);
    expect(game.state("jax").damage).toBe(2);
  });

  test.failing("BUG: Quick-Draw play rider (819.1.d): on your own turn, playing an Equipment from hand attaches it at once — no loose gear, no [Equip] cost", async () => {
    // Expected: pay 1 energy for Doran's Shield; as its play resolves it is attached to a unit you control
    // (choose Jax) without paying the [calm] Equip cost → Jax 6 Might, calm power untouched.
    // Actual: the Equipment lands unattached in base and only the paid equipCard move attaches it.
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .unit(P1, "base", CARD, "jax")
      .unit(P1, "base", { might: 2 }, "plain")
      .hand(P1, DORANS_SHIELD, "shield")
      .build();
    await game.p1.play("shield", { answers: ["jax"] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("jax");
      await game.settle();
    }
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    expect(game.state("shield").attachedTo).toBe("jax");
    expect(game.state("jax").might).toBe(6);
  });

  test("the grant ends when Jax leaves the board: after an opponent's spell kills him, the on-board Equipment loses Quick-Draw", async () => {
    const bigBolt = { ...BOLT, abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], name: "Big Bolt" };
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { mind: 1 } })
      .unit(P1, "base", CARD, "jax")
      .gear(P1, DORANS_SHIELD, "shield")
      .hand(P2, bigBolt, "bolt")
      .build();
    expect(game.state("shield").keywords).toContain("Quick-Draw");
    await game.p2.cast("bolt", { targets: "jax" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // Deflect paid with a mind power
    await game.settle();
    expect(game.zoneOf("jax")).toBe("trash");
    expect(game.state("shield").keywords).not.toContain("Quick-Draw");
    expect(game.violations()).toEqual([]);
  });
});

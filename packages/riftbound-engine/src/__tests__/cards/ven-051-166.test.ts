/**
 * Iterative Design — ven-051-166 · Spell · Mind · 4 energy
 *
 *   Play a 3 [Might] Mech unit token.
 *   [Flow] [2][mind] (You may play this from your trash for its Flow cost. Then banish it.)
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. The Mech (187.4) is a domainless 3-Might unit TOKEN with the Mech TAG: it enters exhausted
 *      (185.2.d), is controlled/owned by the caster (182/183), and — with no location printed — its
 *      controller picks base or a battlefield they CONTROL when one exists (occupied-but-uncontrolled is
 *      not offered). Tag check via partners: Rumble, Scrapper ("Your Mechs have +1 Might") makes it 4;
 *      Production Surge ("costs [2] less if you control a Mech") gets cheaper once it lands.
 *   2. Flow (829): an ALTERNATE cost [2][mind] payable only from the TRASH; it replaces the [4] base
 *      cost (829.1.c.1), and the spell is BANISHED instead of trashed when it leaves the chain
 *      (829.1.b.1) — so it can be Flowed at most once. From hand it always costs [4] and goes to the
 *      trash, from where it becomes a Flow candidate the same turn.
 *   3. Flow does not add timing (829.1.b.2): no [Action]/[Reaction] → not on the opponent's turn, not
 *      during a showdown, not while a chain is open — from hand OR trash.
 *   4. Cost edges: hand cast needs 4 energy (mind power irrelevant); Flow needs BOTH 2 energy and a
 *      MIND power (a calm power does not pay [mind]).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-051-166";
const RUMBLE_SCRAPPER = "sfd-089-221"; // Your Mechs have +1 [Might] (including me).
const PRODUCTION_SURGE = "sfd-076-221"; // 4 + [mind]: This costs [2] less if you control a Mech. Play a Mech token to your base. Draw 1.
const mechs = (ids: string[]) => ids.filter((c) => c.startsWith("token-mech-"));

function inHand(energy = 4) {
  return scenario().resources(P1, { energy }).hand(P1, CARD, "design");
}

function inTrash(res: { energy?: number; power?: Record<string, number> } = { energy: 2, power: { mind: 1 } }) {
  return scenario().resources(P1, res).trash(P1, CARD, "design");
}

describe("Iterative Design (ven-051-166)", () => {
  test("parsed abilities: spell effect create-token (3-Might Mech unit) + Flow keyword costing [2][mind]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "mind", energyCost: 4 });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = def?.abilities as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ effect: { token: { might: 3, name: "Mech", type: "unit" }, type: "create-token" }, type: "spell" });
    expect(abilities[1]).toMatchObject({ cost: { energy: 2, power: ["mind"] }, keyword: "Flow", type: "keyword" });
  });

  test("from hand: costs 4 energy; resolves into ONE exhausted 3-Might Mech token in the caster's base; the spell goes to the TRASH (not banishment)", async () => {
    const game = await inHand().build();
    await game.p1.cast("design");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("design")).toBe("chain");
    expect(mechs(game.p1.base())).toEqual([]); // nothing before resolution
    await game.settle();
    const toks = mechs(game.p1.base());
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ baseMight: 3, cardType: "unit", controller: P1, isExhausted: true, isToken: true, might: 3, name: "Mech", owner: P1 });
    expect(mechs(game.p2.base())).toEqual([]);
    expect(game.zoneOf("design")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
  });

  test("cost floor from hand: 3 energy (even with mind power to spare) is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 2 } }).hand(P1, CARD, "design").build();
    expect(game.p1.can("cast", "design")).toBe(false);
    const r = await game.p1.try((p) => p.cast("design"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("design")).toBe("hand");
  });

  test("token destination: with a controlled battlefield the caster picks base or that battlefield — an occupied-but-uncontrolled one is not offered", async () => {
    const game = await inHand()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf2", { might: 1, name: "Squatter" }, "squatter")
      .build();
    await game.p1.cast("design");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(new Set(d?.kind === "pick" ? d.options.map((o) => o.key) : [])).toEqual(new Set(["base", "battlefield-bf1"]));
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(mechs(game.p1.units("bf1"))).toHaveLength(1);
    expect(mechs(game.p1.base())).toEqual([]);
  });

  test("the token carries the Mech TAG: with Rumble, Scrapper on board it is a 4-Might Mech; Production Surge then costs [2] less", async () => {
    // Control: 2 energy + [mind] and NO Mech → Production Surge (4 + [mind]) is out of reach.
    const noMech = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).hand(P1, PRODUCTION_SURGE, "surge").build();
    expect(noMech.p1.can("cast", "surge")).toBe(false);
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 1 } })
      .unit(P1, "base", RUMBLE_SCRAPPER, "rumble")
      .hand(P1, CARD, "design")
      .hand(P1, PRODUCTION_SURGE, "surge")
      .build();
    await game.p1.cast("design");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "surge")).toBe(false); // chain open: no standard-speed spell
    await game.settle();
    const [tok] = mechs(game.p1.base());
    expect(game.state(tok!).might).toBe(4); // 3 + Rumble's Mech lord bonus
    expect(game.p1.can("cast", "surge")).toBe(true); // now controls a Mech → [4] − [2] = 2 energy + [mind]
    await game.p1.cast("surge");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });

  test("Flow from trash: pays exactly [2][mind] (not 4), plays the Mech, then the spell is BANISHED — and cannot be Flowed again (829.1.b.1, 829.1.c.1)", async () => {
    const game = await inTrash({ energy: 6, power: { mind: 2 } }).build();
    expect(game.p1.can("cast", "design")).toBe(true);
    expect(game.p1.option("cast", "design")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
    await game.p1.cast("design", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 1 } });
    expect(game.zoneOf("design")).toBe("chain");
    await game.settle();
    expect(mechs(game.p1.base())).toHaveLength(1);
    expect(game.zoneOf("design")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("design");
    expect(game.p1.can("cast", "design")).toBe(false); // banishment is not the trash (155)
  });

  test("Flow cost edges: needs BOTH the 2 energy and a MIND power — 1 energy + mind, or 2 energy + calm only, cannot Flow", async () => {
    const lowEnergy = await inTrash({ energy: 1, power: { mind: 3 } }).build();
    expect(lowEnergy.p1.can("cast", "design")).toBe(false);
    const wrongPower = await inTrash({ energy: 9, power: { calm: 2 } }).build();
    expect(wrongPower.p1.can("cast", "design")).toBe(false);
    const r = await wrongPower.p1.try((p) => p.cast("design", { flow: true }));
    expect(r.ok).toBe(false);
    expect(wrongPower.zoneOf("design")).toBe("trash");
  });

  test("a card in the trash can ONLY be played via Flow: with 4 energy and no mind power the trash copy is not castable at its base cost", async () => {
    const game = await inTrash({ energy: 4 }).build();
    expect(game.p1.can("cast", "design")).toBe(false);
    const r = await game.p1.try((p) => p.cast("design"));
    expect(r.ok).toBe(false);
    expect(game.p1.energy()).toBe(4);
  });

  test("hand → trash → Flow in one turn: cast for 4 (trash), then Flow it back for [2][mind] (banished) — two Mechs total, 6 energy + 1 mind spent", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { mind: 1 } }).hand(P1, CARD, "design").build();
    await game.p1.cast("design");
    expect(game.p1.energy()).toBe(2); // base cost from hand even though Flow exists
    await game.settle();
    expect(game.zoneOf("design")).toBe("trash");
    await game.p1.cast("design", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(mechs(game.p1.base())).toHaveLength(2);
    expect(game.zoneOf("design")).toBe("banishment");
  });

  test("timing (829.1.b.2): no [Action]/[Reaction] — neither the hand copy nor the trash (Flow) copy is playable on the opponent's turn", async () => {
    const hand = await inHand().active(P2).build();
    expect(hand.p1.can("cast", "design")).toBe(false);
    const trash = await inTrash().active(P2).build();
    expect(trash.p1.can("cast", "design")).toBe(false);
    const r = await trash.p1.try((p) => p.cast("design", { flow: true }));
    expect(r.ok).toBe(false);
    expect(trash.zoneOf("design")).toBe("trash");
  });

  test("timing: not during a showdown (even with Focus) and not in response on an open chain", async () => {
    const sd = await inTrash({ energy: 6, power: { mind: 1 } })
      .hand(P1, CARD, "design2")
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .autoProcedures(false)
      .build();
    await sd.p1.move("scout", "bf1"); // empty uncontrolled battlefield → non-combat showdown, P1 has Focus
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("cast", "design")).toBe(false);
    expect(sd.p1.can("cast", "design2")).toBe(false);
    // Open chain: P2 casts on their turn, P1 gets priority but Iterative Design is standard speed.
    const chain = await scenario()
      .active(P2)
      .resources(P1, { energy: 6, power: { mind: 1 } })
      .resources(P2, { energy: 4 })
      .trash(P1, CARD, "design")
      .hand(P1, CARD, "design2")
      .hand(P2, CARD, "theirs")
      .build();
    await chain.p2.cast("theirs");
    await chain.p2.passPriority();
    expect(chain.actingSeat()).toBe(P1);
    expect(chain.p1.can("cast", "design")).toBe(false);
    expect(chain.p1.can("cast", "design2")).toBe(false);
  });

  test("the Mech is a real unit next turn: it readies at P1's Awaken and can attack — 3 Might kills a 2-Might defender and conquers", async () => {
    const game = await inHand()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
      .build();
    await game.p1.cast("design");
    await game.settle(); // no controlled battlefield → straight to base, no prompt
    const [tok] = mechs(game.p1.base());
    expect(game.state(tok!).isExhausted).toBe(true);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state(tok!).isReady).toBe(true);
    await game.p1.move(tok!, "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf(tok!)).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});

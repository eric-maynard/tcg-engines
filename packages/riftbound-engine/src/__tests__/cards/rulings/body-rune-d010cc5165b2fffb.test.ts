/**
 * Ruling d010cc5165b2fffb — Body Rune (OGN-126 → ogn-126-298) / Order Rune (OGN-214 → ogn-214-298)
 *   × Doran's Blade (SFD-095 → sfd-095-221) · Equipment · +2 Might · "[Equip] [body]"
 *   × Grand Duelist (SFD-205 → sfd-205-221, Fiora legend) "When one of your units becomes [Mighty], you may exhaust me to
 *     channel 1 rune exhausted."
 *
 * Q: All my runes are Body, none Order. I make a unit Mighty with Doran's Blade; Grand Duelist channels a rune and it is an
 *    Order rune — can I now pay that Order rune to ready the unit (given an effect that costs [order] to ready)?
 * A: Yes. Equipping the Blade takes the unit to 5+ (becomes Mighty) → Grand Duelist may exhaust to channel the top rune;
 *    once on the board it is a resource you control. It arrives EXHAUSTED, so it can't be tapped for energy, but it can be
 *    RECYCLED for [order] power (163.2.b) to pay an [order] cost. Channeling itself readies nothing — you still need the effect.
 * Rules: 709 (becomes Mighty), 163.2.a/b (exhaust a rune → energy; recycle a rune → power of its domain), 718.4 (Equipment bonus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BODY_RUNE = "ogn-126-298";
const ORDER_RUNE = "ogn-214-298";
const DORANS_BLADE = "sfd-095-221";
const GRAND_DUELIST = "sfd-205-221";
/** The "ability that readies a unit for an Order rune" the answer presupposes: inline Action spell, cost [0][order], "Ready a unit." */
const RALLY = {
  abilities: [{ effect: { target: { type: "unit" }, type: "ready" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Test Rally",
  powerCost: ["order"],
  timing: "action",
};

/**
 * P1's turn (Grand Duelist). Rune pool: three ready BODY runes only; rune deck (top first): Order, Body, Body.
 * In base: an EXHAUSTED 3-Might Duelist and an unattached Doran's Blade. Hand: Rally ([order]).
 */
function board() {
  return scenario()
    .legend(P1, GRAND_DUELIST, "fiora")
    .fillDecks({ main: 10, runes: 0 })
    .runes(P1, "body", 3)
    .runeDeck(P1, [ORDER_RUNE, BODY_RUNE, BODY_RUNE])
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Duelist" }, "duelist", { exhausted: true })
    .gear(P1, DORANS_BLADE, "blade")
    .hand(P1, RALLY, "rally");
}

/** Recycle a Body rune for [body], Equip the Blade to the Duelist (3 → 5), accept Grand Duelist, resolve. Returns the game. */
async function bladeMakesMighty(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.runes({ domain: "order" })).toEqual([]);
  expect(game.p1.can("cast", "rally")).toBe(false); // no [order] anywhere yet
  await game.p1.recycleRune({ domain: "body" });
  expect(game.p1.power("body")).toBe(1);
  await game.p1.choose("equipCard", { params: { equipmentId: "blade", unitId: "duelist" } });
  expect(game.p1.power("body")).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Equip resolves: 3 + 2 = 5 → BECOMES Mighty
  expect(game.state("duelist")).toMatchObject({ attachments: ["blade"], might: 5 });
  const d = game.decision();
  expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "fiora" } });
  await game.p1.yes();
  expect(game.state("fiora").isExhausted).toBe(true);
  await game.p1.passPriority();
  await game.p2.passPriority(); // channel 1 rune exhausted
  return game;
}

describe("Ruling d010cc5165b2fffb — the Order rune Grand Duelist channels is yours to spend (recycle it for [order])", () => {
  test("Doran's Blade taking the Duelist 3 → 5 is 'becoming Mighty': Grand Duelist offers its exhaust-to-channel, and the top rune — the ORDER rune — lands in the pool EXHAUSTED", async () => {
    const game = await bladeMakesMighty();
    const order = game.p1.runes({ domain: "order" });
    expect(order).toHaveLength(1);
    expect(game.state(order[0]!).isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(3); // 3 body - 1 recycled + 1 channeled
    expect(game.p1.runeDeck().map((r) => game.state(r).domains[0])).toEqual(["body", "body", "body"]); // Order rune left the deck; the recycled Body rune went to the bottom
    expect(game.state("duelist").isExhausted).toBe(true); // channeling readied nothing by itself
    expect(game.chain()).toEqual([]);
  });

  test("the channeled Order rune is a game object P1 controls: it can't be TAPPED (already exhausted) but it CAN be recycled, adding [order] to the pool (163.2.b)", async () => {
    const game = await bladeMakesMighty();
    const order = game.p1.runes({ domain: "order" })[0]!;
    expect(game.p1.can("exhaustRune", order)).toBe(false);
    expect(game.p1.can("recycleRune", order)).toBe(true);
    await game.p1.recycleRune(order);
    expect(game.p1.power("order")).toBe(1);
    expect(game.p1.runes({ domain: "order" })).toEqual([]);
    expect(game.zoneOf(order)).toBe("runeDeck");
  });

  test("…and that [order] pays the ready effect: Rally (cost [order]) becomes castable only now, and readies the Mighty Duelist", async () => {
    const game = await bladeMakesMighty();
    expect(game.p1.can("cast", "rally")).toBe(false); // an exhausted rune in the pool is not yet power
    await game.p1.recycleRune(game.p1.runes({ domain: "order" })[0]!);
    expect(game.p1.can("cast", "rally")).toBe(true);
    await game.p1.cast("rally", { targets: "duelist" });
    expect(game.p1.power("order")).toBe(0);
    await game.settle();
    expect(game.state("duelist")).toMatchObject({ isReady: true, might: 5 });
    expect(game.violations()).toEqual([]);
  });
});

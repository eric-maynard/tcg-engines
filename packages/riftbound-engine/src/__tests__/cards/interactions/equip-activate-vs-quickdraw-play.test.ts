/**
 * Interaction: Jax, Unmatched (sfd-054-221) · Champion Unit · Calm · [5][calm] · 5 Might
 *     "[Deflect] … Your Equipment everywhere have [Quick-Draw]."
 *   × Long Sword (sfd-022-221) · Equipment · Fury · [2][fury] · +2 Might
 *     "[Quick-Draw] … [Equip] [fury]"
 *   × Cloth Armor (sfd-064-221) · Equipment · Mind · [1] · "[Quick-Draw] … [Equip] [mind] … [Shield 2]"
 *
 * Rules: 819.1 ([Quick-Draw] = the card gains [Reaction] AND "when you play it, attach it to a unit you control"),
 * 818.1 / 818.1.b / 818.1.b.1 ([Equip] is an ACTIVATED ability of a Gear with a cost, whose chosen unit is a
 * Target), 151.2 (a Gear's activated ability is Main-Phase / Open-State only), 159.2.b.2 (a Closed State is a legal
 * [Reaction] window), 434.5 (attaching changes only Attached-ness and location), 150.3 (activating puts the ability
 * on the chain).
 *
 * Question — P1 controls Jax, has Long Sword already on the board UNATTACHED, and holds Cloth Armor. P2's spell is
 * on the chain (a Closed State).
 *   (a) May P1 play Cloth Armor from hand onto a unit right now, and what does the attaching?
 *   (b) May P1 activate Long Sword's printed "[Equip] [fury]" from the board right now?
 *   (c) No-Jax side: what changes for each of (a) and (b)?
 *
 * Answer:
 *  (a) YES — and no Equip activation is involved. [Quick-Draw] is BOTH a permission (the card has [Reaction], so it
 *      may be played in a Closed State, 159.2.b.2) and a triggered ability ("when you play it, attach it to a unit
 *      you control") which is what attaches it (819.1). Cloth Armor prints Quick-Draw itself; Jax grants it to all
 *      of P1's Equipment anyway. The attach alters nothing else about either card (434.5).
 *  (b) NO — for TIMING, not for the unit. [Equip] is an activated ability on a Gear (818.1 / 818.1.b, its unit a
 *      Target per 818.1.b.1), and a Gear's activated ability is Main-Phase-Open-State only (151.2).
 *  (c) Without Jax, (a) is unchanged (Cloth Armor prints Quick-Draw); Long Sword played FROM HAND likewise stays
 *      Reaction-legal because it prints Quick-Draw too — but (b) is still NO, because Quick-Draw is a PLAY
 *      permission, not an Equip permission. One card, two different permissions.
 *
 * Teaching note for the surfaces: the equip paths must cite 818 ([Equip]) and 819 ([Quick-Draw]). Rule 476.1 is
 * "Layers are applied in sequence" and has nothing to do with equipment. And a single "Can't equip that unit" toast
 * cannot cover both refusals: the two axes are independent and the engine separates them — see the matrix facet.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../../harness";

const JAX = "sfd-054-221";
const LONG_SWORD = "sfd-022-221";
const CLOTH_ARMOR = "sfd-064-221";

/** P2's own [Action] spell — the cheapest way to open a chain (a Closed State) on P2's turn. */
const PONDER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Ponder",
  rulesText: "Draw 1.",
  timing: "action",
} as const;

const equipOptions = (game: Game) => game.p1.legal().filter((o) => o.moveId === "equipCard");

/**
 * P2's turn. P1: Jax (optional) + a 3-Might Squire in base, Long Sword loose on the board, Cloth Armor and a
 * second Long Sword in hand. Pool: [3] Energy + [fury][fury] — enough for either play and for an Equip.
 */
function board(opts: { jax?: boolean } = {}) {
  const b = scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { fury: 2 } })
    .unit(P1, "base", { might: 3, name: "Squire" }, "squire")
    .gear(P1, LONG_SWORD, "sword")
    .hand(P1, CLOTH_ARMOR, "armor")
    .hand(P1, LONG_SWORD, "swordInHand")
    .hand(P2, PONDER, "ponder");
  return opts.jax === false ? b : b.unit(P1, "base", JAX, "jax");
}

/** P2 casts its spell and passes: P1 now holds Priority in a Closed State. */
async function chainOpen(opts: { jax?: boolean } = {}): Promise<Game> {
  const game = await board(opts).build();
  await game.p2.cast("ponder");
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.chain().map((i) => i.cardId)).toEqual(["ponder"]);
  return game;
}

describe("Jax's Quick-Draw × Long Sword's [Equip] — one card, two different permissions", () => {
  // ── premise: the two abilities are separate objects on the card ──────────────────────────────────

  test("premise: Long Sword's printed abilities are TWO distinct things — the [Quick-Draw] keyword (819) and the [Equip] keyword with cost [fury] (818); Jax grants Quick-Draw, never Equip", async () => {
    const def = (await loadDefaultCardPool()).get(LONG_SWORD);
    expect(def?.abilities).toEqual([
      { keyword: "Quick-Draw", type: "keyword" },
      { cost: { power: ["fury"] }, keyword: "Equip", type: "keyword" },
    ]);
    const game = await board().build();
    expect(game.state("sword").keywords).toEqual(expect.arrayContaining(["Equip", "Quick-Draw"]));
    expect(game.state("armor").keywords).toEqual(expect.arrayContaining(["Equip", "Quick-Draw"]));
    expect(game.state("jax").keywords).not.toContain("Equip");
  });

  // ── (a) playing Cloth Armor in a Closed State ────────────────────────────────────────────────────

  test("(a) with P2's spell on the chain, playing Cloth Armor from hand IS legal — [Quick-Draw] gives the CARD [Reaction] (819.1) and a Closed State is a Reaction window (159.2.b.2)", async () => {
    const game = await chainOpen();
    expect(game.p1.can("play", "armor")).toBe(true);
    expect(equipOptions(game)).toEqual([]); // …and this play is not an Equip activation
  });

  test("(a) what attaches it is the Quick-Draw TRIGGER, not [Equip]: no Equip cost ([mind]) is charged, only the [1] play cost, and the attach offers only units P1 controls", async () => {
    const game = await chainOpen();
    await game.p1.play("armor");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } }); // [1] paid; no [mind] anywhere
    expect(game.zoneOf("armor")).toBe("base"); // 337.2 — a Gear resolves on finalization
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["jax", "squire"]);
    await game.p1.pick("squire");
    await game.settle();
    expect(game.state("armor").attachedTo).toBe("squire");
    expect(game.state("squire").attachments).toEqual(["armor"]);
    expect(game.state("squire").might).toBe(3); // Cloth Armor's bonus is [Shield 2] — defender-only, not flat
    expect(game.violations()).toEqual([]);
  });

  test("(a) 434.5 — attaching changes nothing else: Cloth Armor is still ready and unexhausted, its host keeps its damage/ready state, and P2's spell is untouched on the chain", async () => {
    const game = await chainOpen();
    await game.p1.play("armor", { answers: ["squire"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("squire");
    }
    expect(game.chain().map((i) => i.cardId)).toContain("ponder");
    await game.settle();
    expect(game.state("armor")).toMatchObject({ attachedTo: "squire", isReady: true, zone: "base" });
    expect(game.state("squire")).toMatchObject({ damage: 0, isReady: true });
  });

  // ── (b) activating [Equip] in a Closed State ─────────────────────────────────────────────────────

  test("(b) [Equip] is a Gear ACTIVATED ability (818.1) and is Main-Phase-Open-State only (151.2): with a chain open it is absent from P1's menu and the move is rejected — although a friendly unit is right there", async () => {
    const game = await chainOpen();
    expect(game.p1.units("base")).toEqual(expect.arrayContaining(["jax", "squire"]));
    expect(game.p1.power("fury")).toBe(2); // the cost is affordable — this is not a money problem
    expect(equipOptions(game)).toEqual([]);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "sword", unitId: "squire" }))).ok).toBe(false);
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.state("squire").attachments).toEqual([]);
  });

  test("(b) the matrix that separates the two refusals — vary ONLY the timing and Equip appears; vary ONLY the unit and it disappears again ('wrong timing' ≠ 'not a unit you control')", async () => {
    // A: P1's own open Main Phase, friendly unit present → offered.
    const own = await board().active(P1).build();
    expect(own.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(equipOptions(own).flatMap((o) => o.variants.map((v) => v.params.unitId)).sort()).toEqual(["jax", "squire"]);
    // B: same board, chain open → gone (151.2, timing).
    const closed = await chainOpen();
    expect(equipOptions(closed)).toEqual([]);
    // C: P1's own open Main Phase but only an ENEMY unit exists → gone (818.1.b, "a unit you control").
    const enemyOnly = await scenario()
      .resources(P1, { power: { fury: 2 } })
      .gear(P1, LONG_SWORD, "sword")
      .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
      .build();
    expect(enemyOnly.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(enemyOnly.p1.legal().filter((o) => o.moveId === "equipCard")).toEqual([]);
    expect((await enemyOnly.p1.try((p) => p.do("equipCard", { equipmentId: "sword", unitId: "foe" }))).ok).toBe(false);
    expect(enemyOnly.state("foe").attachments).toEqual([]);
  });

  test("(b) …and in P1's own Main Phase the activation behaves like an activated ability should: the cost [fury] is paid up front, an item goes on the chain, and the attach lands on resolution (818.1 / 150.3)", async () => {
    const game = await board().active(P1).build();
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } }); // [fury] only, no Energy
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sword", controller: P1, triggered: false })]);
    expect(game.state("sword").attachedTo).toBeUndefined();
    await game.settle();
    expect(game.state("sword").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(5); // 3 + Long Sword's +2
  });

  // ── (c) the no-Jax side ──────────────────────────────────────────────────────────────────────────

  test("(c) without Jax, (a) is unchanged: Cloth Armor prints its own [Quick-Draw], so the Closed-State play and the attach happen exactly as before", async () => {
    const game = await chainOpen({ jax: false });
    expect(game.p1.units("base")).toEqual(["squire"]); // no Jax anywhere on the board
    expect(game.has("jax")).toBe(false);
    expect(game.p1.can("play", "armor")).toBe(true);
    await game.p1.play("armor");
    await game.settle();
    expect(game.state("armor").attachedTo).toBe("squire");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } });
  });

  test("(c) without Jax, playing Long Sword FROM HAND also stays Reaction-legal (it prints Quick-Draw too) — [2][fury] paid, attached by the trigger, +2 Might", async () => {
    const game = await chainOpen({ jax: false });
    expect(game.p1.can("play", "swordInHand")).toBe(true);
    await game.p1.play("swordInHand");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    await game.settle();
    expect(game.state("swordInHand").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(5);
  });

  test("(c) without Jax, (b) is STILL no: Quick-Draw is a PLAY permission, never an Equip permission — the loose sword's [Equip] is absent from the same Closed-State menu", async () => {
    const game = await chainOpen({ jax: false });
    expect(game.state("sword").keywords).toEqual(expect.arrayContaining(["Equip", "Quick-Draw"]));
    expect(equipOptions(game)).toEqual([]);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "sword", unitId: "squire" }))).ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Interaction: Deadly Flourish (unl-073-219) — Spell, Mind, 4
 *     "Deal 3 to an enemy unit. When it dies this turn, play a Gold gear token exhausted."
 *   × Tactical Retreat (unl-175-219) — Spell, Order, 2, [Reaction]
 *     "Choose a friendly unit. The next time it would die this turn, heal it, exhaust it, and
 *      recall it instead. (Send it to base. This isn't a move.)"
 *   × Retreat (ogn-104-298) — Spell, Mind, 1, [Reaction]
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   (+ Shen, Kinkou ogn-241-298 — a [Reaction]-speed 3-Might unit, used as the unit that can
 *      legally re-enter the board during P1's turn for line (c).)
 *
 * Question: P1 resolves Deadly Flourish on P2's 5-Might unit X at a battlefield; X survives with 3.
 *   (a) Later this turn X takes 2 more and would die, but P2's Tactical Retreat (armed earlier this
 *       turn) replaces the death: heal, exhaust, recall. Gold for P1?
 *   (b) Same turn, after (a), P1 deals 5 to X in P2's base and X dies. Gold now — although X is no
 *       longer at a battlefield, was healed and was recalled in between? Who owns/controls it?
 *   (c) Alternative line: right after Deadly Flourish resolves P2 Retreats X to hand; the same
 *       card re-enters the board later this turn and dies. Gold?
 *   (d) X simply survives the turn and dies during the next turn. Gold?
 *
 * Rules:
 *   390.2 / 390.5, 390.5.a, 390.5.c.2  the second sentence is a delayed LINKED triggered ability
 *              tied to the specific object X, live while X stays on the board this turn.
 *   370.1.a.1 (cf. 808.1.d.1)  a replaced death never happened → "when it dies" is not met (a).
 *   455 / 456 / 458.1  a recall is not a move nor a zone change → X is still the same tracked
 *              object; the delayed trigger stays armed (a → b).
 *   191.4 / 191.4.a, 182, 183  the trigger is P1's (controller of Deadly Flourish); P1 plays,
 *              controls and owns the Gold token, which enters exhausted (b). X → P2's trash (323.5).
 *   124 / 124.1, 390.5.a  hand is a non-board zone → X becomes a NEW object, the delayed ability's
 *              window closes; a replayed copy dying this turn is not "it" (c).
 *   317.2.c    "this turn" effects expire in the Expiration Step → nothing next turn (d).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEADLY_FLOURISH = "unl-073-219";
const TACTICAL_RETREAT = "unl-175-219";
const RETREAT = "ogn-104-298";
const SHEN_KINKOU = "ogn-241-298";

/** Inline 0-cost action spell: deal N to a unit (the "another spell" damage packets). */
const bolt = (n: number) => ({
  abilities: [{ effect: { amount: n, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: `Bolt ${n}`,
  timing: "action",
});

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

const golds = (game: Game, seat: "p1" | "p2") => game[seat].gear().filter((id) => game.state(id).name === "Gold");

/**
 * P1's turn. P2's X (5 Might vanilla) holds bf1; P2 has Tactical Retreat (2) in hand and the energy
 * for it. P1 has Deadly Flourish (4) plus a Bolt 2 and a Bolt 5.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Xerxes" }, "x")
    .hand(P1, DEADLY_FLOURISH, "df")
    .hand(P1, bolt(2), "bolt2")
    .hand(P1, bolt(5), "bolt5")
    .hand(P2, TACTICAL_RETREAT, "tr");
}

/** P1 casts Deadly Flourish on X; P2 answers with Tactical Retreat on X; both resolve (TR first). */
async function flourishWithShield(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("df", { targets: "x" });
  await game.p1.passPriority();
  await game.p2.cast("tr", { targets: "x" });
  expect(game.chain().map((i) => i.cardId)).toEqual(["df", "tr"]);
  await game.settle();
  expect(game.zoneOf("df")).toBe("trash");
  expect(game.zoneOf("tr")).toBe("trash");
  return game;
}

/**
 * Line (c): X is Shen, Kinkou entering buffed (4 Might) so he survives the 3. P2 holds Retreat (1)
 * and can afford to replay Shen (3 + [order]) at Reaction speed; a 2-Might bystander in P2's base
 * gives P1's "poke" something to aim at so a chain opens for P2's reactions.
 */
function bounceBoard() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 4, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SHEN_KINKOU, "shen", { buffed: true })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "by")
    .hand(P1, DEADLY_FLOURISH, "df")
    .hand(P1, bolt(2), "bolt2")
    .hand(P1, bolt(1), "poke")
    .hand(P1, bolt(5), "bolt5")
    .hand(P2, RETREAT, "ret");
}

describe("Deadly Flourish — the delayed 'when it dies this turn' trigger follows the OBJECT: recall keeps it, bounce forgets it", () => {
  test("setup: Deadly Flourish (4) deals 3 to the 5-Might X, which survives at bf1 with 3 damage; Tactical Retreat (2) resolved first and armed its one-shot shield; no Gold yet", async () => {
    const game = await flourishWithShield();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.energy()).toBe(0);
    expect(game.state("x")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(golds(game, "p1")).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("(a) X takes 2 more (lethal) but Tactical Retreat replaces the death: X healed to 0, exhausted, recalled to P2's base — not in the trash", async () => {
    const game = await flourishWithShield();
    await game.p1.cast("bolt2", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("base");
    expect(game.state("x")).toMatchObject({ controller: P2, damage: 0, isExhausted: true });
    expect(game.p2.trash()).not.toContain("x");
    expect(game.gameState.unitsMovedThisTurn?.[P2] ?? 0).toBe(0); // recall is not a move (456)
  });

  test("(a) a replaced death never happened (370.1.a.1): NO Gold token for P1, nothing goes on the chain", async () => {
    const game = await flourishWithShield();
    const p1Base = game.p1.base().length;
    await game.p1.cast("bolt2", { targets: "x" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(golds(game, "p1")).toEqual([]);
    expect(golds(game, "p2")).toEqual([]);
    expect(game.p1.base()).toHaveLength(p1Base);
    expect(game.chain()).toEqual([]);
  });

  test("(b) after the recall X is still the same object: 5 damage in P2's base kills it → the delayed trigger fires and P1 gets exactly one Gold token (390.5.a, 458.1)", async () => {
    const game = await flourishWithShield();
    await game.p1.cast("bolt2", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("base"); // healed, recalled, no longer at a battlefield
    await game.p1.cast("bolt5", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p2.trash()).toContain("x"); // owner's trash (323.5)
    expect(golds(game, "p1")).toHaveLength(1);
    expect(golds(game, "p2")).toEqual([]);
  });

  test("(b) the Gold token is played by P1 — controller AND owner P1 — and enters exhausted (191.4.a, 182, 183)", async () => {
    const game = await flourishWithShield();
    await game.p1.cast("bolt2", { targets: "x" });
    await game.settle();
    await game.p1.cast("bolt5", { targets: "x" });
    await game.settle();
    const [gold] = golds(game, "p1");
    expect(gold).toBeDefined();
    expect(game.state(gold as string)).toMatchObject({
      cardType: "gear",
      controller: P1,
      isExhausted: true,
      isToken: true,
      owner: P1,
      zone: "base",
    });
    expect(game.p1.can("activate", gold as string)).toBe(false); // exhausted: cannot be cashed this turn
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(c) setup: Deadly Flourish leaves the buffed Shen (4 Might) at bf1 with 3 damage; P2 then Retreats him to hand in response to P1's next spell — damage cleared, P2 channels 1 rune (124.1)", async () => {
    const game = await bounceBoard().build();
    expect(game.state("shen").might).toBe(4);
    await game.p1.cast("df", { targets: "shen" });
    await game.settle();
    expect(game.state("shen")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    const runes0 = game.p2.runes().length;
    await game.p1.cast("bolt2", { targets: "shen" });
    await game.p1.passPriority();
    await game.p2.cast("ret", { targets: "shen" });
    await game.settle();
    expect(game.zoneOf("shen")).toBe("hand");
    expect(game.state("shen").damage).toBe(0);
    expect(game.p2.runes()).toHaveLength(runes0 + 1);
    expect(game.zoneOf("bolt2")).toBe("trash"); // fizzled — its target left the board
    expect(golds(game, "p1")).toEqual([]);
  });

  test("(c) the same card replayed this turn is a NEW object: when it then dies, P1 gets NO Gold (124, 390.5.a)", async () => {
    const game = await bounceBoard().build();
    await game.p1.cast("df", { targets: "shen" });
    await game.settle();
    await game.p1.cast("bolt2", { targets: "shen" });
    await game.p1.passPriority();
    await game.p2.cast("ret", { targets: "shen" });
    await game.settle();
    expect(game.zoneOf("shen")).toBe("hand");
    // P1 opens another chain; P2 reacts by replaying Shen ([Reaction] unit) to base.
    await game.p1.cast("poke", { targets: "by" });
    await game.p1.passPriority();
    expect(game.p2.can("play", "shen")).toBe(true);
    await game.p2.play("shen", { to: "base" });
    await game.settle();
    expect(game.zoneOf("shen")).toBe("base");
    expect(game.state("shen")).toMatchObject({ damage: 0, might: 3 }); // fresh object: no damage, no buff
    // Now kill the replayed Shen this same turn.
    await game.p1.cast("bolt5", { targets: "shen" });
    await game.settle();
    expect(game.zoneOf("shen")).toBe("trash");
    expect(golds(game, "p1")).toEqual([]);
    expect(golds(game, "p2")).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.turnPlayer()).toBe(P1); // all of this happened within the one turn
  });

  test("(d) X survives the turn: its damage heals at end of turn, and when it dies during the NEXT turn no Gold appears for anyone (317.2.c)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Xerxes" }, "x")
      .hand(P1, DEADLY_FLOURISH, "df")
      .hand(P2, bolt(5), "p2bolt")
      .build();
    await game.p1.cast("df", { targets: "x" });
    await game.settle();
    expect(game.state("x").damage).toBe(3);
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("x").damage).toBe(0);
    await game.p2.cast("p2bolt", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(golds(game, "p1")).toEqual([]);
    expect(golds(game, "p2")).toEqual([]);
    expect(game.chain()).toEqual([]);
  });
});

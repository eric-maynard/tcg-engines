/**
 * Interaction: Yasuo, Remorseful (ogn-076-298) · Champion Unit · Calm · 6 · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Ahri, Inquisitive (ogn-119-298) · Champion Unit · Mind · 3 · 3 Might
 *     "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might]."
 *   × Nine-Tailed Fox (ogn-255-298) · Legend · Calm/Mind
 *     "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a
 *      minimum of 1 [Might]."
 *   (+ a vanilla 5-Might Brute; contrast legend Blind Monk ogn-257-298, an activated ability only)
 *
 * Question: P1's turn. Yasuo (6) moves alone into bf1, which P2 controls with Ahri (3) and Brute (5);
 * P2's legend is Nine-Tailed Fox. Yasuo targets Brute. In what order do the three triggers go on the
 * combat chain, who gets an ordering decision, and how much does Yasuo's trigger deal? Contrast: the
 * defender is vanilla and the legend is not Nine-Tailed Fox.
 *
 * Rules:
 *   464.2.c.3   attacker/defender designations are assigned when combat opens → all three triggers
 *               (Yasuo attack, Ahri defend, Nine-Tailed Fox) become pending together.
 *   464.2.e.1   the ATTACKING player places their triggered abilities on the chain first, then the
 *               defending player.
 *   383.3 / 355.5 / 337.1.b  a triggered ability is finalized like an activated one when appended:
 *               Yasuo's target (Brute) is chosen now (cf. 359.3.f.2 example — the trigger can later
 *               "mistarget", so it already has a target while on the chain).
 *   383.3.d     P2 controls two simultaneously-triggered abilities → P2 chooses their order; P1 has
 *               only one → no ordering decision for P1.
 *   LIFO        both of P2's items resolve before Yasuo's: 6 → 4 → 3 (or 6 → 5 → 3).
 *   359.3.f.2   "my Might" is read on execution → Yasuo's trigger deals 3 (printed example: Stupefy).
 *
 * Expected: chain bottom→top = Yasuo, then P2's two in P2's chosen order. Yasuo ends at 3 Might, his
 * trigger deals 3 to Brute (5) → Brute survives with 3 damage and combat proceeds with Yasuo at 3:
 * P1's 3 damage kills exactly one defender (2 more on Brute, or 3 on Ahri), Yasuo takes 8 and dies,
 * P2 keeps bf1. Contrast: only Yasuo's trigger exists; it deals 6 to Brute → Brute dies in the
 * cleanup before combat damage; Yasuo then faces no defender and conquers.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const AHRI = "ogn-119-298";
const NINE_TAILED_FOX = "ogn-255-298";
const BLIND_MONK = "ogn-257-298"; // "[1], [Exhaust]: Buff a friendly unit." — no combat trigger

/** P1's turn; Yasuo in P1's base; P2 holds bf1 with Brute (5) and — on the full board — Ahri + Nine-Tailed Fox. */
function board(kind: "full" | "vanilla") {
  const s = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", YASUO, "yasuo")
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute");
  return kind === "full"
    ? s.unit(P2, "bf1", AHRI, "ahri").legend(P2, NINE_TAILED_FOX, "ntf")
    : s.legend(P2, BLIND_MONK, "monk");
}

/** Only Nine-Tailed Fox is live: a vanilla 6-Might attacker into P2's Brute. */
function foxOnly() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 6, name: "Vanilla Six" }, "six")
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
    .legend(P2, NINE_TAILED_FOX, "ntf");
}

function isPrompt(d: Decision | null): boolean {
  return !!d && d.kind !== "action";
}

/**
 * Step the combat chain one decision at a time: P1 always names Brute for Yasuo, any order prompt is
 * answered as offered, priority is passed. Stops when `until` holds or the chain is empty with no
 * prompt open. Returns the ordering decisions seen (seat of each).
 */
async function stepChain(game: Game, until: (g: Game) => boolean = () => false): Promise<string[]> {
  const orderSeats: string[] = [];
  for (let i = 0; i < 16; i++) {
    if (until(game)) {
      break;
    }
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "pick") {
      const keys = d.options.map((o) => o.key);
      await game.seat(d.seat).pick(keys.includes("brute") ? "brute" : (keys[0] as string));
    } else if (d.kind === "order") {
      orderSeats.push(d.seat);
      await game.seat(d.seat).order(d.items.map((o) => o.key));
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break; // showdown focus with an empty chain, or main phase
    }
  }
  return orderSeats;
}

describe("Yasuo, Remorseful attacks into Ahri, Inquisitive + Nine-Tailed Fox — combat-chain ordering", () => {
  test("combat opens: Yasuo is the attacker, Ahri and Brute defend; three triggered items go on the chain with Yasuo's (the attacker's) at the bottom and P2's two above it (464.2.c.3, 464.2.e.1)", async () => {
    const game = await board("full").build();
    await game.p1.move("yasuo", "bf1");
    // Answer Yasuo's target now if the engine asks at finalization (355.5).
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("brute");
    }
    if (game.decision()?.kind === "order" && game.decision()?.seat === P2) {
      const d = game.decision() as Extract<Decision, { kind: "order" }>;
      await game.p2.order(d.items.map((o) => o.key));
    }
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.state("ahri").combatRole).toBe("defender");
    expect(game.state("brute").combatRole).toBe("defender");
    const chain = game.chain();
    expect(chain).toHaveLength(3);
    expect(chain.every((i) => i.triggered)).toBe(true);
    expect(chain[0]).toMatchObject({ cardId: "yasuo", controller: P1 });
    expect(chain.slice(1).map((i) => i.cardId).sort()).toEqual(["ahri", "ntf"]);
    expect(chain.slice(1).every((i) => i.controller === P2)).toBe(true);
  });

  // Yasuo's trigger is finalized as it is appended (383.3 → 355.5), so P1 names Brute right away —
  // before anyone holds priority.
  test("Yasuo's target is chosen when his trigger is put on the chain — P1's pick (Brute | Ahri) is the first decision after the move (383.3, 355.5, 359.3.f.2)", async () => {
    const game = await board("full").build();
    await game.p1.move("yasuo", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "yasuo" } });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(keys).toEqual(["ahri", "brute"]);
  });

  // Expected: Ahri's defend trigger and Nine-Tailed Fox trigger simultaneously under P2's control →
  // P2 picks which goes on the chain first (383.3.d). P1 has a single trigger → nothing to order.
  // Actual: the engine appends P2's two in a fixed order without asking.
  test("BUG: P2 (two simultaneous triggers) gets an ordering decision, P1 (one trigger) does not (383.3.d)", async () => {
    const game = await board("full").build();
    await game.p1.move("yasuo", "bf1");
    const orderSeats = await stepChain(game, (g) => g.chain().length < 3 && !isPrompt(g.decision()));
    expect(orderSeats).toEqual([P2]);
  });

  test("LIFO: both of P2's items resolve before Yasuo's — when one item is left it is Yasuo's, and Ahri's -2 has already landed on him (≤ 4 Might)", async () => {
    const game = await board("full").build();
    await game.p1.move("yasuo", "bf1");
    await stepChain(game, (g) => g.chain().length === 1 && !isPrompt(g.decision()));
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
    expect(game.state("yasuo").might).toBeLessThanOrEqual(4);
    expect(game.state("yasuo").baseMight).toBe(6);
    expect(game.state("brute").damage).toBe(0); // Yasuo's trigger has not resolved yet
  });

  // Expected: Ahri -2 and Nine-Tailed Fox -1 both hit Yasuo (the only enemy unit here / the attacking
  // unit) → 6 - 2 - 1 = 3 in either P2 order. Actual: Nine-Tailed Fox's -1 is applied to the legend
  // itself ("it" parsed as self), so Yasuo stays at 4.
  test("after both P2 triggers resolve Yasuo is at 3 Might (6 → 4 → 3 or 6 → 5 → 3) — Nine-Tailed Fox's -1 must land on the attacking unit", async () => {
    const game = await board("full").build();
    await game.p1.move("yasuo", "bf1");
    await stepChain(game, (g) => g.chain().length === 1 && !isPrompt(g.decision()));
    expect(game.chain()[0]?.cardId).toBe("yasuo");
    expect(game.state("yasuo").might).toBe(3);
  });

  test("Yasuo's trigger reads 'my Might' on resolution (359.3.f.2): Brute takes Yasuo's CURRENT reduced Might (< 6, so < 5 lethal) and survives into the damage step", async () => {
    const game = await board("full").build();
    await game.p1.move("yasuo", "bf1");
    await stepChain(game); // whole chain incl. Yasuo's target
    expect(game.chain()).toEqual([]);
    const dealt = game.state("brute").damage;
    expect(dealt).toBe(game.state("yasuo").might);
    expect(dealt).toBeLessThan(5);
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.state("ahri").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  // Expected: 3 damage exactly (Yasuo at 3). Actual: 4 (Nine-Tailed Fox never reduced him).
  test("Yasuo's trigger deals exactly 3 to Brute, who survives with 3 damage on a 5-Might body (359.3.f.2)", async () => {
    const game = await board("full").build();
    await game.p1.move("yasuo", "bf1");
    await stepChain(game);
    expect(game.state("brute")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bf1" });
  });

  // Expected: combat damage with Yasuo at 3 vs Ahri 3 + Brute 5 (3 marked): P1's 3 kills exactly one
  // defender (465.2.c.3), Yasuo takes 8 and dies, a defender remains → P2 keeps bf1, nobody scores.
  // Actual: Yasuo at 4 with 4 marked on Brute → 1 finishes Brute and 3 kills Ahri; everyone dies and
  // bf1 ends uncontrolled.
  test("full combat — Yasuo (3) kills exactly one defender and dies to 8; P2 still holds bf1 (465.2.c.3, 466.3)", async () => {
    const game = await board("full").script(P1, ["brute"]).build();
    await game.p1.move("yasuo", "bf1");
    await stepChain(game);
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("trash");
    const dead = ["ahri", "brute"].filter((u) => game.zoneOf(u) === "trash");
    expect(dead).toHaveLength(1);
    expect(game.p2.units("bf1")).toHaveLength(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  // ---- Nine-Tailed Fox in isolation ------------------------------------------------------------

  test("Nine-Tailed Fox triggers when an enemy unit attacks a battlefield P2 controls: one P2-controlled triggered item on the chain", async () => {
    const game = await foxOnly().build();
    await game.p1.move("six", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ntf", controller: P2, triggered: true })]);
  });

  // Expected: "give IT -1 Might this turn" — the attacking enemy unit: 6 → 5. Actual: the modifier is
  // applied to the legend card; the attacker stays 6.
  test("Nine-Tailed Fox gives the ATTACKING unit -1 Might this turn (6 → 5)", async () => {
    const game = await foxOnly().build();
    await game.p1.move("six", "bf1");
    await stepChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("six").might).toBe(5);
    expect(game.state("six").baseMight).toBe(6);
  });

  // ---- contrast: vanilla defender, legend without a combat trigger ------------------------------

  test("contrast: vanilla Brute + Blind Monk legend → only Yasuo's trigger goes on the chain", async () => {
    const game = await board("vanilla").build();
    await game.p1.move("yasuo", "bf1");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("brute");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
    expect(game.state("yasuo").might).toBe(6);
  });

  test("contrast: Yasuo's trigger deals his full 6 to Brute (5) → Brute is killed in the following cleanup, before any combat damage; the showdown is still open", async () => {
    const game = await board("vanilla").build();
    await game.p1.move("yasuo", "bf1");
    await stepChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.state("yasuo")).toMatchObject({ damage: 0, might: 6, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("contrast: with no defender left Yasuo takes no combat damage, wins and conquers bf1 (466.3.a, 466.5.d)", async () => {
    const game = await board("vanilla").script(P1, ["brute"]).build();
    await game.p1.move("yasuo", "bf1");
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("battlefield-bf1");
    expect(game.state("yasuo").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});

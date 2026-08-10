/**
 * Ruling 8a0ec3e6ea8cfdb4 — Promising Future (OGN-115 → ogn-115-298)
 *   × Riptide Rex (OGN-092 → ogn-092-298) × Pit Rookie (OGN-136 → ogn-136-298) × Meditation (OGN-048 → ogn-048-298)
 *   × Charm (OGN-043 → ogn-043-298)
 *
 *   Promising Future — Spell · Mind · 5+[mind] · Action: "Each player looks at the top 5 cards of their Main Deck,
 *     banishes one of them, then recycles the rest. Starting with the next player, each player plays those cards,
 *     ignoring Energy costs. (They must still pay Power costs.)"
 *   Riptide Rex — Unit 6+[mind][mind] · 6: "When you play me, deal 6 to an enemy unit at a battlefield."
 *   Pit Rookie — Unit 2 · 2: "When you play me, buff another friendly unit."
 *   Meditation — Reaction 2: "…you may exhaust a friendly unit. If you do, draw 2. Otherwise, draw 1."
 *   Charm — Action 1: "Move an enemy unit."
 *
 * Q: When units with "when you play me" triggers are played off Promising Future, when do those triggers enter
 *    the chain and how do they resolve relative to the other Promising Future cards?
 * A: Each unit resolves immediately when its player plays it and its trigger becomes PENDING; after all the
 *    Promising Future cards are finalized (the PF player last), the unit triggers are finalized on top — so they
 *    resolve BEFORE the spells played off Promising Future (example top→bottom: Rookie trig, Rex trig, Meditation, Charm).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const RIPTIDE_REX = "ogn-092-298";
const PIT_ROOKIE = "ogn-136-298";
const MEDITATION = "ogn-048-298";
const CHARM = "ogn-043-298";
const U = (n: number) => ({ cardType: "unit", energyCost: 3, might: n, name: `Filler ${n}` });

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
type ChainView = ReturnType<Game["chain"]>;

/**
 * Step the game one settle-step at a time, answering banish picks with the preferred cards and declining opt-ins,
 * until `stop` holds. Returns the chain at that moment (or null).
 */
async function stepUntil(game: Game, prefer: string[], stop: (g: Game) => boolean): Promise<ChainView | null> {
  for (let i = 0; i < 60; i++) {
    if (stop(game)) {
      return game.chain();
    }
    const s = await game.settle({ maxSteps: 1 });
    const d: Decision | null = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (s.reason === "unanswered") {
      if (d.kind === "pick") {
        const want = d.options.find((o) => prefer.includes((o.card ?? o.key) as string)) ?? d.options[0];
        await game.seat(d.seat).pick(want?.key as string);
      } else if (d.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else {
        break;
      }
    }
  }
  return stop(game) ? game.chain() : null;
}

describe("Ruling 8a0ec3e6ea8cfdb4 — unit play-triggers off Promising Future are finalized after, and resolve before, the other PF cards", () => {
  /**
   * P1's turn. P1: 5+[mind] for PF; top of deck Meditation. P2: [mind][mind] for Rex's Power; top of deck Rex.
   * P1's Wall (7) at bf1 is Rex's only legal victim.
   */
  function rexBoard() {
    return scenario()
      .resources(P1, { energy: 5, power: { mind: 1 } })
      .resources(P2, { power: { mind: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 7, name: "Wall" }, "wall")
      .deck(P1, [MEDITATION, U(2), U(3), U(4), U(5), U(6)], ["medit", "a2", "a3", "a4", "a5", "a6"])
      .deck(P2, [RIPTIDE_REX, U(2), U(3), U(4), U(5), U(6)], ["rex", "b2", "b3", "b4", "b5", "b6"])
      .hand(P1, PROMISING_FUTURE, "pf");
  }

  test("first pass: P1 (PF player) is asked to banish first, then P2; both picks land in banishment", async () => {
    const game = await rexBoard().build();
    await game.p1.cast("pf");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("medit");
    expect(game.zoneOf("medit")).toBe("banishment");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("rex");
    // From here the play pass begins (next player first); Rex may already be entering.
    expect(["banishment", "base", "chain"]).toContain(game.zoneOf("rex"));
  });

  test("play pass: P2 (next player) plays Rex — it resolves to the board at once with its trigger pending; P1 then plays Meditation; the Rex trigger is finalized on TOP of Meditation", async () => {
    const game = await rexBoard().build();
    await game.p1.cast("pf");
    const both = await stepUntil(game, ["medit", "rex", "wall"], (g) => g.chain().length === 2 && g.chain()[1]?.type === "ability");
    expect(both).not.toBeNull();
    // Rex the permanent is already on the board (Energy ignored, [mind][mind] paid).
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.p2.power("mind")).toBe(0);
    // Chain bottom → top: Meditation (P1's PF card, finalized last of the PF cards), then Rex's trigger above it.
    expect(both?.map((c) => c.cardId)).toEqual(["medit", "rex"]);
    expect(both?.[0]).toMatchObject({ controller: P1, triggered: false, type: "spell" });
    expect(both?.[1]).toMatchObject({ controller: P2, triggered: true });
    expect(game.state("wall").damage).toBe(0);
  });

  test("resolution: Rex's trigger resolves FIRST (Wall takes 6 while Meditation is still on the chain), then Meditation draws P1 a card", async () => {
    const game = await rexBoard().build();
    await game.p1.cast("pf");
    await stepUntil(game, ["medit", "rex", "wall"], (g) => g.chain().length === 2 && g.chain()[1]?.type === "ability");
    const handBefore = game.p1.hand().length;
    const afterRex = await stepUntil(game, ["wall"], (g) => g.state("wall").damage > 0);
    expect(afterRex?.map((c) => c.cardId)).toEqual(["medit"]); // Meditation still waiting
    expect(game.state("wall").damage).toBe(6);
    expect(game.p1.hand()).toHaveLength(handBefore);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.zoneOf("medit")).toBe("trash");
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.p1.energy()).toBe(0); // Meditation's 2 Energy ignored
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("same shape with Charm (P2) and Pit Rookie (P1): Charm is finalized first (bottom), Rookie enters the board and its buff trigger sits on top and resolves before Charm moves anything", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { mind: 1 } })
      .resources(P2, { power: { calm: 1 } }) // Charm's [calm] must still be paid
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", { might: 3, name: "Buddy" }, "buddy")
      .deck(P1, [PIT_ROOKIE, U(2), U(3), U(4), U(5), U(6)], ["rookie", "a2", "a3", "a4", "a5", "a6"])
      .deck(P2, [CHARM, U(2), U(3), U(4), U(5), U(6)], ["charm", "b2", "b3", "b4", "b5", "b6"])
      .hand(P1, PROMISING_FUTURE, "pf")
      .build();
    await game.p1.cast("pf");
    const both = await stepUntil(game, ["rookie", "charm", "buddy", "base"], (g) => g.chain().length === 2 && g.chain()[1]?.type === "ability");
    expect(both).not.toBeNull();
    expect(both?.map((c) => c.cardId)).toEqual(["charm", "rookie"]);
    expect(both?.[0]).toMatchObject({ controller: P2, type: "spell" });
    expect(both?.[1]).toMatchObject({ controller: P1, triggered: true });
    expect(game.zoneOf("rookie")).toBe("base");
    expect(game.state("buddy").isBuffed).toBe(false);
    expect(game.locationOf("buddy")).toBe("bf1");
    // Rookie's trigger resolves first: Buddy is buffed while Charm is still on the chain and Buddy hasn't moved.
    const afterBuff = await stepUntil(game, ["buddy"], (g) => g.state("buddy").isBuffed);
    expect(afterBuff?.map((c) => c.cardId)).toEqual(["charm"]);
    expect(game.locationOf("buddy")).toBe("bf1");
    await stepUntil(game, ["buddy", "base"], (g) => g.chain().length === 0);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("buddy")).not.toBe("bf1"); // Charm moved it afterwards
    expect(game.state("buddy").isBuffed).toBe(true);
  });
});

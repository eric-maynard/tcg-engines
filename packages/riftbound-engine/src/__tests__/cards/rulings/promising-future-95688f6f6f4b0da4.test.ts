/**
 * Ruling 95688f6f6f4b0da4 — Promising Future (OGN-115 → ogn-115-298) · 5 + [mind]
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest. Starting with
 *      the next player, each player plays those cards, ignoring Energy costs. (They must still pay Power costs.)"
 *   × Wind Wall (OGN-064) / Defy (OGN-045 → ogn-045-298, "[Reaction] Counter a spell that costs no more than [4] and no more
 *     than [rainbow]") × Kai'Sa, Evolutionary (OGN-112) — same "play" principle.
 *
 * Q: How does Promising Future resolve — timing, the chain, can the played cards be reacted to?
 * A: Both players choose from their top 5; then, starting with the NEXT player, each plays their card; each card resolves
 *    completely before the next, all DURING Promising Future's resolution — nothing can be added to the chain meanwhile, so
 *    the played cards can't be reacted to / countered (Windwall, Defy). Triggered abilities of units played this way go on
 *    a new chain only after Promising Future has finished. A card whose Power cost you can't pay isn't played (recycled).
 * Rules: 337.1.b (nothing is added to the chain during a resolution), 356.1.b (play by effect, ignoring cost parts), 383.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 + [fury] — "Deal 3 to a unit at a battlefield."
const DEFY = "ogn-045-298";
const HARNESSED_DRAGON = "ogn-234-298"; // 8 + [order][order] — a Power cost P2 cannot pay
const U = (n: number) => ({ cardType: "unit", energyCost: 3, might: n, name: `Future ${n}` });
/** A 4-cost unit with a visible play trigger (draw 1). */
const HERALD = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "play-self" }, type: "triggered" }],
  cardType: "unit",
  energyCost: 4,
  might: 2,
  name: "Herald",
  rulesText: "When you play me, draw 1.",
} as const;

type PickD = Extract<Decision, { kind: "pick" }>;
const keysOf = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/**
 * P1's turn with exactly 5 + [mind] for Promising Future plus ONE [fury] (Hextech Ray's Power; its [1] is ignored).
 * P1's top 5: Hextech Ray + four units. P2's top 5: Herald (play trigger: draw 1) + four units; b6/b7 below.
 * P2 holds Defy with 1 + [calm] — a would-be counter for the Ray. P2's Wall (9) at bf1 is the Ray's target.
 */
function board(p2Top: unknown = HERALD, p2TopAlias = "herald") {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1, mind: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .deck(P1, [HEXTECH_RAY, U(2), U(3), U(4), U(5), U(6)], ["ray", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [p2Top as string, U(2), U(3), U(4), U(5), U(6), U(7)], [p2TopAlias, "b2", "b3", "b4", "b5", "b6", "b7"])
    .hand(P2, DEFY, "defy")
    .hand(P1, PROMISING_FUTURE, "pf");
}

/** Cast Promising Future and pass it through to the first look-at-5 prompt. */
async function castToFirstLook(game: Game): Promise<PickD> {
  await game.p1.cast("pf");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1, mind: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", semantics: "from-revealed" });
  return d as PickD;
}

/** Both players pick: P1 → Hextech Ray, P2 → its top card; answer the Ray's target / Herald's destination if asked. */
async function bothPick(game: Game, p2Pick: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "pick") {
      break;
    }
    const keys = keysOf(d);
    if (keys.includes("ray")) {
      expect(d.seat).toBe(P1);
      await game.p1.pick("ray");
    } else if (keys.includes(p2Pick)) {
      expect(d.seat).toBe(P2);
      await game.p2.pick(p2Pick);
    } else if (keys.includes("wall") && d.seat === P1) {
      await game.p1.pick("wall");
    } else if (keys.includes("base") && d.seat === P2) {
      await game.p2.pick("base");
    } else {
      break;
    }
  }
}

/** One log line per decision while driving to the open main phase (passing everything). */
async function drive(game: Game): Promise<{ p2CouldDefyRay: boolean; heraldTriggerBeforeRayDone: boolean }> {
  let p2CouldDefyRay = false;
  let heraldTriggerBeforeRayDone = false;
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    const chain = game.chain();
    if (chain.some((c) => c.cardId === "herald" && c.triggered) && game.state("wall").damage === 0) {
      heraldTriggerBeforeRayDone = true;
    }
    if (chain.some((c) => c.cardId === "ray") && game.p2.can("cast", "defy")) {
      p2CouldDefyRay = true;
    }
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick") {
      const keys = keysOf(d);
      const want = keys.includes("wall") ? "wall" : keys.includes("base") ? "base" : (d.options[0]?.key as string);
      await game.seat(d.seat).pick(want);
    } else {
      break;
    }
  }
  return { heraldTriggerBeforeRayDone, p2CouldDefyRay };
}

describe("Ruling 95688f6f6f4b0da4 — how Promising Future plays the chosen cards", () => {
  test("resolution starts with each player choosing one of THEIR top 5 (a decision for P1 and one for P2); the other four are recycled to the bottom", async () => {
    const game = await board().build();
    const first = await castToFirstLook(game);
    const seats = new Set<string>([first.seat]);
    expect(keysOf(first).length).toBe(5);
    await game.seat(first.seat).pick(first.seat === P1 ? "ray" : "herald");
    const second = game.decision();
    expect(second).toMatchObject({ kind: "pick", semantics: "from-revealed" });
    seats.add((second as PickD).seat);
    expect(keysOf(second).length).toBe(5);
    expect([...seats].sort()).toEqual([P1, P2]);
    await game.seat((second as PickD).seat).pick((second as PickD).seat === P1 ? "ray" : "herald");
    // rest recycled: a6 / b6 are now on top, the unpicked four at the bottom
    expect(game.p1.deck()[0]).toBe("a6");
    expect(game.p1.deck().slice(-4).sort()).toEqual(["a2", "a3", "a4", "a5"]);
    expect(game.p2.deck()[0]).toBe("b6");
    expect(game.p2.deck().slice(-4).sort()).toEqual(["b2", "b3", "b4", "b5"]);
  });

  test("starting with the NEXT player: P2's Herald is played (to base, its [4] ignored — P2 still has its 1 energy) no later than P1's Hextech Ray, whose [1] is ignored but whose [fury] IS paid; the Ray then deals 3 and everything ends in the right zones", async () => {
    const game = await board().build();
    await castToFirstLook(game);
    await bothPick(game, "herald");
    // The moment the Ray exists as a played spell, the Herald is already on the board.
    for (let i = 0; i < 10 && !game.chain().some((c) => c.cardId === "ray" && c.type === "spell"); i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d?.kind === "pick") {
        await game.seat(d.seat).pick(keysOf(d).includes("base") ? "base" : keysOf(d).includes("wall") ? "wall" : (d.options[0]?.key as string));
      } else {
        break;
      }
    }
    expect(game.zoneOf("herald")).toBe("base");
    expect(game.p2.energy()).toBe(1);
    await drive(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("pf")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
  });

  // Expected: the cards are played and resolve INSIDE Promising Future's resolution; nothing can be added to the chain
  // there, so P2 never gets a window in which Defy could counter the Hextech Ray. Actual: the engine puts the Ray on
  // the chain as an ordinary spell and hands P2 priority with Defy castable against it.
  test.failing("BUG: ruling 95688f6f6f4b0da4 — engine lets P2 react to (Defy) the Hextech Ray played by Promising Future", async () => {
    const game = await board().build();
    await castToFirstLook(game);
    await bothPick(game, "herald");
    const seen = await drive(game);
    expect(game.state("wall").damage).toBe(3); // it did resolve …
    expect(seen.p2CouldDefyRay).toBe(false); // … and was never counterable
  });

  // Expected: Herald's "When you play me" trigger waits and goes on a NEW chain only after Promising Future (and so the
  // Ray it played) has completely finished — i.e. by the time the Herald trigger is on the chain the Wall already has 3
  // damage. Actual: the trigger is put on the chain (and resolves) before the Ray does.
  test.failing("BUG: ruling 95688f6f6f4b0da4 — engine resolves the Herald's play trigger before Promising Future's other card (the Ray) has resolved", async () => {
    const game = await board().build();
    await castToFirstLook(game);
    await bothPick(game, "herald");
    const seen = await drive(game);
    expect(game.p2.hand()).toContain("b6"); // the trigger did draw eventually
    expect(seen.heraldTriggerBeforeRayDone).toBe(false);
  });

  // Expected: P2 picks Harnessed Dragon (needs [order][order] it doesn't have) → it can't be played; the instruction is
  // ignored and the card is recycled — it must not stay in banishment or reach the board. Actual: it is left banished.
  test.failing("BUG: ruling 95688f6f6f4b0da4 — an unaffordable (Power) pick is left in banishment instead of being recycled unplayed", async () => {
    const game = await board(HARNESSED_DRAGON, "dragon").build();
    await castToFirstLook(game);
    await bothPick(game, "dragon");
    await drive(game);
    expect(game.p2.units()).not.toContain("dragon");
    expect(game.zoneOf("dragon")).not.toBe("base");
    expect(game.p2.banishment()).toEqual([]);
    expect(game.zoneOf("dragon")).toBe("mainDeck");
    // P1's Ray still went off.
    expect(game.state("wall").damage).toBe(3);
  });

  test("the unaffordable pick is at least never PLAYED: Harnessed Dragon does not reach the board and P2 pays nothing", async () => {
    const game = await board(HARNESSED_DRAGON, "dragon").build();
    await castToFirstLook(game);
    await bothPick(game, "dragon");
    await drive(game);
    expect(game.p2.units()).toEqual(["wall"]);
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("pf")).toBe("trash");
  });
});

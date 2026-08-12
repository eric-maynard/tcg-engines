/**
 * Interaction: Tianna Crownguard (sfd-060-221) "[Deflect] / While I'm at a battlefield, opponents
 *              can't gain points."
 *            × Frozen Fortress (unl-212-219) "At the start of each player's Beginning Phase, deal
 *              1 to each unit here. (This happens before scoring.)"
 *
 * Q: P1's Main Deck is empty and P1 controls Tianna at Frozen Fortress. P1's Draw Phase arrives
 *    and Burn Out orders P1 to choose an opponent to gain 1 point — but that opponent can't gain
 *    points. (a) Does the point happen anyway? (b) If not, and the retried draw burns out again
 *    with nothing changed, does the engine hang? (c) What if the Fortress tick kills Tianna first?
 *    (d) What if she is merely recalled to base?
 *
 * Rules:
 *   054 / 054.1   "can't" beats "can" — a forbidding effect supersedes a permission
 *   055           do as much as you can; ignore what is impossible
 *   315.2         the Scoring Step follows the Beginning Step of the Beginning Phase
 *   317.2.b       the Expiration Step HEALS every unit at the end of every turn
 *   431.1.a       drawing from an empty Main Deck Burns Out
 *   431.2 / .2.c  the Burn Out steps: recycle the trash, an opponent gains 1, complete the draw
 *   431.3.a/.b    the first Burn Out point may be prevented; later ones "cannot be replaced or
 *                 prevented by any means"
 *   431.3.c.1     reaching the Victory Score this way wins immediately
 *   323.1         the win check runs in the Cleanup
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIANNA = "sfd-060-221";
const FROZEN_FORTRESS = "unl-212-219";

/** "Kill a unit." — P2's removal; cheap enough to leave room for Tianna's [Deflect] surcharge. */
const EXECUTE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Execute",
  timing: "action",
} as const;

const RUNE = { cardType: "rune", domain: "calm", name: "Calm Rune" } as const;

/**
 * Turn 4, P2 to end their turn. Frozen Fortress is P1's, `where` puts Tianna at it or in base, and
 * `trashCards` decides whether the Burn Out can make progress (a card to recycle) or not.
 */
function board(opts: { where: "fortress" | "base" | "none"; trashCards: number; victoryScore?: number }) {
  const s = scenario()
    .turn(4)
    .active(P2)
    .victoryScore(opts.victoryScore ?? 8)
    .points(P2, 0)
    .battlefield("ff", { controller: P1, def: FROZEN_FORTRESS, inert: false })
    .fillDecks(false)
    .deck(P2, [{ might: 1 }, { might: 1 }, { might: 1 }])
    .runeDeck(P1, [RUNE, RUNE])
    .runeDeck(P2, [RUNE, RUNE]);
  if (opts.where !== "none") {
    s.unit(P1, opts.where === "fortress" ? "ff" : "base", TIANNA, "tianna");
  }
  if (opts.where !== "fortress") {
    s.unit(P1, "ff", { might: 6, name: "Holder" }, "holder"); // keep the hold identical either way
  }
  for (let i = 0; i < opts.trashCards; i++) {
    s.trash(P1, { might: 1, name: `Spent ${i}` }, `t${i}`);
  }
  return s;
}

/** P2 ends their turn; P1's Beginning → Channel → Draw runs. */
async function handOver(game: Game, maxSteps = 200) {
  await game.p2.endTurn();
  return game.settle({ maxSteps });
}

describe("Tianna Crownguard × Frozen Fortress — the Burn Out point nobody is allowed to gain", () => {
  test("315.2 — the Fortress ticks at the START of each player's Beginning Phase, before the Scoring Step: Tianna takes 1 and the hold still scores", async () => {
    const game = await board({ trashCards: 1, where: "fortress" }).build();
    expect(game.state("tianna").damage).toBe(0);
    await handOver(game);
    expect(game.state("tianna").damage).toBe(1);
    expect(game.p1.points()).toBe(1); // the hold was scored in the same phase, after the tick
    expect(game.zoneOf("tianna")).toBe("battlefield-ff");
  });

  test("317.2.b — the tick alone can NEVER kill 4-Might Tianna: every Ending Phase heals her, so damage never accumulates across turns", async () => {
    const game = await board({ trashCards: 1, where: "fortress" }).fillDecks({ main: 20, runes: 12 }).build();
    await handOver(game); // P1's turn 5 — 1 damage from the tick
    expect(game.state("tianna").damage).toBe(1);

    await game.advanceTurn(); // P1 ends: the Expiration Step heals, then P2's Beginning ticks again
    const passes = game.trace().expiration;
    expect(passes.at(-1)?.steps).toEqual(["heal", "expire", "empty-pools"]);
    expect(passes.at(-1)?.healed).toContain("tianna");
    // …so she is back at 1, never 2 — the 4th point of damage never arrives.
    expect(game.state("tianna").damage).toBe(1);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.state("tianna").damage).toBe(1);
    expect(game.zoneOf("tianna")).toBe("battlefield-ff");
  });

  test("(a) the FIRST Burn Out point is denied while she stands at a battlefield — the draw still completes and nothing stalls (054.1, 055, 431.2)", async () => {
    const game = await board({ trashCards: 1, where: "fortress" }).build();
    const r = await handOver(game);
    // 431.2.b/d: the trash was recycled and the interrupted draw was completed…
    expect(game.zoneOf("t0")).toBe("hand");
    expect(game.p1.trash()).toHaveLength(0);
    // …but 431.2.c's point never landed: "opponents can't gain points" beats it (054.1).
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(1); // her controller's own hold is untouched
    // No stall: P1 is in their open Main Phase with the chain empty.
    expect(r.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(d) the static is LOCATION-gated: the same board with Tianna in base hands P2 the Burn Out point — the branches differ only in where she stands", async () => {
    const inBase = await board({ trashCards: 1, where: "base" }).build();
    await handOver(inBase);
    expect(inBase.p2.points()).toBe(1);
    expect(inBase.p1.points()).toBe(1);
    expect(inBase.zoneOf("t0")).toBe("hand");

    const absent = await board({ trashCards: 1, where: "none" }).build();
    await handOver(absent);
    expect(absent.p2.points()).toBe(1); // identical to "in base" — she only matters at a battlefield
  });

  test("(c) with Tianna dead the Burn Out proceeds normally: killed on P2's turn (through [Deflect]), P2 takes the point", async () => {
    const game = await board({ trashCards: 1, where: "fortress" })
      .resources(P2, { energy: 1, power: { rainbow: 1 } })
      .hand(P2, EXECUTE, "exec")
      .build();
    await game.p2.cast("exec", { targets: "tianna" }); // 1 energy + the [Deflect] rainbow
    await game.settle();
    expect(game.zoneOf("tianna")).toBe("trash");

    await handOver(game);
    expect(game.p2.points()).toBe(1); // the static went to the trash with her
    expect(game.p1.trash()).toHaveLength(0); // her corpse was recycled with the rest
    expect(game.violations()).toEqual([]);
  });

  // DESIGN / RULING-CONFLICT: read literally, 054.1 would deny EVERY Burn Out point while Tianna
  // stands at a battlefield, and 431.2's retry loop would then never progress — an unbounded stall
  // the engine would have to detect and halt. The engine instead follows 431.3.b as written
  // ("later burn out points cannot be replaced or prevented by any means"): only the FIRST point is
  // preventable, so the sequence DOES progress and the opponent climbs to the Victory Score.
  // This is the adjudicated model, pinned by core-rules
  // `turn-procedures-skips-and-burn-out.test.ts` ("431.3 — only the FIRST Burn Out point can be
  // prevented; the repeats cannot, and the win is immediate"). Do not flip this facet back.
  test("(b) deck AND trash empty: the Burn Out cannot progress, and the engine halts deterministically rather than hanging (431.3.b, 431.3.c.1, 323.1)", async () => {
    const game = await board({ trashCards: 0, victoryScore: 8, where: "fortress" }).build();
    expect(game.p1.deck()).toHaveLength(0);
    expect(game.p1.trash()).toHaveLength(0);

    const r = await handOver(game, 400);

    expect(r.reason).toBe("game-over");
    expect(r.steps).toBeLessThan(20); // bounded — never an unbounded retry loop
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    // 431.3.c.1 — immediately: P1 never reached a Main Phase, and nothing is left pending.
    expect(game.phase()).toBe("draw");
    expect(game.turnNumber()).toBe(5);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toBeNull();
    expect(game.chain()).toEqual([]);
    // Tianna never left: the static was in force the whole way and still did not stop the repeats.
    expect(game.zoneOf("tianna")).toBe("battlefield-ff");
    expect(game.violations()).toEqual([]);
  });

  test("(b) the halt is not caused by Tianna: the same empty-deck board without her ends the same way, one iteration sooner", async () => {
    const withHer = await board({ trashCards: 0, where: "fortress" }).build();
    await handOver(withHer, 400);
    const without = await board({ trashCards: 0, where: "none" }).build();
    await handOver(without, 400);

    for (const g of [withHer, without]) {
      expect(g.isOver()).toBe(true);
      expect(g.winner()).toBe(P2);
      expect(g.p2.points()).toBe(8);
      expect(g.phase()).toBe("draw");
      expect(g.chain()).toEqual([]);
      expect(g.violations()).toEqual([]);
    }
  });
});

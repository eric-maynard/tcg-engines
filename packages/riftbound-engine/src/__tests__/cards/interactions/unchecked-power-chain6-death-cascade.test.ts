/**
 * Interaction: Unchecked Power (ogn-123-298) "Exhaust all friendly units, then deal 12 to ALL
 *              units at battlefields."
 *            × Machine Evangel (ogn-239-298) "[Deathknell] — Play three 1 [Might] Recruit unit
 *              tokens into your base."
 *            × Viktor, Leader (ogn-246-298) "When another non-Recruit unit you control dies, play
 *              a 1 [Might] Recruit unit token into your base."
 *
 * Q: A six-deep chain with Unchecked Power at the bottom and five Reactions above it. When it
 *    finally resolves it kills a board's worth of units at once.
 *    (a) Do the triggers born DURING a resolution go on TOP of a chain that still has items
 *        pending underneath? (b) One Viktor trigger per death or one batch — and do the Recruits
 *        that get minted feed Viktor again? (c) Is the whole batch finalized before anyone regains
 *        priority, and can the chain ever be left with items pending and nobody on the cursor?
 *    (d) Does "exhaust all friendly units" happen before the damage, so the caster's own units are
 *        exhausted AND take the 12?
 *
 * Rules:
 *   359.3.e     follow an effect's instructions in printed order, doing as much as possible
 *   319.6       one Cleanup kills the whole lethal batch at once
 *   383.3       a triggered ability becomes a Pending Item appended to the top of the Chain
 *   383.3.d     the controller MAY order simultaneous triggers — a soft offer, never a block
 *   337.1       Step 1: Finalize every Pending Item…
 *   337.1.a     …without passing priority
 *   337.1.b     …in append order
 *   337.3/340.3 adding items sends the game back to Step 1: Finalize
 *   337.4/340.4 only then does the next item's controller gain Priority
 *   339.1       Priority is held by exactly one player
 *   340.1       the Chain resolves newest-first
 *   319.3/319.4 a Cleanup is queued by each addition and each finalization
 *
 * Construction note: Unchecked Power is STANDARD-timed (no [Action]), so it cannot be played into
 * a showdown at all (159.2.a.1 / 331.1.a) — the six-deep chain is built in the caster's own Main
 * Phase, where only [Reaction] cards can stack above it. The finalization question is identical.
 */
import { describe, expect, test } from "bun:test";
import type { Game, OrderDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { DEFAULT_INVARIANTS } from "../../../harness/invariants";

const UNCHECKED_POWER = "ogn-123-298";
const MACHINE_EVANGEL = "ogn-239-298";
const VIKTOR_LEADER = "ogn-246-298";

const reactionSpell = (name: string, effect: Record<string, unknown>) => ({
  abilities: [{ effect, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name,
  timing: "reaction",
});

/** "[Reaction] Gain 1 XP." — inert filler, only there to make the chain six deep. */
const XP_REACTION = reactionSpell("Filler Reaction XP", { amount: 1, type: "gain-xp" });
/** "[Reaction] Deal 12 to a unit." — kills one friendly unit WHILE Unchecked Power is still pending. */
const SNIPE = reactionSpell("Filler Snipe 12", { amount: 12, target: { type: "unit" }, type: "damage" });

/**
 * P1's Main Phase. Viktor and a Reserve sit safely in base; Machine Evangel, five vanilla units
 * and a 15-Might Colossus stand at bf1; the enemy has one unit at bf2 and one in their base.
 */
function board() {
  const b = scenario()
    .active(P1)
    .resources(P1, { energy: 7, power: { mind: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", VIKTOR_LEADER, "viktor")
    .unit(P1, "base", { might: 3, name: "Reserve" }, "reserve")
    .unit(P1, "bf1", MACHINE_EVANGEL, "evangel")
    .unit(P1, "bf1", { might: 15, name: "Colossus" }, "colossus")
    .unit(P2, "base", { might: 3, name: "Enemy Reserve" }, "enemyReserve")
    .unit(P2, "bf2", { might: 3, name: "Enemy Front" }, "enemyFront")
    .hand(P1, UNCHECKED_POWER, "up")
    .hand(P1, SNIPE, "snipe")
    .hand(P1, SNIPE, "snipe2")
    .hand(P1, XP_REACTION, "r2")
    .hand(P1, XP_REACTION, "r3")
    .hand(P1, XP_REACTION, "r4")
    .hand(P1, XP_REACTION, "r5");
  for (let i = 1; i <= 5; i++) {
    b.unit(P1, "bf1", { might: 3, name: `Grunt ${i}` }, `u${i}`);
  }
  return b;
}

/** Build the six-deep chain: Unchecked Power, then the Snipe on `u1`, then four inert Reactions. */
async function sixDeep(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("up");
  await game.p1.cast("snipe", { targets: "u1" });
  for (const r of ["r2", "r3", "r4", "r5"]) {
    await game.p1.cast(r);
  }
  expect(game.chain().map((i) => i.name)).toEqual([
    "Unchecked Power",
    "Filler Snipe 12",
    "Filler Reaction XP",
    "Filler Reaction XP",
    "Filler Reaction XP",
    "Filler Reaction XP",
  ]);
  return game;
}

interface Frame {
  readonly names: readonly string[];
  readonly triggered: number;
  readonly cursor: string | undefined;
}

/**
 * Resolve the chain one priority pass at a time, recording the chain after every pass. Trigger
 * ORDER offers (383.3.d) are answered with the listed order; anything else stops the drive.
 */
async function drive(game: Game, max = 80): Promise<{ frames: Frame[]; orders: OrderDecision[] }> {
  const frames: Frame[] = [];
  const orders: OrderDecision[] = [];
  for (let i = 0; i < max; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action" && d.context === "main") {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "order") {
      orders.push(d);
      await game.seat(d.seat).order([]);
    } else {
      throw new Error(`unexpected ${d.kind} prompt for ${d.seat}: ${d.prompt}`);
    }
    const chain = game.chain();
    frames.push({
      cursor: game.actingSeat(),
      names: chain.map((c) => c.name),
      triggered: chain.filter((c) => c.triggered).length,
    });
  }
  return { frames, orders };
}

const recruits = (game: Game) => game.p1.units().filter((u) => u.startsWith("token-recruit"));

describe("Unchecked Power at the bottom of a six-deep chain — the death cascade it sets off", () => {
  test("(d) printed order: friendly units are exhausted FIRST, then every unit at a battlefield takes 12 — the caster's own included (359.3.e)", async () => {
    const game = await sixDeep();
    await drive(game);
    // A friendly unit big enough to live shows both halves happened to it.
    expect(game.state("colossus")).toMatchObject({ damage: 12, isExhausted: true });
    // A friendly unit in BASE is exhausted but takes nothing — the damage is "at battlefields".
    expect(game.state("reserve")).toMatchObject({ damage: 0, isExhausted: true });
    // An ENEMY unit is never exhausted ("all FRIENDLY units") but is damaged if it stands at one.
    expect(game.state("enemyReserve")).toMatchObject({ damage: 0, isExhausted: false });
    expect(game.zoneOf("enemyFront")).toBe("trash");
    // Everything friendly at bf1 under 12 Might is dead in one batch (319.6).
    for (const id of ["evangel", "u1", "u2", "u3", "u4", "u5"]) {
      expect(game.zoneOf(id)).toBe("trash");
    }
    expect(game.violations()).toEqual([]);
  });

  test("(a) a trigger born during a resolution is appended ON TOP of the chain, with Unchecked Power still pending underneath, and resolves before it (383.3, 337.3, 340.1)", async () => {
    const game = await sixDeep();
    const { frames } = await drive(game);
    // The first frame whose top item is a trigger: [Unchecked Power, Viktor's trigger].
    const born = frames.find((f) => f.triggered > 0);
    expect(born?.names).toEqual(["Unchecked Power", "Viktor, Leader"]);
    // It resolved BEFORE Unchecked Power: the very next distinct shape is the lone spell again.
    const after = frames[frames.indexOf(born!) + 2];
    expect(after?.names).toEqual(["Unchecked Power"]);
  });

  test("(b) ONE trigger per death, never one batch: Unchecked Power's five friendly deaths make five Viktor items plus the Evangel's Deathknell", async () => {
    const game = await sixDeep();
    const { frames } = await drive(game);
    const batch = frames.find((f) => f.names.length === 6 && f.triggered === 6);
    expect(batch).toBeDefined();
    expect(batch?.names.filter((n) => n === "Viktor, Leader")).toHaveLength(5); // evangel + u2..u5
    expect(batch?.names.filter((n) => n === "Machine Evangel")).toHaveLength(1);
    // Six Viktor Recruits in all (the sniped u1 plus the five) and three from the Deathknell.
    expect(recruits(game)).toHaveLength(9);
  });

  test("(b) the enemy's death feeds nothing, and the minted Recruits do not feed Viktor either — the cascade terminates", async () => {
    const game = await sixDeep();
    await drive(game);
    expect(game.zoneOf("enemyFront")).toBe("trash"); // an enemy death: no Viktor trigger for it
    const before = recruits(game);
    expect(before).toHaveLength(9);

    // Kill one Recruit: "another NON-Recruit unit you control" excludes it, so nothing triggers.
    await game.p1.cast("snipe2", { targets: before[0]! });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.has(before[0]!)).toBe(false); // a token that leaves the board ceases to exist
    expect(recruits(game)).toHaveLength(8); // 9 − 1, and no replacement was minted
    expect(game.violations()).toEqual([]);
  });

  test("(c) the whole batch is FINALIZED before anyone regains priority, and 383.3.d's order offer is soft (337.1.a, 337.1.b, 337.4)", async () => {
    const game = await sixDeep();
    const { frames, orders } = await drive(game);
    // All six arrive together — never one, priority, then the next.
    expect(frames.some((f) => f.triggered === 6)).toBe(true);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ defaultable: true, kind: "order", seat: P1 });
    expect(orders[0]?.items).toHaveLength(6);
    // Answering with no keys accepts the listed order and nothing stalls.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) the chain peaks and returns to 0 with the cursor always on exactly one seat and never orphaned (339.1, 319.3/319.4)", async () => {
    expect(DEFAULT_INVARIANTS.map((i) => i.name)).toEqual(
      expect.arrayContaining(["noOrphanChain", "singleDecisionCursor"]),
    );
    const game = await sixDeep();
    const turnBefore = { number: game.turnNumber(), phase: game.phase(), player: game.turnPlayer() };
    const { frames } = await drive(game);

    const peak = Math.max(...frames.map((f) => f.names.length), 6);
    expect(peak).toBe(6);
    expect(game.chain()).toEqual([]);
    // Every frame with a loaded chain had exactly one seat on the cursor.
    for (const f of frames) {
      if (f.names.length > 0) {
        expect(f.cursor).toBeDefined();
      }
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect({ number: game.turnNumber(), phase: game.phase(), player: game.turnPlayer() }).toEqual(turnBefore);
    expect(game.violations()).toEqual([]);
  });

  test("the five older Reactions resolved LIFO underneath as if nothing happened — all four XP Reactions and the Snipe are in the trash and the XP was paid", async () => {
    const game = await sixDeep();
    await drive(game);
    for (const id of ["up", "snipe", "r2", "r3", "r4", "r5"]) {
      expect(game.zoneOf(id)).toBe("trash");
    }
    expect(game.p1.xp()).toBe(4); // one per inert Reaction
  });
});

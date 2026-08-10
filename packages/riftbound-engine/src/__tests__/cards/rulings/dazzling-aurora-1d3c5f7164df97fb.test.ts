/**
 * Ruling 1d3c5f7164df97fb — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · Body · [9][body][body]
 *   × Soulgorger (OGN-196 → ogn-196-298) · Unit · Chaos · [8][chaos][chaos] · 5 Might
 *     "When you play me, you may play a unit from your trash, ignoring its Energy cost."
 *   × Ravenbloom Prefect (VEN-102 → ven-102-166) · Unit · Chaos · [3] · 3 Might
 *     "When an opponent plays a gear, you may banish me to banish it."
 *   (Both plays are queued by Promising Future ogn-115-298: "…Starting with the next player, each player plays
 *    those cards, ignoring Energy costs." — Soulgorger (P2, next player) is appended before Aurora (P1).)
 *
 * Q: Soulgorger and Aurora are pending together (Soulgorger first). Does Aurora enter before Soulgorger's WYPM
 *    resolves — i.e. can the Prefect that WYPM brings back banish Aurora?
 * A: Aurora enters first; Prefect cannot banish her. Items finalize in append order and a unit/gear resolves on
 *    finalizing: Soulgorger enters → Aurora enters → THEN Soulgorger's trigger resolves and plays Prefect from the
 *    trash. Prefect's ability only works while on the board and does not fire retroactively.
 * Rules: 337.1.b (finalize in append order), 337.2 (unit/gear resolves immediately), 383 (triggers need the
 *        source on board when the event happens).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const SOULGORGER = "ogn-196-298";
const RAVENBLOOM_PREFECT = "ven-102-166";
const PROMISING_FUTURE = "ogn-115-298";
const FILLER = { cardType: "unit", energyCost: 3, might: 1, name: "Filler" } as const;

/**
 * P1's turn. P1: Promising Future in hand with exactly [5][mind] + Aurora's [body][body]; Aurora tops P1's deck.
 * P2: Soulgorger tops the deck, [chaos][chaos] for its power cost, Ravenbloom Prefect in the trash (no power cost).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 2, mind: 1 } })
    .resources(P2, { energy: 0, power: { chaos: 2 } })
    .trash(P2, RAVENBLOOM_PREFECT, "prefect")
    .deck(P1, [DAZZLING_AURORA, FILLER, FILLER, FILLER, FILLER, FILLER], ["aurora", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [SOULGORGER, FILLER, FILLER, FILLER, FILLER, FILLER], ["gorger", "b2", "b3", "b4", "b5", "b6"])
    .hand(P1, PROMISING_FUTURE, "pf");
}

const isGorgerOptIn = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P2 && d.source?.cardId === "gorger";

/** Cast PF, resolve it, P1 banishes Aurora, P2 banishes Soulgorger; step until Soulgorger's "you may" opt-in surfaces. */
async function toSoulgorgerOptIn(game: Game): Promise<void> {
  await game.p1.cast("pf");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 2, mind: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
  await game.p1.pick("aurora");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, semantics: "from-revealed" });
  await game.p2.pick("gorger");
  for (let i = 0; i < 10 && !isGorgerOptIn(game.decision()); i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.semantics === "destination") {
      await game.seat(d.seat).pick("base");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(isGorgerOptIn(game.decision())).toBe(true);
}

/** Accept Soulgorger's opt-in, play Prefect from the trash, and drain to P1's open main phase. */
async function playPrefectAndFinish(game: Game): Promise<void> {
  await game.p2.yes();
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "prefect")) {
      expect(d.seat).toBe(P2);
      await game.p2.pick("prefect");
    } else if (d.kind === "pick" && d.semantics === "destination") {
      await game.seat(d.seat).pick("base");
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d.kind === "yes-no") {
      // A Prefect offer here would be the bug — fail loudly rather than answer it.
      throw new Error(`unexpected opt-in: ${d.prompt} (${d.source?.cardId})`);
    } else {
      break;
    }
  }
}

describe("Ruling 1d3c5f7164df97fb — Aurora enters before Soulgorger's WYPM resolves, so the Prefect it returns can't banish her", () => {
  test("finalize order: Soulgorger (older item) ENTERS P2's base, then Aurora ENTERS P1's base as a gear — both on the board while Soulgorger's play trigger is still waiting on the chain and Prefect is still in the trash", async () => {
    const game = await board().build();
    await toSoulgorgerOptIn(game);
    expect(game.zoneOf("gorger")).toBe("base");
    expect(game.state("gorger")).toMatchObject({ controller: P2, owner: P2 });
    expect(game.p2.power("chaos")).toBe(0); // power cost still paid
    expect(game.zoneOf("aurora")).toBe("base");
    expect(game.p1.gear()).toContain("aurora");
    expect(game.p1.power("body")).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gorger", controller: P2, triggered: true })]);
    expect(game.zoneOf("prefect")).toBe("trash");
  });

  test("Soulgorger's WYPM then resolves: P2 plays Ravenbloom Prefect from the trash — it arrives AFTER Aurora is already in play", async () => {
    const game = await board().build();
    await toSoulgorgerOptIn(game);
    await playPrefectAndFinish(game);
    expect(game.zoneOf("prefect")).toBe("base");
    expect(game.state("prefect")).toMatchObject({ controller: P2, might: 3 });
    expect(game.p2.units().sort()).toEqual(["gorger", "prefect"]);
  });

  test("Prefect's 'when an opponent plays a gear' never fires for Aurora (Prefect was in the trash when she was played; no retroactive trigger): no P2 offer, Aurora stays in P1's base, Prefect stays on the board, nothing banished", async () => {
    const game = await board().build();
    await toSoulgorgerOptIn(game);
    await playPrefectAndFinish(game);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("aurora")).toBe("base");
    expect(game.p1.gear()).toContain("aurora");
    expect(game.zoneOf("prefect")).toBe("base");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Prefect DOES work prospectively: with Prefect already on the board, an opponent playing a gear gives P2 the 'banish me to banish it' offer", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { body: 2 } })
      .unit(P2, "base", RAVENBLOOM_PREFECT, "prefect")
      .hand(P1, DAZZLING_AURORA, "aurora")
      .build();
    await game.p1.play("aurora");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "prefect" } });
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("prefect")).toBe("banishment");
    expect(game.zoneOf("aurora")).toBe("banishment");
  });
});

/**
 * Ruling baddb7d5917203fe — Kai'Sa, Evolutionary (OGN-112 → ogn-112-298) · Champion Unit · Mind · 6 · 6 Might
 *   "[Ganking] When I conquer, you may play a spell from your trash with Energy cost less than your points without
 *    paying its Energy cost. Then recycle it."
 *   × Virtuoso (UNL-181 → unl-181-219, Jhin legend)
 *   "When you play a spell, if you spent [4] or more, you may banish it. Then, if there are four spells banished …"
 *
 * Q: When Kai'Sa plays a spell from the trash, can Virtuoso banish it?
 * A: No. The spell resolves (→ trash) and Kai'Sa's ability then finishes with its mandatory "Then recycle it" — the
 *    spell is on the bottom of the deck before Virtuoso's play-trigger could ever look for it, so it is not there to
 *    be banished.
 * Rules: 419.4.a (play-triggers fire after the spell resolves), 359.3 ("Then …" completes the resolving ability first),
 *        409 (recycle), FAQ #9409.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAISA = "ogn-112-298";
const VIRTUOSO = "unl-181-219";
/** A plain 4-cost Mind spell "Draw 1." — costs [4] when cast from hand (Virtuoso's threshold), < 5 points for Kai'Sa. */
const OPUS = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 4,
  name: "Opus",
  rulesText: "Draw 1.",
  timing: "action",
} as const;

/** P1 (Virtuoso legend) at 4 points with Kai'Sa ready in base and an Opus in trash; P2's Blocker (1) holds bf1. A second Opus in hand + [4] for the control. */
function board() {
  return scenario()
    .points(P1, 4)
    .resources(P1, { energy: 4 })
    .legend(P1, VIRTUOSO, "jhin")
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", KAISA, "kaisa")
    .unit(P2, "bf1", { might: 1, name: "Blocker" }, "foe")
    .trash(P1, OPUS, "opusT")
    .hand(P1, OPUS, "opusH");
}

const isVirtuosoOffer = (d: Decision | null) => !!d && d.seat === P1 && d.kind === "yes-no" && d.source?.cardId === "jhin";

/** Kai'Sa conquers bf1 (4 → 5 points), P1 accepts her trigger and picks the trashed Opus. Returns once Opus has been chosen. */
async function kaisaPlaysOpus(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("kaisa", "bf1");
  await game.settle();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(5);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "kaisa" } });
  await game.p1.yes();
  // rule 355.10.a / 383.3.b — the trash is a PUBLIC zone, so the Opus is a TARGET
  // named as the trigger is FINALIZED (sole option ⇒ one-click confirm, 355.10.d.2),
  // not a card picked as the instruction resolves.
  expect(game.chain()[0]?.targets).toEqual(["opusT"]);
  return game;
}

describe("Ruling baddb7d5917203fe — a spell Kai'Sa plays from trash is recycled before Virtuoso could banish it", () => {
  test("control: casting Opus from HAND for [4] does trip Virtuoso — P1 is offered the banish, accepts, and Opus ends in banishment", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.cast("opusH");
    expect(game.p1.energy()).toBe(0);
    let offered = false;
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered") {
        break;
      }
      if (isVirtuosoOffer(game.decision())) {
        offered = true;
        await game.p1.yes();
      } else {
        break;
      }
    }
    expect(offered).toBe(true);
    expect(game.zoneOf("opusH")).toBe("banishment");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
  });

  test("via Kai'Sa: Opus is played for no energy, resolves (draw 1), and is then RECYCLED to the bottom of the deck — it never reaches banishment and Virtuoso gets nothing to banish", async () => {
    const game = await kaisaPlaysOpus();
    const hand = game.p1.hand().length;
    let virtuosoBanished = false;
    for (let i = 0; i < 8; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered") {
        break;
      }
      const d = game.decision();
      if (isVirtuosoOffer(d)) {
        // Even if the legend asks, "it" is no longer in the trash — accepting must not banish anything.
        await game.p1.yes();
        virtuosoBanished = game.zoneOf("opusT") === "banishment";
      } else if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else {
        break;
      }
    }
    expect(game.p1.energy()).toBe(4); // "without paying its Energy cost"
    expect(game.p1.hand()).toHaveLength(hand + 1); // Opus resolved
    expect(virtuosoBanished).toBe(false);
    expect(game.zoneOf("opusT")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("opusT");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

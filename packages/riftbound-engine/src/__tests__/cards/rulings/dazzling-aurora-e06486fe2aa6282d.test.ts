/**
 * Ruling e06486fe2aa6282d — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · "At the end of your turn, reveal cards from the top of
 *     your Main Deck until you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *   × Nocturne, Horrifying (OGN-194 → ogn-194-298) · 4 Might · "[Ganking] As you look at or reveal me from the top of your deck,
 *     you may banish me. If you do, you may play me for [rainbow]."
 *
 * Q: Aurora reveals Nocturne as its first unit — does Nocturne's own ability let Aurora keep digging for another unit?
 * A: No. Aurora stops at the first unit revealed. Nocturne is that unit: Aurora plays it (free) and recycles the rest; the
 *    search never continues. You MAY use Nocturne's alternative [rainbow] play instead, but Aurora still ends there.
 * Rules: 354.2 (reveal-until), 317 (end-of-turn trigger), 356.1.a (alternative cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const NOCTURNE = "ogn-194-298";
const CLEAVE = "ogn-004-298"; // a spell on top — revealed and recycled
const SKULKER = "ogn-175-298"; // the NEXT unit after Nocturne — must never be revealed

/** P1's turn about to end. Aurora in base, 1 rainbow power floating; deck: Cleave, Nocturne, Skulker, Cleave. */
function board() {
  return scenario()
    .resources(P1, { power: { rainbow: 1 } })
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .deck(P1, [CLEAVE, NOCTURNE, SKULKER, CLEAVE], ["s1", "noc", "later", "s2"]);
}

async function endTurnIntoAurora(): Promise<Game> {
  const game = await board().build();
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling e06486fe2aa6282d — Aurora stops at Nocturne (the first unit) and plays it; no further search", () => {
  test("Aurora resolves: Cleave revealed and recycled to the bottom, Nocturne (first unit) is PLAYED to P1's board for free, and the next unit (Skulker) is still on top — never revealed", async () => {
    const game = await endTurnIntoAurora();
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
        continue;
      }
      if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "noc") {
        await game.p1.no(); // decline Nocturne's own banish/alt-cost — let Aurora play it
        continue;
      }
      if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
        await game.p1.pick("base");
        continue;
      }
      break;
    }
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.state("noc")).toMatchObject({ controller: P1, might: 4 });
    const deck = game.p1.deck();
    expect(deck[0]).toBe("later"); // Aurora did NOT keep revealing
    expect(deck[1]).toBe("s2");
    expect(deck.at(-1)).toBe("s1"); // the revealed non-unit was recycled
    expect(deck).not.toContain("noc");
    expect(game.zoneOf("aurora")).toBe("base");
    // One trigger, one unit: exactly one Aurora item ever, and the turn has passed to P2.
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.deck()[0]).toBe("later");
    expect(game.violations()).toEqual([]);
  });

  // Ruling nuance: as Aurora reveals Nocturne, Nocturne's own "as you reveal me … you may banish me … play me for
  // [rainbow]" is offered to P1 (a yes/no sourced from Nocturne); taking it plays Nocturne for [rainbow] and Aurora STILL ends
  // (Skulker stays on top).
  test("ruling e06486fe2aa6282d — Nocturne's optional [rainbow] alt-play is offered during Aurora's reveal", async () => {
    const game = await endTurnIntoAurora();
    let offered = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
        continue;
      }
      if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "noc") {
        offered = true;
        await game.p1.yes(); // banish me / play me for [rainbow]
        continue;
      }
      if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
        await game.p1.pick("base");
        continue;
      }
      break;
    }
    expect(offered).toBe(true);
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.p1.power("rainbow")).toBe(0); // paid the alternative cost
    expect(game.p1.deck()[0]).toBe("later"); // and Aurora still stopped
  });
});

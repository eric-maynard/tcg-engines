/**
 * Ruling 178ecbe40e5fe4e7 — Reinforce (OGN-062 → ogn-062-298) · Spell · Calm · 5
 *   "Look at the top 5 cards of your Main Deck. You may banish a unit from among them, then play it, reducing its
 *    cost by [5]. Recycle the remaining cards."
 *   × Nocturne, Horrifying (OGN-194 → ogn-194-298) 4+[chaos] "As you look at or reveal me from the top of your deck,
 *     you may banish me. If you do, you may play me for [rainbow]."
 *   × Tasty Faefolk (OGN-075 → ogn-075-298) 7-cost 6-Might unit.
 *
 * Q: Reinforce reveals three Nocturnes and a Tasty Faefolk among the five — what is the order of resolution?
 * A: The Nocturnes are banished and go on the chain as pending items FIRST (as they are looked at), then you pick
 *    the Faefolk to banish-and-play (pending), recycle the last card, and finalize the pending items in the order
 *    added — Nocturnes first (paying [rainbow] each at finalization), then Faefolk (7 − 5 = 2). Each unit resolves
 *    as it finalizes.
 * Rules: 337.1 / 359.3.b (pending items are finalized oldest-first after the resolving spell), 356.1.a (Nocturne's
 *        "for [rainbow]" is an alternative cost paid when the play is finalized).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const REINFORCE = "ogn-062-298";
const NOCTURNE = "ogn-194-298";
const TASTY_FAEFOLK = "ogn-075-298";
const FIVE = { cardType: "unit", energyCost: 2, might: 2, name: "Fifth Card" } as const;

/** P1's turn: 7 energy (5 Reinforce + 2 Faefolk), 3 chaos (one per Nocturne). Deck top→: N1, N2, N3, Faefolk, Fifth. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { chaos: 3 } })
    .deck(P1, [NOCTURNE, NOCTURNE, NOCTURNE, TASTY_FAEFOLK, FIVE], ["n1", "n2", "n3", "fae", "five"])
    .hand(P1, REINFORCE, "reinforce");
}

/** Cast Reinforce, pass priorities, say YES to every Nocturne prompt; stop at the "pick a revealed card to play" offer. */
async function reinforceUntilPick(game: Game): Promise<Extract<Decision, { kind: "pick" }>> {
  await game.p1.cast("reinforce");
  expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 3 } });
  const nocturnePrompts: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main") || d.kind === "pick") {
      break;
    }
    if (d.kind === "action") {
      await game.acting().passPriority();
    } else if (d.kind === "yes-no") {
      expect(d.seat).toBe(P1);
      nocturnePrompts.push(d.source?.cardId ?? d.prompt);
      await game.p1.yes();
    } else {
      break;
    }
  }
  // The Nocturnes were each offered (banish? / play?) BEFORE the Faefolk pick.
  expect(nocturnePrompts.length).toBeGreaterThanOrEqual(3);
  const d = game.decision();
  expect(d?.kind).toBe("pick");
  expect(d?.seat).toBe(P1);
  return d as Extract<Decision, { kind: "pick" }>;
}

describe("Ruling 178ecbe40e5fe4e7 — Reinforce into three Nocturnes + Tasty Faefolk", () => {
  test("the Nocturnes are handled first (as they are looked at), THEN the pick among the rest offers Faefolk (and the fifth card) — never a Nocturne", async () => {
    const game = await board().build();
    const d = await reinforceUntilPick(game);
    const offered = d.options.map((o) => o.card ?? o.key).sort();
    expect(offered).toContain("fae");
    expect(offered).not.toContain("n1");
    expect(offered).not.toContain("n2");
    expect(offered).not.toContain("n3");
    expect(d.allowDecline).toBe(true); // "you may"
    for (const n of ["n1", "n2", "n3"]) {
      expect(game.zoneOf(n)).not.toBe("mainDeck"); // already banished off the top
    }
  });

  test("end state: all three Nocturnes and the Faefolk are played (Nocturnes first, then Faefolk), the fifth card is recycled to the bottom, 3×[rainbow] + 5 + 2 paid", async () => {
    const game = await board().build();
    await reinforceUntilPick(game);
    await game.p1.pick("fae");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("n1")).toBe("base");
    expect(game.zoneOf("n2")).toBe("base");
    expect(game.zoneOf("n3")).toBe("base");
    expect(game.zoneOf("fae")).toBe("base");
    // Order of arrival on the board: Nocturnes first, Faefolk last.
    expect(game.p1.base().filter((c) => ["n1", "n2", "n3", "fae"].includes(c))).toEqual(["n1", "n2", "n3", "fae"]);
    expect(game.zoneOf("reinforce")).toBe("trash");
    expect(game.p1.deck().at(-1)).toBe("five"); // recycled
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // 7 − 5 − 2; one chaos per Nocturne
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // Ruling nuance: the Nocturnes sit on the chain as PENDING items while Reinforce keeps resolving; their [rainbow] is
  // paid only when they are finalized, after the Faefolk pick and the recycle.
  test("at the Faefolk pick the Nocturnes are still pending: no [rainbow] has been paid yet and none of them is on the board", async () => {
    const game = await board().build();
    await reinforceUntilPick(game);
    // At the moment P1 chooses the Faefolk, no Nocturne cost has been paid yet and none has entered the board.
    expect(game.p1.power("chaos")).toBe(3);
    for (const n of ["n1", "n2", "n3"]) {
      expect(game.zoneOf(n)).not.toBe("base");
    }
  });
});

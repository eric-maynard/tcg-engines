/**
 * Ruling 5ae85425a6107723 — Baited Hook (OGN-242 → ogn-242-298) · Gear
 *     "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit from
 *      among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *   × Cruel Patron (OGN-208 → ogn-208-298) · 6 Might · "As an additional cost to play me, kill a friendly unit."
 *
 * Q: I Hook my ONLY unit (5 Might) and Cruel Patron is in the top 5 — can I take him, and what happens?
 * A: You may select him, but he is banished first and then cannot actually be played (his mandatory additional
 *    cost — kill a friendly unit — can't be paid with no units left), so he stays in banishment. Or you may
 *    decline to select him, in which case he is simply recycled with the rest.
 * Rules: 356.4 (additional costs must be paid to play), 359.3.e.6 (impossible instruction is skipped), Baited Hook text
 *        ("you MAY banish … and play it").
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const CRUEL_PATRON = "ogn-208-298";
const SKULKER = "ogn-175-298";

type Pick = Extract<Decision, { kind: "pick" }>;

/** P1's turn. P1's ONLY unit is Bait (5 Might) in base. Deck top→: Cruel Patron, four Skulkers, then "below". */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", { might: 5, name: "Bait" }, "bait")
    .unit(P2, "bf1", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(P1, [CRUEL_PATRON, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER], ["patron", "r1", "r2", "r3", "r4", "below"])
    .script(P1, [(d) => (d.kind === "pick" && d.options.some((o) => o.key === "bait") && !d.options.some((o) => (o.card ?? o.key) === "patron") ? "bait" : undefined)]);
}

/** Activate Hook killing Bait and resolve up to the look-at-5 offer. */
async function hookBait(game: Game): Promise<Pick> {
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.activate("hook", 0, { targets: "bait" });
  } else {
    await game.p1.activate("hook");
  }
  await game.settle();
  expect(game.zoneOf("bait")).toBe("trash");
  expect(game.p1.units()).toEqual([]); // P1 now controls no units at all
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d as Pick;
}

describe("Ruling 5ae85425a6107723 — Hooking your only unit into Cruel Patron: select him → stays banished; decline → recycled", () => {
  test("the look-at-5 offer is a 'you may': P1 can decline to select anything", async () => {
    const game = await board().build();
    const d = await hookBait(game);
    expect(d.source?.cardId).toBe("hook");
    expect(d.allowDecline || d.min === 0).toBe(true);
  });

  // Expected (ruling): Cruel Patron is a selectable option (6 ≤ 5+1); selecting him banishes him, the play then fails for
  // want of a friendly unit to kill, and he stays in banishment. Actual (engine): with no friendly unit left the engine
  // pre-filters Cruel Patron out of the offer entirely (only the Skulkers are listed), so he can never end up banished.
  test.failing("BUG: ruling 5ae85425a6107723 — engine hides the unplayable Cruel Patron from the offer instead of letting it be selected (and stay banished)", async () => {
    const game = await board().build();
    const offer = await hookBait(game);
    expect(offer.options.map((o) => o.card ?? o.key)).toContain("patron");
    await game.p1.pick("patron");
    // Whatever the engine asks next (destination / cost), drain it passively; a forced kill-cost with no candidates must not appear.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1 && d.source?.pendingChoiceType === "choose-destination") {
        await game.p1.pick(d.options[0]?.key as string);
      } else {
        const r = await game.settle();
        if (r.reason === "unanswered") {
          break;
        }
      }
    }
    await game.settle();
    expect(game.zoneOf("patron")).toBe("banishment");
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("below"); // the four Skulkers went to the bottom
    expect(game.p1.deck().slice(-4).sort()).toEqual(["r1", "r2", "r3", "r4"]);
    expect(game.violations()).toEqual([]);
  });

  test("declining the offer: Cruel Patron is recycled with the other four — nothing is banished, nothing is played", async () => {
    const game = await board().build();
    await hookBait(game);
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("patron")).toBe("mainDeck");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("below");
    expect(game.p1.deck().slice(-5).sort()).toEqual(["patron", "r1", "r2", "r3", "r4"]);
    expect(game.violations()).toEqual([]);
  });
});

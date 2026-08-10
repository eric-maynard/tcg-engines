/**
 * Ruling abb1d76d2e691981 — Baited Hook (OGN-242 → ogn-242-298, Gear) "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5
 *     cards of your Main Deck. You may banish a unit from among them that has Might up to 1 more than the killed unit and play it,
 *     ignoring its cost. Then recycle the rest."
 *   × Guardian Angel (SFD-051 → sfd-051-221, Equipment +1) "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and
 *     recall me."   (Soraka sfd-173-221 is cited as an equivalent saver.)
 *
 * Q: Baited Hook on a unit wearing Guardian Angel — does the Hook work, or does GA's recall mean nothing was killed?
 * A: The unit is not killed (GA is killed instead; the unit is healed, exhausted, recalled), so there is no "killed unit" Might to
 *    reference: you look at 5, can play nothing, and recycle all 5.
 * Rules: 371–373 (replacement effects), 415.2 (killed = board → trash), 359.3.e.12–13 (no last-known value for a unit that was
 *        never killed).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const GUARDIAN_ANGEL = "sfd-051-221";
const WATCHFUL_SENTRY = "ogn-096-298"; // 1 Might, "[Deathknell] — Draw 1" — a real death would show as a draw

const LOOKED = ["one", "two", "three", "junk", "four"];

/** P1's turn, [1][order]. Hook ready; the bait is a Watchful Sentry at P1's bf1 wearing Guardian Angel (1 + 1 = 2). Deck top→: 1,2,3,spell,4 | Six. */
function board(withGA: boolean) {
  const s = scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(
      P1,
      [
        { cardType: "unit", energyCost: 1, might: 1, name: "One" },
        { cardType: "unit", energyCost: 2, might: 2, name: "Two" },
        { cardType: "unit", energyCost: 3, might: 3, name: "Three" },
        { cardType: "spell", energyCost: 1, name: "Junk" },
        { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
        { cardType: "unit", energyCost: 1, might: 1, name: "Six" },
      ],
      ["one", "two", "three", "junk", "four", "six"],
    );
  return withGA
    ? s
        .unit(P1, "bf1", WATCHFUL_SENTRY, "bait", { equippedWith: ["ga"] } as Record<string, unknown>)
        .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "bait" } as Record<string, unknown>, owner: P1, zone: "bf1" })
    : s.unit(P1, "bf1", WATCHFUL_SENTRY, "bait");
}

async function hookTheBait(game: Game): Promise<void> {
  await game.p1.activate("hook", 0, { targets: "bait" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.state("hook").isExhausted).toBe(true);
}

describe("Ruling abb1d76d2e691981 — Guardian Angel means Baited Hook killed nothing, so it finds nothing", () => {
  test("control (no GA): the 1-Might Sentry is killed → Deathknell draw, and the look-at-5 offers the units of Might ≤ 2", async () => {
    const game = await board(false).build();
    await hookTheBait(game);
    const stop = await game.settle();
    expect(game.zoneOf("bait")).toBe("trash");
    expect(stop.reason).toBe("unanswered");
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["one", "two"]);
  });

  test("with Guardian Angel: the Sentry 'would die' → GA is killed instead; the Sentry is healed, exhausted and recalled to base — never in the trash, no Deathknell draw", async () => {
    const game = await board(true).build();
    expect(game.state("bait")).toMatchObject({ attachments: ["ga"], might: 2 });
    await hookTheBait(game);
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("bait")).toBe("base");
    expect(game.state("bait")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 1 });
    expect(game.p1.trash()).toEqual(["ga"]);
    expect(game.p1.hand()).toEqual([]); // nothing died → no Deathknell
  });

  test("…so the Hook has no 'killed unit' Might: it looks at 5, offers NO unit to play (not even the 1s), and recycles all five to the bottom", async () => {
    const game = await board(true).build();
    await hookTheBait(game);
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.filter((o) => LOOKED.includes(String(o.card ?? o.key)))).toEqual([]);
      await game.p1.decline();
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.banishment()).toEqual([]);
    for (const c of LOOKED) {
      expect(game.zoneOf(c)).toBe("mainDeck");
    }
    expect(game.p1.deck()[0]).toBe("six"); // the five were recycled under it
    expect(game.p1.deck().slice(-5).sort()).toEqual([...LOOKED].sort());
    expect(game.p1.units().sort()).toEqual(["bait"]);
    expect(game.violations()).toEqual([]);
  });
});

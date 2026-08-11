/**
 * Ruling 18c1e9f7f1282a4b — Baited Hook (OGN-242 → ogn-242-298, Gear)
 *   "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit
 *    from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle
 *    the rest."
 *   × Undertitan (SFD-175 → sfd-175-221, 5 Might) "When you play me, give your other units +2 [Might] this turn.
 *     As I'm revealed from your deck, [Add] [2]."
 *
 * Q: Looking at the top 5 with Baited Hook, can I "reveal" an Undertitan among them for the [Add] [2]?
 * A: No. Looking is not revealing; a reveal only happens when an effect explicitly says "reveal". Baited Hook
 *    never reveals, so Undertitan's "As I'm revealed from your deck" does not apply — no energy is added.
 * Rules: 419 (Look ≠ Reveal), 421 (Reveal is a specific instructed action), 383 (trigger conditions are literal).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const UNDERTITAN = "sfd-175-221";

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn. P1: Baited Hook ready, exactly [1][order], a 5-Might Bait in base (ceiling 6 → Undertitan qualifies)
 * and a bystander Pal (so Undertitan's "+2 to your other units" is observable if it is played).
 * Deck top→: Undertitan, Four (4), Junk (spell), Seven (7), Two (2).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", { might: 5, name: "Bait" }, "bait")
    .unit(P1, "base", { might: 1, name: "Pal" }, "pal")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(
      P1,
      [
        UNDERTITAN,
        { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
        { cardType: "spell", energyCost: 1, name: "Junk" },
        { cardType: "unit", energyCost: 7, might: 7, name: "Seven" },
        { cardType: "unit", energyCost: 2, might: 2, name: "Two" },
      ],
      ["titan", "four", "junk", "seven", "two"],
    )
    .script(P1, [(d) => (d.kind === "pick" && /target|kill/i.test(d.prompt) && d.options.some((o) => o.key === "bait") ? "bait" : undefined)]);
}

/** Activate the Hook killing Bait and drive to the look-at-5 offer. */
async function hookBait(game: Game): Promise<Pick> {
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.activate("hook", 0, { targets: "bait" });
  } else {
    await game.p1.activate("hook");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.settle();
  const d = game.decision();
  expect(d?.kind).toBe("pick");
  expect(d?.seat).toBe(P1);
  return d as Pick;
}

const offered = (d: Pick) => d.options.map((o) => o.card ?? o.key).sort();

describe("Ruling 18c1e9f7f1282a4b — Baited Hook LOOKS, it does not REVEAL: Undertitan's [Add] [2] never happens", () => {
  test("while the top 5 are being looked at (Undertitan among them and offered), P1 has gained no energy", async () => {
    const game = await board().build();
    const d = await hookBait(game);
    expect(game.zoneOf("bait")).toBe("trash");
    expect(offered(d)).toEqual(["four", "titan", "two"]); // units ≤ 6; not Seven, not the spell
    expect(game.p1.energy()).toBe(0);
    expect(game.state("titan").zone).toBe("mainDeck"); // still a private card of the deck, merely looked at
  });

  test("choosing Undertitan: it is banished and played for free (its 'when you play me' gives Pal +2), yet still no [Add] [2] — energy stays 0; the rest are recycled", async () => {
    const game = await board().build();
    await hookBait(game);
    await game.p1.pick("titan");
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("titan")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("order")).toBe(0);
    expect(game.state("pal").might).toBe(3); // the play trigger did fire (it WAS played) …
    // … the other four looked-at cards were recycled, not revealed.
    expect(game.p1.deck().slice(-4).sort()).toEqual(["four", "junk", "seven", "two"]);
    expect(game.violations()).toEqual([]);
  });

  test("choosing another unit: Undertitan is recycled to the bottom with the rest, unrevealed — energy stays 0", async () => {
    const game = await board().build();
    await hookBait(game);
    await game.p1.pick("two");
    await game.settle({ policy: "first" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("two")).toBe("base");
    expect(game.zoneOf("titan")).toBe("mainDeck");
    expect(game.p1.deck().slice(-4)).toContain("titan");
    expect(game.p1.energy()).toBe(0);
  });
});

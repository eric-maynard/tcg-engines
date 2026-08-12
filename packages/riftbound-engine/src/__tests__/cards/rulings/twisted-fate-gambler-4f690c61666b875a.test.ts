/**
 * Ruling 4f690c61666b875a — Twisted Fate, Gambler (OGN-200 → ogn-200-298) · Unit/Champion · Chaos · [4] · 4 Might
 *   "When I attack, reveal the top rune of your rune deck, then recycle it. Do one of the following based on
 *    its domain: [fury] — Deal 2 to an enemy unit here and 1 to all other enemy units here.
 *    [mind] — Draw 1.  [order] — Stun an enemy unit."
 *
 * Q: Can I have more than two different domain runes in my Rune Deck?
 * A: In constructed, no — at most two domains; limited allows three. So a Twisted Fate deck must spend one of
 *    its two domain slots on his own [chaos], leaving room for exactly ONE of [fury]/[mind]/[order]. Two of
 *    his three branches are therefore unreachable in constructed, and the stun in particular can never come up
 *    in a deck that is not built around [order].
 * Rules: 022 (Rune Deck construction limits — a format rule, see note), 355.3/359 (a domain-gated branch does
 *        nothing when the revealed domain matches none of them), 424 (reveal), 137 (recycle to the rune deck).
 *
 * Note: deck-construction legality is a FORMAT rule, not game state — the engine builds whatever rune deck it
 * is given. What is testable is the consequence the ruling turns on: which branch a revealed domain selects,
 * and that a domain outside the list selects none.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TWISTED_FATE = "ogn-200-298";
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;
const rune = (domain: string) => ({ cardType: "rune", domain, name: `${domain} Rune` }) as const;

/** Twisted Fate attacks P2's bf1 (two 4-Might defenders) off a rune deck made only of `domain` runes. */
async function attackWithRuneDeckOf(domain: string): Promise<Game> {
  const game = await scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", unit(4, "Defender"), "def")
    .unit(P2, "bf1", unit(4, "Second"), "def2")
    .unit(P1, "base", TWISTED_FATE, "tf")
    .runeDeck(P1, [rune(domain), rune(domain), rune(domain)])
    .build();
  await game.p1.move("tf", "bf1");
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    if (d?.kind === "pick") {
      await game.seat(d.seat).pick("def");
      continue;
    }
    break;
  }
  return game;
}

describe("Ruling 4f690c61666b875a — only one of Twisted Fate's three domain branches is reachable per deck", () => {
  test("a [fury] rune deck: 2 to the chosen enemy and 1 to the others", async () => {
    const game = await attackWithRuneDeckOf("fury");

    expect(game.state("def").damage).toBe(2);
    expect(game.state("def2").damage).toBe(1);
    expect(game.state("def").isStunned).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("a [mind] rune deck: draw 1, no damage, no stun", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", unit(4, "Defender"), "def")
      .unit(P1, "base", TWISTED_FATE, "tf")
      .runeDeck(P1, [rune("mind"), rune("mind"), rune("mind")])
      .build();
    const deck0 = game.p1.deck().length;

    await game.p1.move("tf", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();

    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.state("def").damage).toBe(0);
    expect(game.state("def").isStunned).toBe(false);
  });

  test("an [order] rune deck: the stun — the branch a constructed [chaos] deck can only reach by spending its second domain on [order]", async () => {
    const game = await attackWithRuneDeckOf("order");

    expect(game.state("def").isStunned).toBe(true);
    expect(game.state("def").damage).toBe(0);
  });

  test("a [chaos] rune (Twisted Fate's own domain) matches no branch at all — nothing happens", async () => {
    const game = await attackWithRuneDeckOf("chaos");

    expect(game.state("def")).toMatchObject({ damage: 0, isStunned: false });
    expect(game.state("def2")).toMatchObject({ damage: 0, isStunned: false });
  });

  test("the revealed rune is recycled back into the rune deck either way", async () => {
    const game = await attackWithRuneDeckOf("fury");

    expect(game.p1.runeDeck().length).toBeGreaterThan(0);
    expect(game.p1.runes()).toEqual([]); // revealed and recycled, never channelled
  });
});

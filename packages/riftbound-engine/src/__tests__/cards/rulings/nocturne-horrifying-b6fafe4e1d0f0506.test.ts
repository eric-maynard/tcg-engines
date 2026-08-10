/**
 * Ruling b6fafe4e1d0f0506 — Nocturne, Horrifying (OGN-194 → ogn-194-298) × Ravenbloom Conservatory (SFD-215 → sfd-215-221)
 *   Nocturne: "[Ganking] As you look at or reveal me from the top of your deck, you may banish me. If you do, you may play me
 *   for [rainbow]."   Conservatory (battlefield): "When you defend here, reveal the top card of your Main Deck. If it's a spell,
 *   put it in your hand. Otherwise, recycle it."
 *
 * Q: Can you play Nocturne when he is revealed by Ravenbloom Conservatory, and can he be played to the battlefield?
 * A: Yes and yes (given you control the Conservatory): the reveal lets you banish and play him for [rainbow], and a unit you
 *    play may go to a battlefield you control — the Conservatory itself.
 * Rules: 369–370 ("as you reveal" replacement), 356.1.a (alternative cost), 341.2 (a played unit may enter a battlefield you
 *        control), errata: "reveal" counts as "look at".
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const CONSERVATORY = "sfd-215-221";
const SKULKER = "ogn-175-298";

/**
 * P2's turn. P1 CONTROLS bf1 = Ravenbloom Conservatory (live text) with a 2-Might Defender; P2 holds bf2 and attacks bf1
 * with a 3-Might Raider from base. Nocturne is the top card of P1's deck; P1 has exactly one power for the [rainbow].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1, def: CONSERVATORY, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Defender" }, "defender")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .deck(P1, [NOCTURNE, SKULKER, SKULKER], ["noc", "s1", "s2"]);
}

/** Raider attacks bf1 → "When you defend here" triggers for P1 and resolves (both pass), revealing Nocturne. */
async function attackAndReveal(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, triggered: true })]);
  await game.acting().passPriority();
  await game.acting().passPriority();
  return game;
}

describe("Ruling b6fafe4e1d0f0506 — Nocturne revealed by Ravenbloom Conservatory can be banished, played for [rainbow], and put onto the Conservatory", () => {
  test("the Conservatory's reveal shows Nocturne and offers P1 'you may banish me' (yes/no from Nocturne); YES banishes him and then offers 'play me for [rainbow]'", async () => {
    const game = await attackAndReveal();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
    expect(game.zoneOf("noc")).toBe("mainDeck"); // being revealed from the top
    await game.p1.yes();
    expect(game.zoneOf("noc")).toBe("banishment");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" }, canAccept: true });
  });

  test("YES to the play: P1 chooses where he enters — base OR the Conservatory (bf1, which P1 controls; not P2's bf2) — and picking bf1 lands Nocturne there as a defender, [rainbow] paid", async () => {
    const game = await attackAndReveal();
    await game.p1.yes(); // banish
    await game.p1.yes(); // play for [rainbow]
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "noc" } });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(offered).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("noc")).toBe("battlefield-bf1");
    expect(game.locationOf("noc")).toBe("bf1");
    expect(game.p1.power("chaos")).toBe(0); // the [rainbow] alternative cost, paid from any domain
    expect(game.p1.energy()).toBe(0); // not his printed 4
    expect(game.state("noc").combatRole).toBe("defender");
    expect(game.p1.units("bf1").sort()).toEqual(["defender", "noc"]);
    // the showdown at bf1 carries on with P2 (attacker) holding focus
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("declining the banish: Nocturne is not a spell, so the Conservatory recycles him to the bottom of P1's deck", async () => {
    const game = await attackAndReveal();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("noc")).toBe("mainDeck");
    expect(game.p1.deck()[0]).toBe("s1");
    expect(game.p1.deck().at(-1)).toBe("noc");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.power("chaos")).toBe(1);
  });
});

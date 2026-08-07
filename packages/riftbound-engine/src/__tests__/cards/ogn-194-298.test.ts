/**
 * Nocturne, Horrifying — ogn-194-298 · Champion Unit · Chaos · 4 energy + [chaos] · 4 might
 *
 *   [Ganking] (I can move from battlefield to battlefield.)
 *   As you look at or reveal me from the top of your deck, you may banish me. If you do,
 *   you may play me for [rainbow].
 *
 * Rule 810 (Ganking): the standard move may go battlefield → battlefield.
 * Vision (rule 817) is used as the "look at the top card of your Main Deck" enabler.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const NOCTURNE = "ogn-194-298";
const MYSTIC_PORO = "ogn-171-298"; // 2-energy Chaos unit with [Vision]

describe("Nocturne, Horrifying (ogn-194-298)", () => {
  test("costs 4 energy + 1 chaos power from hand; 4 Might; has Ganking", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, NOCTURNE, "noc").build();
    await game.p1.play("noc", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.state("noc").might).toBe(4);
    expect(game.state("noc").keywords).toContain("Ganking");
    const noPower = await scenario().resources(P1, { energy: 4 }).hand(P1, NOCTURNE, "noc").build();
    expect(noPower.p1.can("play", "noc")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).hand(P1, NOCTURNE, "noc").build();
    expect(lowEnergy.p1.can("play", "noc")).toBe(false);
  });

  test("Ganking: may move from one battlefield to another (a unit without Ganking may not)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", NOCTURNE, "noc")
      .unit(P1, "bf1", { might: 2 }, "plain")
      .build();
    expect(game.p1.can("gank", "noc")).toBe(true);
    expect(game.p1.can("gank", "plain")).toBe(false);
    await game.p1.gank("noc", "bf2");
    expect(game.locationOf("noc")).toBe("bf2");
    expect(game.state("noc").isExhausted).toBe(true);
    expect(game.locationOf("plain")).toBe("bf1");
  });

  test("Ganking into an enemy-held battlefield starts a combat there", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", NOCTURNE, "noc")
      .unit(P2, "bf2", { might: 2 }, "foe")
      .build();
    await game.p1.gank("noc", "bf2");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("noc")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("looking at Nocturne on top of your deck (Vision) offers 'you may banish me', then 'play me for [rainbow]'", async () => {
    // Expected: while P1 looks at the top card (Nocturne), P1 may banish it; having done so P1
    // may play it paying only 1 power of any domain (energy untouched). Actual: Vision goes
    // straight to its recycle prompt; no banish/play offer exists and Nocturne stays in the deck.
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .hand(P1, MYSTIC_PORO, "poro")
      .deckTop(P1, NOCTURNE, "noc")
      .build();
    await game.p1.play("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
    await game.p1.yes(); // banish me
    expect(game.zoneOf("noc")).toBe("banishment");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes(); // play me for [rainbow]
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("declining is possible: the looked-at Nocturne can simply stay on top of the deck", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .hand(P1, MYSTIC_PORO, "poro")
      .deckTop(P1, NOCTURNE, "noc")
      .build();
    await game.p1.play("poro");
    await game.settle();
    while (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // Vision's own "may recycle"
    await game.p1.decline();
    await game.settle();
    expect(game.p1.deck()[0]).toBe("noc");
    expect(game.decision()?.kind).toBe("action");
  });
});

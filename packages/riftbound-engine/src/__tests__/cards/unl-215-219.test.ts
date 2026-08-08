/**
 * Star Spring — unl-215-219 · Battlefield
 *
 *   The first time a player plays a non-token unit here each turn, they may move another unit they
 *   control here to its base.
 *
 * Rules: 190.6.c (a battlefield ability that names "a player … they may" is controlled by THAT player —
 * they put it on the chain and make its choices, whoever controls the battlefield), 383.1 ("the first
 * time … each turn" is a triggered ability; later occurrences that turn do nothing, the count resets
 * with the turn), 185.2.a / 187 (a unit TOKEN being played is playing a unit — but this card says
 * NON-token, so a token neither triggers it nor uses up "the first time"), 355 (units are played to your
 * base or to a battlefield you control — so "a player" is in practice the Spring's controller), 144 /
 * 446 (a Standard Move onto the Spring is not playing a unit), "another … here" (the played unit itself
 * is excluded; only that player's units AT the Spring qualify), effect-move to base is not a Standard
 * Move (no exhaustion, works on exhausted units).
 *
 * Head-judge corner cases for THIS card:
 *  1. The swap line: drop a fresh unit on the Spring and pull the battered/exhausted veteran home.
 *  2. "another": the unit just played can never be the one sent home; with nobody else here the
 *     ability has nothing to move.
 *  3. First time only: a second unit played here the same turn asks nothing; next turn it works again.
 *  4. Non-token: a Recruit token played here first (Herald of the Arcane) neither asks nor burns the
 *     "first time" — the real unit played afterwards still gets the offer.
 *  5. Not "here" / not "play": playing to base or to another battlefield, or MOVING a unit onto the
 *     Spring, never asks.
 *  6. Symmetry: when P2 controls the Spring (P1's card) and plays there, P2 is asked and P2's unit moves.
 *
 * Engine status: the parsed trigger is `{event:"play-unit", on:"any-player", restrictions:[first-time-
 * each-turn, non-token]}` with NO `location:"here"`, and the effect is `move another unit → "choose"`
 * (controller/here/base all dropped); the trigger matcher additionally refuses `any-player` play
 * triggers on battlefield cards. Every positive clause below is therefore a BUG test today.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-215-219";
const HERALD = "ogn-265-298"; // legend · [1], [Exhaust]: Play a 1 [Might] Recruit unit token.
const ROOKIE = { cardType: "unit", energyCost: 2, might: 2, name: "Rookie" } as const;

/** P1 (6 energy) controls the live Spring (bf1, card owned by P2) with an exhausted, damaged Veteran on it; bf2 is P1's inert battlefield; two Rookies in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Veteran" }, "vet", { exhausted: true })
    .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "bf2", { might: 1, name: "Outpost" }, "outpost")
    .hand(P1, ROOKIE, "rookie")
    .hand(P1, { ...ROOKIE, name: "Rookie Two" }, "rookie2");
}

/** Is the Spring's ability being offered to `seat` right now (as a chain item it controls or as its prompt)? */
function springOffered(game: Game, seat: string): boolean {
  const onChain = game.chain().some((c) => c.cardId === "bf1" && c.triggered && c.controller === seat);
  const d = game.decision();
  const prompted = d !== null && d.kind !== "action" && d.seat === seat && d.source?.cardId === "bf1";
  return onChain || prompted;
}

/** Accept the Spring's "you may", pick `target` if asked, and let the item resolve. Returns the cards offered by the pick (if any). */
async function acceptSpring(game: Game, seat: typeof P1, target: string): Promise<string[]> {
  let offered: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === seat) {
      await game.seat(seat).yes();
    } else if (d?.kind === "pick" && d.seat === seat) {
      offered = d.options.map((o) => String(o.card ?? o.key));
      await game.seat(seat).pick(target);
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return offered;
}

describe("Star Spring (unl-215-219)", () => {
  test("baseline: a unit can be played HERE (a battlefield I control) for its cost and arrives; the Veteran is untouched when nothing is accepted", async () => {
    const game = await board().build();
    expect([...((game.p1.option("playUnit", "rookie")?.fields.find((f) => f.arg === "to")?.options as string[]) ?? [])].sort()).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
    await game.p1.play("rookie", { to: "bf1" });
    expect(game.p1.energy()).toBe(4);
    await game.settle();
    expect(game.zoneOf("rookie")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1").sort()).toEqual(["rookie", "vet"]);
    expect(game.violations()).toEqual([]);
  });

  // BUG — expected: playing Rookie (non-token) onto the Spring is "the first time" → P1 is offered the
  // ability; accepting offers ONLY the other unit P1 controls HERE (the Veteran — not Rookie itself, not
  // Homebody in base, not Outpost at bf2); the exhausted Veteran goes to base still exhausted, Rookie stays.
  // Actual: nothing triggers (no `here` on the parsed trigger; matcher denies any-player play triggers on battlefields).
  test.failing("BUG: first non-token unit played here → 'you may move ANOTHER unit you control here to its base' (the Veteran goes home, Rookie stays)", async () => {
    const game = await board().build();
    await game.p1.play("rookie", { to: "bf1" });
    expect(springOffered(game, P1)).toBe(true);
    const offered = await acceptSpring(game, P1, "vet");
    if (offered.length > 0) {
      expect(offered).toEqual(["vet"]);
    }
    await game.settle();
    expect(game.zoneOf("vet")).toBe("base");
    expect(game.state("vet").isExhausted).toBe(true); // moved by an effect, state unchanged
    expect(game.zoneOf("rookie")).toBe("battlefield-bf1");
    expect(game.zoneOf("outpost")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  // BUG — expected: the offer is made for the FIRST unit played here this turn only; Rookie Two played here
  // afterwards asks nothing. Actual: no offer at all (first assertion fails).
  test.failing("BUG: only the FIRST unit played here each turn asks — the second one the same turn does not", async () => {
    const game = await board().build();
    await game.p1.play("rookie", { to: "bf1" });
    expect(springOffered(game, P1)).toBe(true);
    await game.settle(); // passive settle declines nothing it can't; answer explicitly if a yes/no is pending
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    await game.p1.play("rookie2", { to: "bf1" });
    expect(springOffered(game, P1)).toBe(false);
    await game.settle();
    expect(game.p1.units("bf1").sort()).toEqual(["rookie", "rookie2", "vet"]);
  });

  // BUG — expected: "each turn" — after declining this turn, on my NEXT turn a unit played here asks again.
  // Actual: never asks.
  test.failing("BUG: 'each turn' resets — declined on turn N, offered again for a unit played here on my next turn", async () => {
    const game = await board().build();
    await game.p1.play("rookie", { to: "bf1" });
    expect(springOffered(game, P1)).toBe(true);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    }
    await game.settle();
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.p1.do("addResources", { energy: 2 });
    await game.p1.play("rookie2", { to: "bf1" });
    expect(springOffered(game, P1)).toBe(true);
  });

  test("negative space — with NO other unit of mine here there is nothing 'another … here' to move: Rookie arrives, Homebody stays home, straight back to the main phase", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
      .hand(P1, ROOKIE, "rookie")
      .build();
    await game.p1.play("rookie", { to: "bf1" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("rookie")).toBe("battlefield-bf1");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("negative space — not HERE: playing a unit to my base or to my other battlefield (bf2) never involves the Spring", async () => {
    const toBase = await board().build();
    await toBase.p1.play("rookie", { to: "base" });
    expect(springOffered(toBase, P1)).toBe(false);
    await toBase.settle();
    expect(toBase.zoneOf("vet")).toBe("battlefield-bf1");
    const toBf2 = await board().build();
    await toBf2.p1.play("rookie", { to: "bf2" });
    expect(springOffered(toBf2, P1)).toBe(false);
    await toBf2.settle();
    expect(toBf2.zoneOf("rookie")).toBe("battlefield-bf2");
    expect(toBf2.zoneOf("vet")).toBe("battlefield-bf1");
    expect(toBf2.zoneOf("outpost")).toBe("battlefield-bf2");
  });

  test("negative space — not a PLAY: a Standard Move of Homebody onto the Spring asks nothing and moves nobody home", async () => {
    const game = await board().build();
    await game.p1.move("home", "bf1");
    expect(springOffered(game, P1)).toBe(false);
    await game.settle();
    expect(game.p1.units("bf1").sort()).toEqual(["home", "vet"]);
  });

  test("negative space — NON-token: a Recruit token played here (Herald of the Arcane, [1] + exhaust) asks nothing", async () => {
    const game = await board().legend(P1, HERALD, "herald").build();
    await game.p1.activate("herald");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-bf1");
    expect(springOffered(game, P1)).toBe(false);
    await game.settle();
    expect(game.p1.units("bf1")).toHaveLength(2); // Veteran + the Recruit token
    expect(game.p1.units("bf1").some((u) => game.state(u).isToken)).toBe(true);
    expect(game.zoneOf("vet")).toBe("battlefield-bf1");
    expect(game.p1.energy()).toBe(5);
  });

  // BUG — expected: the token did not use up "the first time a player plays a NON-token unit here", so the
  // Rookie played here afterwards is still the first non-token unit → offer. Actual: never offered.
  test.failing("BUG: a token played here first does not consume 'the first time' — the real unit played next still gets the offer", async () => {
    const game = await board().legend(P1, HERALD, "herald").build();
    await game.p1.activate("herald");
    await game.settle();
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(springOffered(game, P1)).toBe(false);
    await game.p1.play("rookie", { to: "bf1" });
    expect(springOffered(game, P1)).toBe(true);
  });

  // BUG — expected (190.6.c): P2 controls the Spring (card owned by P1) and plays a unit there on P2's turn →
  // P2 is "they": P2 is asked, and P2's other unit here goes to P2's base; P1 is never asked. Actual: no offer.
  test.failing("BUG: symmetry — the player who plays here controls the ability: P2 plays onto a Spring it controls, P2 is asked and P2's Veteran goes home", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "bf1", { might: 3, name: "Their Veteran" }, "theirVet")
      .unit(P1, "base", { might: 1, name: "Bystander" }, "by")
      .hand(P2, ROOKIE, "theirRookie")
      .build();
    await game.p2.play("theirRookie", { to: "bf1" });
    expect(springOffered(game, P1)).toBe(false);
    expect(springOffered(game, P2)).toBe(true);
    await acceptSpring(game, P2, "theirVet");
    await game.settle();
    expect(game.zoneOf("theirVet")).toBe("base");
    expect(game.p2.base()).toContain("theirVet");
    expect(game.zoneOf("theirRookie")).toBe("battlefield-bf1");
    expect(game.zoneOf("by")).toBe("base");
  });

  test("registry payload (as parsed today): one optional triggered ability — play-unit, any player, first-time-each-turn + non-token, effect = move another unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Star Spring" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { target: { excludeSelf: true, type: "unit" }, type: "move" },
      optional: true,
      trigger: {
        event: "play-unit",
        on: "any-player",
        restrictions: expect.arrayContaining([{ type: "first-time-each-turn" }, { type: "non-token" }]),
      },
      type: "triggered",
    });
  });

  // BUG (parse) — expected: the printed text scopes BOTH halves to this battlefield and to the acting player:
  // trigger "plays a non-token unit HERE" → a `here` location on the trigger; effect "another unit THEY CONTROL
  // HERE to its BASE" → target controller = that player, target location here, destination base. Actual:
  // trigger has no location, target has neither controller nor location, and `to` is "choose".
  test.failing("BUG: registry payload drops 'here' (trigger AND target), 'they control', and 'to its base'", async () => {
    const a = (await loadDefaultCardPool()).get(CARD)?.abilities?.[0] as {
      trigger: Record<string, unknown>;
      effect: { to?: unknown; target?: Record<string, unknown> };
    };
    expect(JSON.stringify(a.trigger)).toContain("here");
    expect(a.effect.to).toBe("base");
    expect(a.effect.target?.location).toBe("here");
    expect(a.effect.target?.controller).toBeDefined();
  });
});

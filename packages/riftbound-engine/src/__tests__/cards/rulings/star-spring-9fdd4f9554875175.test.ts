/**
 * Ruling 9fdd4f9554875175 — Star Spring (UNL-215 → unl-215-219, battlefield) "The first time a player plays a non-token unit
 *     here each turn, they may move another unit they control here to its base."
 *   × Mask of Foresight (OGN-060 → ogn-060-298, gear) "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   × Rengar, Pouncing (sfd-025-221) · [Reaction] unit · 3 Might · "…including to a battlefield you control." (the "ambushed" Rengar)
 *
 * Q: Opponent attacks my solo unit at Star Spring; I have Mask of Foresight. I flash Rengar in to Star Spring and use the Spring
 *    to send my original unit home. Does Mask now give Rengar +1 for defending alone?
 * A: No. "Defends alone" is checked only when defenders are designated at the start of the showdown (the original unit got
 *    that check). Units arriving or leaving later are not re-designated, so Mask never triggers for Rengar.
 * Rules: 383.4.e (attack/defend triggers evaluated at designation), 740.2 (alone), 813/822 (Reaction-speed unit play).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_SPRING = "unl-215-219";
const MASK = "ogn-060-298";
const RENGAR = "sfd-025-221";

/** P2's turn. P1 controls the live Star Spring with a lone Sentinel (2); Mask in P1's base; Rengar in hand with [3][fury]. P2's Raider (3) attacks. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("spring", { controller: P1, def: STAR_SPRING, inert: false, owner: P1 })
    .unit(P1, "spring", { might: 2, name: "Sentinel" }, "sentinel")
    .gear(P1, MASK, "mask")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RENGAR, "rengar");
}

const maskTriggers = (game: Game) => game.chain().filter((c) => c.cardId === "mask" && c.triggered).length;

/** Raider attacks; the Sentinel defends alone → Mask triggers and resolves (+1). Returns with the showdown open. */
async function attackedAlone(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "spring");
  expect(game.state("sentinel").combatRole).toBe("defender");
  expect(game.p1.units("spring")).toEqual(["sentinel"]);
  expect(maskTriggers(game)).toBe(1); // checked at designation: alone ✔
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().pass();
  }
  expect(game.state("sentinel")).toMatchObject({ might: 3, mightModifier: 1 });
  return game;
}

/** P1 Reaction-plays Rengar to the Spring, accepts the Spring's offer and sends the Sentinel home; drains the chain. */
async function rengarInSentinelOut(game: Game): Promise<void> {
  for (let i = 0; i < 3 && !(game.actingSeat() === P1 && game.p1.can("play", "rengar")); i++) {
    await game.acting().pass();
  }
  expect(game.p1.can("play", "rengar")).toBe(true);
  await game.p1.play("rengar", { to: "spring" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.locationOf("rengar")).toBe("spring");
  let springAsked = false;
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      springAsked = true;
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      springAsked = true;
      expect(d.options.map((o) => o.card ?? o.key)).toContain("sentinel");
      expect(d.options.map((o) => o.card ?? o.key)).not.toContain("rengar"); // "another unit"
      await game.p1.pick("sentinel");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  expect(springAsked).toBe(true);
  expect(game.locationOf("sentinel")).toBe("base");
}

describe("Ruling 9fdd4f9554875175 — Mask of Foresight does not re-check 'alone' when Rengar replaces the original defender", () => {
  test("the original lone defender got Mask's +1 at designation; after Rengar arrives and the Spring sends the Sentinel home, Rengar is P1's only unit there — yet NO new Mask trigger and Rengar stays at 3", async () => {
    const game = await attackedAlone();
    await rengarInSentinelOut(game);
    expect(game.p1.units("spring")).toEqual(["rengar"]);
    expect(maskTriggers(game)).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.state("rengar")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.state("sentinel")).toMatchObject({ location: "base", mightModifier: 1 }); // keeps its own +1
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "spring" });
  });

  test("outcome proves it: Rengar fights at 3, not 4 — Raider (3) and Rengar (3) trade and nobody holds the Spring", async () => {
    const game = await attackedAlone();
    await rengarInSentinelOut(game);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("rengar")).toBe("trash");
    expect(game.zoneOf("sentinel")).toBe("base");
    expect(game.state("rengar").mightModifier).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

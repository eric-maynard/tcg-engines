/**
 * Ruling 633044cd3d7deada — Showstopper (OGN-270 → ogn-270-298) "Buff a friendly unit in your base, then move it to a battlefield."
 *   × Blastcone Fae (OGN-097 → ogn-097-298) · [Hidden] "When you play me, give a unit -2 [Might] this turn, to a minimum of 1 [Might]."
 *   × The Boss (Sett legend, OGN-269 → ogn-269-298) "If a buffed unit you control would die, you may pay [rainbow], exhaust me,
 *     and spend its buff to heal it, exhaust it, and recall it instead."
 *
 * Q: A unit buffed by Showstopper takes Blastcone Fae's -2 — does it still count as buffed for The Boss to save/recall it?
 * A: Yes. Buff is a status marker independent of the net stat change; a negative Might modifier does not remove it, so
 *    The Boss's replacement can still spend the buff, heal, exhaust and recall the unit.
 * Rules: 702 (Buff is a marker: +1 Might, max one), 367–370 (replacement "instead"), The Boss text.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHOWSTOPPER = "ogn-270-298";
const BLASTCONE_FAE = "ogn-097-298";
const THE_BOSS = "ogn-269-298";

/**
 * P1's turn, The Boss as P1's legend. P1's Brawler (2) in base; Showstopper in hand; exactly [1] + 2 rainbow (spell pip +
 * The Boss). P2 holds bf1 with Bouncer (5) and a facedown Blastcone Fae there.
 */
function board() {
  return scenario()
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { energy: 1, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Brawler" }, "brawler")
    .unit(P2, "bf1", { might: 5, name: "Bouncer" }, "bouncer")
    .facedown(P2, "bf1", BLASTCONE_FAE, "fae")
    .hand(P1, SHOWSTOPPER, "show");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Showstopper buffs Brawler and moves it into bf1 (combat opens); P2 flips Blastcone Fae there and shrinks Brawler by 2. */
async function buffedThenShrunk(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("show", { targets: "brawler" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick(d.options.find((o) => o.key.includes("bf1"))?.key as string);
  }
  expect(game.state("brawler")).toMatchObject({ isBuffed: true, location: "bf1", might: 3 });
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
  // Attacker (P1) has Focus first; pass it so P2 can flip the Fae.
  for (let i = 0; i < 3 && !(game.actingSeat() === P2 && game.p2.can("reveal", "fae")); i++) {
    await game.acting().pass();
  }
  await game.p2.reveal("fae");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "fae" } });
  await game.p2.pick("brawler");
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  return game;
}

describe("Ruling 633044cd3d7deada — a Showstopper buff survives Blastcone Fae's -2, so The Boss can still cash it in", () => {
  test("after the -2 the Brawler is 1 Might (2 +1 buff -2) and STILL carries the Buff marker", async () => {
    const game = await buffedThenShrunk();
    expect(game.locationOf("fae")).toBe("bf1");
    expect(game.state("brawler")).toMatchObject({ isBuffed: true, might: 1, mightModifier: -2 });
  });

  test("combat would kill the 1-Might Brawler → The Boss's 'buffed unit would die' replacement is OFFERED to P1", async () => {
    const game = await buffedThenShrunk();
    const r = await game.settle(); // both pass focus → combat damage
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    expect(game.zoneOf("brawler")).toBe("battlefield-bf1"); // not dead yet — the replacement is being asked
  });

  test("accepting: [rainbow] paid, The Boss exhausted, the buff SPENT; Brawler is healed, exhausted and recalled to base instead of dying", async () => {
    const game = await buffedThenShrunk();
    await game.settle();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.state("brawler")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, location: "base" });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.p1.trash()).not.toContain("brawler");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: declining The Boss lets the shrunken-but-buffed Brawler die normally", async () => {
    const game = await buffedThenShrunk();
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.state("boss").isExhausted).toBe(false);
  });
});

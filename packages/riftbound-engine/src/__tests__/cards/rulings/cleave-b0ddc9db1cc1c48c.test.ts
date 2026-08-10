/**
 * Ruling b0ddc9db1cc1c48c — Cleave (OGN-004 → ogn-004-298) · [1] Action "Give a unit [Assault 3] this turn." (+3 Might while attacking)
 *   × Flash (OGS-011 → ogs-011-024) · Reaction "Move up to 2 friendly units to base."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · [Hidden][Action] "Move a unit from a battlefield to its base."
 *   (Ride the Wind ogn-173-298 appears only in the nuance about a surprise defense — covered by ruling 5cfd177dd933c567.)
 *
 * Q: A starts a COMBAT showdown and Cleaves its attacker; B answers with Flash / Fight or Flight pulling the defender out. With no defender
 *    left, does the showdown turn non-combat and switch off Cleave's Assault 3?
 * A: No. A showdown never changes between combat and non-combat once begun; the unit is still an attacker in a combat showdown, so
 *    Assault 3 applies. (It then simply wins the field unopposed.)
 * Rules: 803 (Assault: +N while attacking), 442 / 459–466 (showdown type fixed when it opens; roles persist), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const FLASH = "ogs-011-024";
const FIGHT_OR_FLIGHT = "ogn-168-298";

const stack = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);

/**
 * P1's turn (turn 3). P2 holds bf1 with a lone Defender (4); P2 has Flash in hand ([2][chaos]) AND Fight or Flight facedown at bf1 (hidden
 * earlier). P1: Raider (2) ready in base, Cleave + [1].
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 4, name: "Defender" }, "def")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P2, FLASH, "flash")
    .unit(P1, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P1, CLEAVE, "cleave");
}

/** Raider attacks bf1 (COMBAT showdown, P1 has Focus) and P1 Cleaves it; P1 passes priority to P2. */
async function combatAndCleave(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(stack(game)).toHaveLength(1);
  expect(stack(game)[0]).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.state("def").combatRole).toBe("defender");
  await game.p1.cast("cleave", { targets: "raider" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** Drain the chain (both keep passing priority). */
async function drain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

function expectAssaultStillOn(game: Game): void {
  expect(game.locationOf("def")).toBe("base"); // the defender is gone…
  expect(stack(game)).toHaveLength(1);
  expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true }); // …but it is still THE combat showdown
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.state("raider").grantedKeywords).toEqual(expect.arrayContaining([expect.objectContaining({ keyword: "Assault", value: 3 })]));
  expect(game.state("raider").might).toBe(5); // 2 + Assault 3 applies
}

describe("Ruling b0ddc9db1cc1c48c — pulling the defender out doesn't make the combat 'non-combat': Cleave's Assault 3 still applies", () => {
  test("Flash in response: Flash resolves (Defender → base), then Cleave; the showdown is still a combat showdown, the Raider still an attacker at 2 + 3 = 5", async () => {
    const game = await combatAndCleave();
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: "def" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "flash"]);
    await drain(game);
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("trash");
    expectAssaultStillOn(game);
  });

  test("Fight or Flight (revealed from facedown at bf1) on the Defender in response: same — combat showdown persists, Raider attacking at 5", async () => {
    const game = await combatAndCleave();
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof", { answers: ["def"] });
    for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
      await game.p2.pick("def");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "fof"]);
    await drain(game);
    expect(game.zoneOf("fof")).toBe("trash");
    expectAssaultStillOn(game);
  });

  test("the combat then concludes with the Raider unopposed: P1 takes bf1 and conquers; Assault lapses only once it is no longer attacking (back to 2)", async () => {
    const game = await combatAndCleave();
    await game.p2.cast("flash", { targets: "def" });
    await game.settle();
    expect(stack(game)).toEqual([]);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.state("raider").combatRole).not.toBe("attacker");
    expect(game.state("raider").might).toBe(2); // Assault only counts while attacking; the keyword grant itself lasts the turn
    expect(game.state("raider").grantedKeywords).toEqual(expect.arrayContaining([expect.objectContaining({ keyword: "Assault", value: 3 })]));
    expect(game.zoneOf("def")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});

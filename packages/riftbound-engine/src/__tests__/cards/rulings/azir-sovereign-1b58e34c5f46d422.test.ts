/**
 * Ruling 1b58e34c5f46d422 — Azir, Sovereign (SFD-177 → sfd-177-221) · Champion Unit · Order · [4] · 4 Might
 *   "[Accelerate] … When I attack, you may move any number of your token units to this battlefield."
 *
 * Q: Azir attacks and drags a Sand Soldier token along. The token was READY before the move — is it
 *    exhausted once everything is said and done?
 * A: No, it stays ready. Azir's ability is a triggered ability that moves the token; it is not a Standard
 *    Move, and only a Standard Move has "exhaust the unit" as its cost. Spells/abilities that move units do
 *    not change ready/exhausted unless they say so — which is also why an already-exhausted token can be
 *    dragged along and simply stays exhausted.
 * Rules: 144.2 (exhausting is the COST of a Standard Move), 383.1 (triggered ability), 359.3 (an instruction
 *        does only what it says), 464 (attack triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AZIR = "sfd-177-221";
/** Token instances: the "token-" id prefix is what marks a harness card as a token object. */
const READY_SOLDIER = "token-sand-soldier-ready";
const TIRED_SOLDIER = "token-sand-soldier-exhausted";

/**
 * P1's turn. P2 holds bf1 with a 2-Might Defender. P1 has Azir plus two Sand Soldier tokens in base —
 * one ready, one already exhausted. bf2 is an empty, uncontrolled battlefield used for the control test.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
    .unit(P1, "base", AZIR, "azir")
    .unit(P1, "base", { might: 2, name: "Sand Soldier" }, READY_SOLDIER)
    .unit(P1, "base", { might: 2, name: "Sand Soldier" }, TIRED_SOLDIER, { exhausted: true })
    .autoProcedures(false);
}

/** Azir attacks bf1; answer his finalization prompts, naming the tokens given. Returns what was offered. */
async function azirAttacks(game: Game, take: readonly string[]): Promise<{ offered: string[]; askedYesNo: boolean }> {
  const offered: string[] = [];
  let askedYesNo = false;
  await game.p1.move("azir", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "azir", controller: P1, triggered: true })]);
  for (let i = 0; i < 8; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.seat !== P1) {
      break;
    }
    if (d.kind === "yes-no") {
      askedYesNo = true;
      await game.p1.yes();
      continue;
    }
    if (d.kind === "pick") {
      offered.push(...d.options.map((o) => o.card ?? o.key));
      const keys = d.options.filter((o) => take.includes(o.card ?? o.key)).map((o) => o.key);
      if (keys.length > 0) {
        await game.p1.pick(...keys);
      } else {
        await game.p1.decline();
      }
      continue;
    }
    break;
  }
  return { askedYesNo, offered };
}

/** Drain the chain so Azir's trigger actually executes (combat itself is left alone: autoProcedures off). */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || !d.passKey) {
      break;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling 1b58e34c5f46d422 — Azir's trigger moves tokens without exhausting them", () => {
  test("premise: both Sand Soldiers are token units in P1's base, one ready and one exhausted", async () => {
    const game = await board().build();
    expect(game.state(READY_SOLDIER)).toMatchObject({ isExhausted: false, isReady: true, isToken: true, zone: "base" });
    expect(game.state(TIRED_SOLDIER)).toMatchObject({ isExhausted: true, isReady: false, isToken: true, zone: "base" });
  });

  test("control — a STANDARD move costs the unit its ready state (144.2): moving the ready Soldier to bf2 by hand exhausts it", async () => {
    const game = await board().build();
    await game.p1.move(READY_SOLDIER, "bf2");
    expect(game.locationOf(READY_SOLDIER)).toBe("bf2");
    expect(game.state(READY_SOLDIER).isExhausted).toBe(true);
  });

  test("Azir's attack trigger surfaces as P1's decisions: a 'you may' and then the set of his token units — the exhausted one is offered too", async () => {
    const game = await board().build();
    const { askedYesNo, offered } = await azirAttacks(game, [READY_SOLDIER, TIRED_SOLDIER]);
    expect(askedYesNo).toBe(true);
    expect(offered).toContain(READY_SOLDIER);
    expect(offered).toContain(TIRED_SOLDIER); // FAQ #1531 — being exhausted is no obstacle
    expect(offered).not.toContain("azir"); // Azir is not a token unit
  });

  test("ruling 1b58e34c5f46d422 — the ready token lands at Azir's battlefield STILL READY (no Standard Move ⇒ no exhaust cost)", async () => {
    const game = await board().build();
    await azirAttacks(game, [READY_SOLDIER]);
    await resolveChain(game);
    expect(game.locationOf(READY_SOLDIER)).toBe("bf1");
    expect(game.state(READY_SOLDIER)).toMatchObject({ isExhausted: false, isReady: true });
  });

  test("…while Azir, who got there by a Standard Move, IS exhausted — the two moves are priced differently", async () => {
    const game = await board().build();
    await azirAttacks(game, [READY_SOLDIER]);
    await resolveChain(game);
    expect(game.state("azir")).toMatchObject({ combatRole: "attacker", isExhausted: true, location: "bf1" });
    expect(game.state(READY_SOLDIER).isExhausted).toBe(false);
  });

  test("an already-exhausted token can be dragged along too, and arrives still exhausted — the ability never touches ready state either way", async () => {
    const game = await board().build();
    await azirAttacks(game, [READY_SOLDIER, TIRED_SOLDIER]);
    await resolveChain(game);
    expect(game.locationOf(TIRED_SOLDIER)).toBe("bf1");
    expect(game.state(TIRED_SOLDIER).isExhausted).toBe(true);
    expect(game.state(READY_SOLDIER).isExhausted).toBe(false);
    expect(game.p1.units("bf1").sort()).toEqual([READY_SOLDIER, TIRED_SOLDIER, "azir"].sort());
  });

  test("and the ready token is still ready once combat has resolved: 4 + 2 + 2 beats the 2-Might Defender and P1 conquers bf1", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
      .unit(P1, "base", AZIR, "azir")
      .unit(P1, "base", { might: 2, name: "Sand Soldier" }, READY_SOLDIER)
      .build();
    await game.p1.move("azir", "bf1");
    await game.p1.yes();
    await game.p1.pick(READY_SOLDIER);
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state(READY_SOLDIER)).toMatchObject({ isExhausted: false, location: "bf1" });
    expect(game.violations()).toEqual([]);
  });
});

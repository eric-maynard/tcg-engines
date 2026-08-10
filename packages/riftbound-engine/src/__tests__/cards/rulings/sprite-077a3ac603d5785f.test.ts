/**
 * Ruling 077a3ac603d5785f — Sprite (OGN-274 → ogn-274-298) · 3-Might unit token "[Temporary] (Kill me at the start of your
 *     Beginning Phase, before scoring.)"
 *   (exercised with Tideturner ogn-199-298 — a [Hidden] UNIT — as the hidden card at the Sprite's battlefield)
 *
 * Q: My Sprite token holds a battlefield where I also have a Hidden card. When my turn begins, can I play the Hidden card before
 *    the token is removed, or is the token removed automatically (discarding the Hidden card with the lost battlefield)?
 * A: You can react: Temporary is a TRIGGER at the start of your turn; flip the Hidden card in response. If it is a unit you even
 *    keep the battlefield and score the hold, because Temporary happens before scoring. Then the token is removed.
 * Rules: 816 (Temporary = triggered kill at start of Beginning Phase, before scoring), 383/330 (trigger → chain → priority),
 *        811 (play from Hidden as a Reaction for [0], "here"), 315.2 → hold scoring after Beginning-step triggers, 186.1 (token ceases to exist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const TIDETURNER = "ogn-199-298";

/** End of P2's turn 3. P1 controls bf1 with ONLY a Sprite token, and hid Tideturner there earlier. P1 on 2 points. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .points(P1, 2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "bf1", SPRITE, "token-sprite")
    .facedown(P1, "bf1", TIDETURNER, "tide");
}

/** P2 ends the turn → P1's Beginning Phase: the Temporary trigger is on the chain, P1 has priority. */
async function atTemporaryTrigger(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "token-sprite", controller: P1, triggered: true })]);
  return game;
}

/** …P1 flips Tideturner in response and declines its optional swap. */
async function flipTideturnerInResponse(game: Game): Promise<void> {
  expect(game.p1.can("reveal", "tide")).toBe(true);
  await game.p1.reveal("tide");
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.no(); // "you may choose a unit you control at another location" — not now
    } else {
      break;
    }
  }
}

describe("Ruling 077a3ac603d5785f — flip the Hidden card in response to the Sprite's Temporary trigger; a unit even keeps the hold", () => {
  test("the token is NOT removed automatically: Temporary is a chain item at the start of P1's turn, the Sprite is still alive at bf1, nothing scored yet, and the facedown card is intact and playable", async () => {
    const game = await atTemporaryTrigger();
    expect(game.zoneOf("token-sprite")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(2);
    expect(game.zoneOf("tide")).toBe("facedown-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "tide")).toBe(true);
  });

  test("P1 flips Tideturner in response: it is played (for [0]) as a unit AT bf1 while the Temporary trigger still waits underneath", async () => {
    const game = await atTemporaryTrigger();
    await flipTideturnerInResponse(game);
    expect(game.zoneOf("tide")).toBe("battlefield-bf1");
    expect(game.state("tide").isHidden).toBe(false);
    expect(game.chain().some((c) => c.cardId === "token-sprite" && c.triggered)).toBe(true);
    expect(game.zoneOf("token-sprite")).toBe("battlefield-bf1");
  });

  test("then Temporary resolves — the Sprite token is killed and ceases to exist — but Tideturner keeps bf1 for P1, and since this all happened BEFORE scoring, P1 scores the hold: 2 → 3", async () => {
    const game = await atTemporaryTrigger();
    await flipTideturnerInResponse(game);
    await game.settle();
    expect(game.has("token-sprite")).toBe(false);
    expect(game.zoneOf("tide")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(3);
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — not reacting: the Sprite dies, bf1 (now empty) lapses, the unplayed hidden Tideturner is trashed, and P1 scores nothing", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.passPriority();
    await game.settle();
    expect(game.has("token-sprite")).toBe(false);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBe(null);
    expect(game.zoneOf("tide")).toBe("trash");
    expect(game.p1.points()).toBe(2);
    expect(game.phase()).toBe("main");
  });
});

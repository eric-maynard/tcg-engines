/**
 * Ruling c7d76a38908939f3 — Zilean, Time Mage (UNL-086 → unl-086-219) · 5 Might
 *     "Once each turn, if you would play a token unit while I'm at a battlefield, you may play that token and an additional copy
 *      of it instead."
 *   × Sprite Fountain (unl-078-219) · Gear · "When you play this, play a ready 3 [Might] Sprite unit token with [Temporary] to your base."
 *
 * Q: With multiple Zileans under my control, does each one trigger when I play a token unit?
 * A: Yes — a linear increase: two Zileans + one token played ⇒ three tokens. You choose the order the replacement effects apply
 *    (372); the first turns "play 1" into "play 2", the second may still apply to that replaced event ⇒ "play 3". Each Zilean
 *    applies once (370.2 bars the SAME ability re-applying, not a different Zilean).
 * Rules: 370.2, 371.2 (optional replacement — controller chooses), 372 (multiple replacements: affected player orders them), 375.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const ZILEAN = "unl-086-219";
const SPRITE_FOUNTAIN = "unl-078-219";

/** P1's turn; `n` Zileans standing at bf1 (P1's); Sprite Fountain in hand with 2 + [mind]. */
function board(n: 1 | 2) {
  const b = scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", ZILEAN, "zilA")
    .hand(P1, SPRITE_FOUNTAIN, "fountain");
  return n === 2 ? b.unit(P1, "bf1", ZILEAN, "zilB") : b;
}

const sprites = (game: Game) => game.p1.units("base").filter((id) => game.state(id).isToken && game.state(id).name === "Sprite");

/** Play the Fountain and accept every Zilean offer (yes to each yes/no; first option of any ordering pick). Returns #offers seen. */
async function playFountainAcceptingAll(game: Game): Promise<number> {
  let offers = 0;
  await game.p1.playGear("fountain");
  for (let i = 0; i < 8; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      offers += 1;
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(d.options[0]?.key ?? "");
    } else {
      break;
    }
  }
  return offers;
}

describe("Ruling c7d76a38908939f3 — each Zilean adds one more copy: two Zileans + one token ⇒ three tokens", () => {
  test("baseline, ONE Zilean at a battlefield: the 'you may' offer is surfaced to P1 (yes/no), and accepting plays 1 + 1 = 2 Sprites", async () => {
    const game = await board(1).build();
    await game.p1.playGear("fountain");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(sprites(game)).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });

  test("TWO Zileans: P1 is asked about EACH Zilean's optional replacement — two separate P1 decisions (371.2 / 372)", async () => {
    const game = await board(2).build();
    const offers = await playFountainAcceptingAll(game);
    expect(offers).toBe(2);
  });

  test("TWO Zileans, one accepted and one declined: 1 + 1 = two Sprites", async () => {
    const game = await board(2).build();
    await game.p1.playGear("fountain");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(sprites(game)).toHaveLength(2);
  });

  test("TWO Zileans, both accepted: 1 + 1 + 1 = THREE Sprites in P1's base, each a ready 3-Might [Temporary] Sprite (375)", async () => {
    const game = await board(2).build();
    await playFountainAcceptingAll(game);
    expect(sprites(game)).toHaveLength(3);
    for (const s of sprites(game)) {
      expect(game.state(s)).toMatchObject({ isReady: true, might: 3 });
      expect(game.state(s).keywords).toContain("Temporary");
    }
  });
});

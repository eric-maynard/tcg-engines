/**
 * Ruling 4ec47c8afe310207 — Ferrous Forerunner (SFD-021 → sfd-021-221) · 6 Might · "[Deathknell] — Play two 3 [Might]
 *   Mech unit tokens to your base."
 *   × Rek'Sai, Breacher (SFD-029 → sfd-029-221): "Friendly units played from anywhere other than a player's hand have [Accelerate]."
 *   (Rumble, Hotheaded sfd-026-221 is only cited as another Mech source.)
 *
 * Q: Forerunner dies while I have Rek'Sai — can I Accelerate the two Mech tokens, and for how much?
 * A: Yes. Tokens an effect tells you to play ARE played (not from hand), so Rek'Sai gives each [Accelerate]; you may pay
 *    [1] + 1 power (any domain) separately per token, and each one paid for enters ready (the others exhausted).
 * Rules: 187 / 419 (playing tokens follows the play steps), 803 (Accelerate: optional additional cost → enter ready).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FERROUS_FORERUNNER = "sfd-021-221";
const REKSAI_BREACHER = "sfd-029-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P2's turn. P1 holds bf1 with Ferrous Forerunner; Rek'Sai waits in P1's base. P1 has [2] + 2 fury — enough to
 * Accelerate both tokens. P2's 9-might Bruiser attacks and kills the Forerunner.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", FERROUS_FORERUNNER, "forerunner")
    .unit(P1, "base", REKSAI_BREACHER, "reksai")
    .unit(P2, "base", { might: 9, name: "Bruiser" }, "bruiser");
}

function mechs(game: Game): string[] {
  return game.findAll({ name: "Mech", owner: P1 }).filter((id) => game.zoneOf(id) !== "gone");
}

/** Bruiser attacks; combat kills the Forerunner; its Deathknell lands on the chain. */
async function killForerunner(game: Game): Promise<void> {
  await game.p2.move("bruiser", "bf1");
  for (let i = 0; i < 6 && game.chain().length === 0; i++) {
    await game.acting().pass();
  }
  expect(game.zoneOf("forerunner")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "forerunner", controller: P1, triggered: true })]);
}

describe("Ruling 4ec47c8afe310207 — Rek'Sai lets you Accelerate the Forerunner's Mech tokens, paying per token", () => {
  test("the Deathknell plays two 3-Might Mech tokens to P1's base (unpaid → they enter exhausted)", async () => {
    const game = await board().build();
    await killForerunner(game);
    // Resolve, declining any Accelerate offer that may appear.
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    const made = mechs(game);
    expect(made).toHaveLength(2);
    for (const m of made) {
      expect(game.locationOf(m)).toBe("base");
      expect(game.state(m)).toMatchObject({ isExhausted: true, isToken: true, might: 3 });
    }
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } });
  });

  // Expected: as each token is played (not from hand) Rek'Sai grants it [Accelerate], so P1 is asked — once per token —
  // whether to pay [1] + 1 power; paying for exactly one leaves that Mech ready, the other exhausted, and costs 1/1.
  // Actual: the tokens are created exhausted with no Accelerate opt-in ever offered.
  test.failing("BUG: ruling 4ec47c8afe310207 — engine offers no per-token Accelerate opt-in for effect-played tokens under Rek'Sai", async () => {
    const game = await board().build();
    await killForerunner(game);
    let offers = 0;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        offers += 1;
        expect(d.canAccept).not.toBe(false);
        await (offers === 1 ? game.p1.yes() : game.p1.no()); // pay for the first token only
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options[0]?.key as string); // e.g. which power domain to spend
      } else {
        break;
      }
    }
    await game.settle();
    expect(offers).toBe(2); // asked separately for each token
    const made = mechs(game);
    expect(made).toHaveLength(2);
    expect(made.filter((m) => game.state(m).isReady)).toHaveLength(1);
    expect(made.filter((m) => game.state(m).isExhausted)).toHaveLength(1);
    expect(game.p1.energy()).toBe(1); // 2 − 1
    expect(game.p1.power()).toBe(1); // 2 − 1 (any domain)
  });
});

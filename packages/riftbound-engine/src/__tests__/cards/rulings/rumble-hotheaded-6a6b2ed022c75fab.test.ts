/**
 * Ruling 6a6b2ed022c75fab — (filed under Rumble, Hotheaded SFD-026, cited only as a Mech reference)
 *   Ferrous Forerunner (SFD-021 → sfd-021-221) · 6 Might · "[Deathknell] — Play two 3 [Might] Mech unit tokens to your base."
 *   × Rek'Sai, Breacher (SFD-029 → sfd-029-221) · [3] · 3 Might · "[Accelerate] [Assault] Friendly units played from anywhere other than a
 *     player's hand have [Accelerate]."
 *
 * Q: The Mechs from a dying Forerunner are already in base; THEN Rek'Sai is played. Do the Mechs get Accelerate?
 * A: No. Rek'Sai's static applies as units are being played; Accelerate only changes how a unit ENTERS ("as you play me, you may pay …
 *    enter ready"). The tokens were played and resolved before Rek'Sai existed on the board — nothing is granted retroactively, no
 *    catch-up payment is offered, they stay exhausted.
 * Rules: 803 (Accelerate is an optional additional cost paid as the unit is played), 367/522 (statics apply prospectively), 187/419.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FERROUS_FORERUNNER = "sfd-021-221";
const REKSAI_BREACHER = "sfd-029-221";

/** P1's turn with [4] + fury (Rek'Sai + a spare [1][fury] that an Accelerate would cost). Forerunner ready in base; P2's 8-Might Wall holds bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Wall" }, "wall")
    .unit(P1, "base", FERROUS_FORERUNNER, "fore")
    .hand(P1, REKSAI_BREACHER, "reksai");
}

function mechs(game: Game): string[] {
  return game.p1.units().filter((id) => game.state(id).isToken);
}

/** Forerunner attacks the Wall and dies; its Deathknell resolves → two exhausted Mech tokens in P1's base. */
async function forerunnerDies(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("fore", "bf1");
  await game.settle();
  expect(game.zoneOf("fore")).toBe("trash");
  expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // took 6, healed in combat cleanup
  const made = mechs(game);
  expect(made).toHaveLength(2);
  for (const m of made) {
    expect(game.state(m)).toMatchObject({ isExhausted: true, location: "base", might: 3 });
  }
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 6a6b2ed022c75fab — Rek'Sai played AFTER the Forerunner's Mechs arrived grants them nothing", () => {
  test("premise: the two Mech tokens are already sitting exhausted in base (unaccelerated) before Rek'Sai is anywhere near the board", async () => {
    const game = await forerunnerDies();
    expect(game.zoneOf("reksai")).toBe("hand");
  });

  test("playing Rek'Sai now (declining her own Accelerate) offers NO Accelerate payment for the existing Mechs, charges nothing extra, and leaves both Mechs exhausted with no Accelerate keyword", async () => {
    const game = await forerunnerDies();
    const [m1, m2] = mechs(game) as [string, string];
    await game.p1.play("reksai", { accelerate: false });
    let tokenPrompts = 0;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no" && (d.source?.cardId === m1 || d.source?.cardId === m2 || /mech/i.test(d.prompt))) {
        tokenPrompts += 1;
        await game.seat(d.seat).no();
      } else if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.no(); // (Rek'Sai's own Accelerate, if asked this way)
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    await game.settle();
    expect(tokenPrompts).toBe(0);
    expect(game.zoneOf("reksai")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } }); // exactly Rek'Sai's [3]
    for (const m of [m1, m2]) {
      expect(game.state(m).isExhausted).toBe(true);
      expect(game.state(m).keywords).not.toContain("Accelerate");
      expect(game.state(m).grantedKeywords.some((k) => k.keyword === "Accelerate")).toBe(false);
    }
    expect(game.violations()).toEqual([]);
  });
});

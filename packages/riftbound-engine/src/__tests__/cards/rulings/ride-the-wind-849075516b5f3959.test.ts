/**
 * Ruling 849075516b5f3959 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · 2 + [chaos] · [Action]
 *     "Move a friendly unit and ready it."
 *   × Irelia, Fervent (SFD-057 → sfd-057-221) · 4 Might · "[Deflect] When you choose or ready me, give me +1 [Might] this turn."
 *
 * Q: Does Ride the Wind "choose" Irelia (so she gets +1 Might)?
 * A: Yes. Selecting her as the spell's target is choosing her → +1. If she was EXHAUSTED she is also readied
 *    on resolution → her ability triggers a second time, +2 total (6 Might). If she was already ready the
 *    ready part does nothing and she only gets +1 (5 Might).
 * Rules: 355.10.d (choosing = targeting at play time), 415.1.b/c (readying a ready permanent does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const IRELIA = "sfd-057-221";

type Pick = Extract<Decision, { kind: "pick" }>;

/** P1's turn. Irelia in P1's base (exhausted or not); bf1 is P1's (empty), bf2 P2's with a guard. 2 + [chaos]. */
function board(ireliaExhausted: boolean) {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", IRELIA, "irelia", ireliaExhausted ? { exhausted: true } : undefined)
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Cast Ride the Wind on Irelia → bf1 and drain the chain (her triggers included). */
async function rideIreliaToBf1(game: Game): Promise<void> {
  await game.p1.cast("rtw", { targets: "irelia" });
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && (d as Pick).options.some((o) => o.key === "battlefield-bf1")) {
    await game.p1.pick("battlefield-bf1");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("rtw")).toBe("trash");
}

describe("Ruling 849075516b5f3959 — Ride the Wind chooses Irelia (+1), and readying an exhausted Irelia triggers her again (+1)", () => {
  test("choosing Irelia as Ride the Wind's target puts her 'when you choose me' trigger on the chain right away (before resolution)", async () => {
    const game = await board(true).build();
    await game.p1.cast("rtw", { targets: "irelia" });
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && (d as Pick).options.some((o) => o.key === "battlefield-bf1")) {
      await game.p1.pick("battlefield-bf1");
    }
    const chain = game.chain();
    expect(chain[0]).toMatchObject({ cardId: "rtw", controller: P1, triggered: false });
    expect(chain.some((c) => c.cardId === "irelia" && c.triggered)).toBe(true);
    // Nothing has moved/readied yet.
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.state("irelia").isExhausted).toBe(true);
  });

  test("exhausted Irelia: chosen (+1) then readied on resolution (+1) → 6 Might this turn, ready, at bf1", async () => {
    const game = await board(true).build();
    expect(game.state("irelia")).toMatchObject({ isExhausted: true, might: 4 });
    await rideIreliaToBf1(game);
    expect(game.zoneOf("irelia")).toBe("battlefield-bf1");
    expect(game.state("irelia").isReady).toBe(true);
    expect(game.state("irelia").might).toBe(6);
    expect(game.violations()).toEqual([]);
  });

  test("already-ready Irelia: the ready instruction does nothing (no second trigger) → only +1, 5 Might", async () => {
    const game = await board(false).build();
    expect(game.state("irelia")).toMatchObject({ isReady: true, might: 4 });
    await rideIreliaToBf1(game);
    expect(game.zoneOf("irelia")).toBe("battlefield-bf1");
    expect(game.state("irelia").isReady).toBe(true);
    expect(game.state("irelia").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("the bonus is 'this turn': after the turn passes Irelia is back to 4", async () => {
    const game = await board(true).build();
    await rideIreliaToBf1(game);
    expect(game.state("irelia").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("irelia").might).toBe(4);
  });
});

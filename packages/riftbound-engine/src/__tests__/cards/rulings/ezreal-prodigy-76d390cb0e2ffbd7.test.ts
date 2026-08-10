/**
 * Ruling 76d390cb0e2ffbd7 — Ezreal, Prodigy (SFD-149 → sfd-149-221) · 3 Might
 *     "When you play me, discard 1, then draw 2. Optional additional costs you pay cost [1] or [rainbow] less."
 *   × Death from Below (UNL-186 → unl-186-219) · Action · [4]+[rainbow]
 *     "Kill a unit at a battlefield. Then, if it had 3 [Might] or less, you may play this from your trash for [rainbow]."
 *
 * Q: Does Ezreal, Prodigy reduce Death from Below's cost (its "[rainbow]" replay from the trash)?
 * A: No. Ezreal only reduces OPTIONAL ADDITIONAL costs — text with both "may" and "as an additional cost" (Accelerate, Repeat …).
 *    "You may play this from your trash for [rainbow]" is a recursive play permission, not an additional cost: pay it in full.
 * Rules: 356.2.b / 356.4.c (optional additional costs), 366.1 / 419.1.a (play permissions from other zones), 811 (Accelerate).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EZREAL_PRODIGY = "sfd-149-221";
const DEATH_FROM_BELOW = "unl-186-219";
const LEGION_REARGUARD = "ogn-010-298"; // [2], Accelerate [1][fury] — a genuine optional additional cost, for contrast

/** P1's turn, Ezreal in base (or not). P2's Small (3) + Tiny (2) at bf1. P1: Death from Below, [4]+1 rainbow for the cast + `spare`. */
function board(withEzreal: boolean, spare: { energy?: number; rainbow?: number }) {
  const s = scenario()
    .resources(P1, { energy: 4 + (spare.energy ?? 0), power: { rainbow: 1 + (spare.rainbow ?? 0) } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
    .unit(P2, "bf1", { might: 2, name: "Tiny" }, "tiny")
    .hand(P1, DEATH_FROM_BELOW, "dfb");
  return withEzreal ? s.unit(P1, "base", EZREAL_PRODIGY, "ezreal") : s;
}

/** Cast at Small; it dies (3 Might) so the replay offer appears. */
async function castAndReachOffer(game: Game): Promise<void> {
  await game.p1.cast("dfb", { targets: "small" });
  const s = await game.settle();
  expect(game.zoneOf("small")).toBe("trash");
  expect(s.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "dfb" } });
}

describe("Ruling 76d390cb0e2ffbd7 — Death from Below's [rainbow] replay is not an 'optional additional cost' for Ezreal, Prodigy", () => {
  test("Ezreal out, 1 spare energy and NO spare power: if Ezreal applied, '[rainbow] less' would make it free / '[1] less' irrelevant — but the offer is NOT acceptable; declining leaves the spell in the trash and the energy untouched", async () => {
    const game = await board(true, { energy: 1 }).build();
    await castAndReachOffer(game);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 0 } });
    expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no" });
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 0 } });
    expect(game.zoneOf("tiny")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Ezreal out, exactly 1 spare power: accepting takes the FULL [rainbow] (1 → 0) and Death from Below is played again from the trash onto the chain", async () => {
    const game = await board(true, { rainbow: 1 }).build();
    await castAndReachOffer(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no" });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("dfb")).toBe("chain");
    // It resolves as a normal cast: pick Tiny, which dies too.
    const s = await game.settle();
    if (s.reason === "unanswered" && game.decision()?.kind === "pick") {
      await game.p1.pick("tiny");
      await game.settle();
    }
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no(); // Tiny had ≤3 Might → offered again; nothing left to pay with anyway
      await game.settle();
    }
    expect(game.zoneOf("tiny")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control (no Ezreal): identical numbers — the replay costs exactly [rainbow]; Ezreal's presence made no difference", async () => {
    const game = await board(false, { rainbow: 1 }).build();
    await castAndReachOffer(game);
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("dfb")).toBe("chain");
  });

  test("contrast: Ezreal DOES cheapen a real optional additional cost — Legion Rearguard's Accelerate ([1][fury]) is payable with just [2]+[fury] (the [1] waived) only while Ezreal is out", async () => {
    const mk = (withEzreal: boolean) => {
      const s = scenario().resources(P1, { energy: 2, power: { fury: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, LEGION_REARGUARD, "lr");
      return (withEzreal ? s.unit(P1, "base", EZREAL_PRODIGY, "ezreal") : s).build();
    };
    const accelerated = (g: Game) => (g.p1.option("play", "lr")?.variants ?? []).some((v) => v.params.paidAdditionalCost === true);
    const withEz = await mk(true);
    expect(accelerated(withEz)).toBe(true);
    await withEz.p1.play("lr", { accelerate: true, to: "base" });
    await withEz.settle();
    expect(withEz.state("lr")).toMatchObject({ isReady: true, zone: "base" });
    const without = await mk(false);
    expect(accelerated(without)).toBe(false);
    expect((await without.p1.try((p) => p.play("lr", { accelerate: true, to: "base" }))).ok).toBe(false);
  });
});

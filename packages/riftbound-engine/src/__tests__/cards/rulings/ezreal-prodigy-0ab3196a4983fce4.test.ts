/**
 * Ruling 0ab3196a4983fce4 — Ezreal, Prodigy (SFD-149 → sfd-149-221) · Champion Unit · Chaos · 3+[chaos] · 3 Might
 *   "When you play me, discard 1, then draw 2. Optional additional costs you pay cost [1] or [rainbow] less."
 *   × Death from Below (UNL-186 → unl-186-219) · Spell · Fury/Chaos · 4+[rainbow] · "Kill a unit at a battlefield.
 *     Then, if it had 3 [Might] or less, you may play this from your trash for [rainbow]."
 *   × Blast Corps Cadet (SFD-013 → sfd-013-221) "You may pay [1][fury] as an additional cost to play me. …"
 *
 * Q: Does Ezreal, Prodigy discount Death from Below's "play this from your trash for [rainbow]"? Must I pay it?
 * A: No discount — that [rainbow] is the cost of a recursive play permission, not an "optional additional cost"
 *    (those say "may … as an additional cost", e.g. Accelerate/Repeat/Blast Corps Cadet). You must pay the full
 *    [rainbow] to replay it.
 * Rules: 356.2.b / 356.4 (optional additional costs), 356.3 (alternative costs), 366.1 / 419.1.a (play
 *        permissions from other zones).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EZREAL_PRODIGY = "sfd-149-221";
const DEATH_FROM_BELOW = "unl-186-219";
const BLAST_CORPS_CADET = "sfd-013-221";

/**
 * P1's turn with Ezreal, Prodigy in base. P2 holds bf1 with Small (3) and Tiny (2). P1 holds Death from Below
 * with 4 + [rainbow] for the cast plus the given spare resources for the replay.
 */
function board(spare: { energy?: number; rainbow?: number }) {
  return scenario()
    .resources(P1, { energy: 4 + (spare.energy ?? 0), power: { rainbow: 1 + (spare.rainbow ?? 0) } })
    .unit(P1, "base", EZREAL_PRODIGY, "ezreal")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
    .unit(P2, "bf1", { might: 2, name: "Tiny" }, "tiny")
    .hand(P1, DEATH_FROM_BELOW, "dfb");
}

/** Cast Death from Below at Small (3 Might) and resolve up to the "you may play this from your trash" offer. */
async function castAtSmall(game: Game): Promise<void> {
  await game.p1.cast("dfb", { targets: "small" });
  const s = await game.settle();
  expect(game.zoneOf("small")).toBe("trash"); // killed; it had 3 Might → the replay clause applies
  expect(s.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "dfb" } });
  expect(game.decision()?.prompt ?? "").toMatch(/rainbow/i); // the offer names its [rainbow] price
}

describe("Ruling 0ab3196a4983fce4 — Ezreal, Prodigy does not discount Death from Below's [rainbow] replay", () => {
  test("with Ezreal out and exactly 1 spare power: accepting the replay costs the FULL [rainbow] (1 → 0) and puts Death from Below back on the chain", async () => {
    const game = await board({ rainbow: 1 }).build();
    await castAtSmall(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } }); // 4 + [rainbow] paid for the cast
    expect(game.decision()).toMatchObject({ kind: "yes-no", canAccept: true });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // not reduced to [0] by Ezreal
    expect(game.zoneOf("dfb")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dfb", controller: P1 })]);
  });

  test("with Ezreal out, NO spare power but 1 spare energy: the replay cannot be paid — Ezreal's '[1] or [rainbow] less' does not apply — so it is not acceptable and the spell stays in the trash", async () => {
    const game = await board({ energy: 1 }).build();
    await castAtSmall(game);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 0 } });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, canAccept: false });
    const r = await game.p1.try((p) => p.yes());
    expect(r.ok).toBe(false);
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 0 } }); // nothing taken
    expect(game.zoneOf("tiny")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
  });

  test("control (no Ezreal): the very same offer with 1 spare power also costs exactly [rainbow] — Ezreal's presence changes nothing here", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
      .unit(P2, "bf1", { might: 2, name: "Tiny" }, "tiny")
      .hand(P1, DEATH_FROM_BELOW, "dfb")
      .build();
    await castAtSmall(game);
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("dfb")).toBe("chain");
  });

  test("contrast: Ezreal DOES discount a genuine optional additional cost — Blast Corps Cadet's 'may pay [1][fury]' becomes payable with only 2 energy + [fury]", async () => {
    const withEz = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .unit(P1, "base", EZREAL_PRODIGY, "ezreal")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Dummy" }, "dummy")
      .hand(P1, BLAST_CORPS_CADET, "cadet")
      .build();
    expect(withEz.p1.option("play", "cadet")?.fields.find((f) => f.arg === "payOptional")?.options).toContain(true);
    const without = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Dummy" }, "dummy")
      .hand(P1, BLAST_CORPS_CADET, "cadet")
      .build();
    expect(without.p1.option("play", "cadet")?.fields.find((f) => f.arg === "payOptional")?.options ?? [false]).not.toContain(true);
  });
});

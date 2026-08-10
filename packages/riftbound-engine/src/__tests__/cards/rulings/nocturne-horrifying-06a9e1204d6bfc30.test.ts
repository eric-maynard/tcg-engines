/**
 * Ruling 06a9e1204d6bfc30 — Nocturne, Horrifying (OGN-194 → ogn-194-298) · Champion Unit · Chaos · 4+[chaos] · 4 Might
 *   "[Ganking] As you look at or reveal me from the top of your deck, you may banish me. If you do, you may
 *    play me for [rainbow]."
 *   × Ezreal, Prodigy (SFD-149 → sfd-149-221) "…Optional additional costs you pay cost [1] or [rainbow] less."
 *   (Immortal Phoenix ogn-037-298 / Flame Chompers ogn-006-298 are cited only as other examples of
 *    alternative play costs that are likewise NOT optional additional costs.)
 *
 * Q: Is Nocturne's [rainbow] an optional additional cost that Ezreal, Prodigy would reduce?
 * A: No. Banish-on-look is one decision; playing from banishment is a second decision whose [rainbow] is the
 *    REGULAR cost of that play (an alternative cost), not an additional cost — Ezreal does not touch it. If
 *    you don't pay it, Nocturne simply stays in banishment (a public zone).
 * Rules: 356.2.b / 356.4 (optional ADDITIONAL costs: "may … as an additional cost", Accelerate/Repeat),
 *        356.3 (alternative costs), 369–370 ("as you look/reveal" replacement), 108.2 (banishment is public).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const EZREAL_PRODIGY = "sfd-149-221";
const MYSTIC_PORO = "ogn-171-298"; // 2-cost unit with [Vision] — "look at the top card of your Main Deck"
const BLAST_CORPS_CADET = "sfd-013-221"; // "You may pay [1][fury] as an additional cost to play me." (contrast)

/** P1's turn with Ezreal, Prodigy on the board, Mystic Poro in hand (2 energy for it) and Nocturne on top of the deck. */
function board(extra: { energy?: number; power?: Record<string, number> } = {}) {
  return scenario()
    .resources(P1, { energy: 2 + (extra.energy ?? 0), power: extra.power ?? {} })
    .unit(P1, "base", EZREAL_PRODIGY, "ezreal")
    .hand(P1, MYSTIC_PORO, "poro")
    .deckTop(P1, NOCTURNE, "noc");
}

/** Play the Poro; its Vision look hits Nocturne → the "you may banish me" offer; accept it. */
async function lookAndBanish(game: Game): Promise<void> {
  expect(game.p1.deck()[0]).toBe("noc");
  await game.p1.play("poro");
  await game.settle();
  // Decision 1: banish Nocturne as it is looked at.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "noc" } });
  await game.p1.yes();
  expect(game.zoneOf("noc")).toBe("banishment");
  await game.settle();
  // Decision 2 (separate) — play it from banishment for [rainbow]? — is asserted by each test.
}

async function finishPlayToBase(game: Game): Promise<void> {
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("base");
    await game.settle();
  }
}

describe("Ruling 06a9e1204d6bfc30 — Nocturne's [rainbow] from banishment is a regular (alternative) cost; Ezreal, Prodigy does not reduce it", () => {
  test("banish, then play: even with Ezreal out the play still costs the full [rainbow] — 1 power spent (1 → 0), no energy", async () => {
    const game = await board({ power: { rainbow: 1 } }).build();
    await lookAndBanish(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, canAccept: true }); // the separate "play me?" decision
    await game.p1.yes();
    await finishPlayToBase(game);
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.p1.units("base")).toContain("noc");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // the [rainbow] was paid in full
    expect(game.violations()).toEqual([]);
  });

  test("with Ezreal out but NO power (only spare energy), the [rainbow] cannot be met — it is not '[1] or [rainbow] less': Nocturne stays banished (public zone) and nothing is spent", async () => {
    const game = await board({ energy: 1 }).build(); // 3 energy: 2 for the Poro + 1 spare that Ezreal might have let stand in
    await lookAndBanish(game);
    const d = game.decision();
    // The unpayable play is either not offered at all or offered as not acceptable; a "yes" must not produce a play.
    if (d?.kind === "yes-no") {
      if (d.canAccept !== false) {
        const r = await game.p1.try((p) => p.yes());
        if (r.ok) {
          await finishPlayToBase(game);
        }
      } else {
        await game.p1.no();
        await game.settle();
      }
    }
    // Drain Vision's own "you may recycle" (nothing left to look at) if it is still asked.
    for (let i = 0; i < 3 && game.decision()?.kind !== "action"; i++) {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("noc")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["noc"]);
    expect(game.view(P2).zones.banishment?.some((c) => "id" in c && c.id === "noc")).toBe(true); // public: P2 sees it
    expect(game.p1.energy()).toBe(1); // spare energy untouched
    expect(game.p1.units()).not.toContain("noc");
  });

  test("declining the second decision is fine: banished but not played — Nocturne remains in banishment and the power is kept", async () => {
    const game = await board({ power: { rainbow: 1 } }).build();
    await lookAndBanish(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, canAccept: true });
    await game.p1.no();
    await game.settle();
    for (let i = 0; i < 3 && game.decision()?.kind !== "action"; i++) {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("noc")).toBe("banishment");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
  });

  test("contrast: Ezreal DOES discount a genuine optional additional cost — Blast Corps Cadet's 'may pay [1][fury]' is payable with just 2 energy + [fury]", async () => {
    const withEz = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .unit(P1, "base", EZREAL_PRODIGY, "ezreal")
      .hand(P1, BLAST_CORPS_CADET, "cadet")
      .build();
    expect(withEz.p1.option("play", "cadet")?.fields.find((f) => f.arg === "payOptional")?.options).toContain(true);
    const without = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).hand(P1, BLAST_CORPS_CADET, "cadet").build();
    expect(without.p1.option("play", "cadet")?.fields.find((f) => f.arg === "payOptional")?.options ?? [false]).not.toContain(true);
  });
});

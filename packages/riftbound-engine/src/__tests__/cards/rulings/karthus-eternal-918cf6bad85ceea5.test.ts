/**
 * Ruling 918cf6bad85ceea5 — Karthus, Eternal (OGN-236 → ogn-236-298) · Champion · Order · 3 Might
 *     "Your [Deathknell] effects trigger an additional time."   (passive)
 *   × Singularity (OGN-105 → ogn-105-298) · 6+[mind][mind] "Deal 6 to each of up to two units."
 *   × Viktor, Leader (OGN-246 → ogn-246-298) "When another non-Recruit unit you control dies, play a 1 [Might] Recruit …" (triggered — contrast)
 *   Deathknell witness: Watchful Sentry (ogn-096-298) · 1 Might · "[Deathknell] — Draw 1."
 *
 * Q: If Karthus and another (Deathknell) unit are both hit by Singularity, does the extra Deathknell still trigger?
 * A: Yes. Karthus's ability is passive and is still applying at the moment both die simultaneously, so the other unit's
 *    Deathknell triggers twice. A TRIGGERED "when another unit dies" (Viktor, Leader) dying at the same time does not fire.
 * Rules: 808.1.d.2 (Deathknell), 365 / 370.1.a.2 (passives apply while on board; leave-play look-back), 323.4–5 (cleanup kills are simultaneous).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KARTHUS = "ogn-236-298";
const VIKTOR = "ogn-246-298";
const SINGULARITY = "ogn-105-298";
const WATCHFUL_SENTRY = "ogn-096-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P2's turn with exactly 6+[mind][mind]. P1's base: Watchful Sentry (1) + `partner`. */
function board(partner: string | { might: number; name: string }) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 6, power: { mind: 2 } })
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
    .unit(P1, "base", partner, "partner")
    .hand(P2, SINGULARITY, "sing");
}

async function singularityBoth(game: Game): Promise<void> {
  await game.p2.cast("sing", { targets: ["partner", "sentry"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sing", controller: P2 })]);
  expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual(["partner", "sentry"]);
  expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("sing")).toBe("trash");
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1, zone: "base" });

describe("Ruling 918cf6bad85ceea5 — Singularity killing Karthus and a Deathknell unit together still doubles that Deathknell", () => {
  test("Singularity deals 6 to Karthus (3) and Watchful Sentry (1): both die in the same cleanup, and the Sentry's Deathknell triggers TWICE — P1 draws 2", async () => {
    const game = await board(KARTHUS).build();
    const hand = game.p1.hand().length;
    const deck = game.p1.deck().length;
    await singularityBoth(game);
    expect(game.zoneOf("partner")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 2);
    expect(game.p1.deck()).toHaveLength(deck - 2);
    expect(game.violations()).toEqual([]);
  });

  test("reference: without Karthus (a vanilla 3-Might partner) the same Singularity gives ONE Deathknell — P1 draws 1", async () => {
    const game = await board({ might: 3, name: "Vanilla" }).build();
    const hand = game.p1.hand().length;
    await singularityBoth(game);
    expect(game.zoneOf("partner")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });

  test("contrast — Viktor, Leader (TRIGGERED) dying to the same Singularity as the Sentry does not trigger: no Recruit token; the Sentry's single Deathknell draws 1", async () => {
    const game = await board(VIKTOR).build();
    const hand = game.p1.hand().length;
    await singularityBoth(game);
    expect(game.zoneOf("partner")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(recruits(game)).toEqual([]);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });
});

/**
 * Ruling ddc388afc10e0237 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · [Hidden] "If a friendly unit would die, kill this
 *     instead. Heal that unit, exhaust it, and recall it."
 *   × Block (ogn-057-298) · [Hidden][Action] "Give a unit [Shield 3] and [Tank] this turn." — an ordinary targeting hidden card
 *
 * Q: Do hidden cards at a battlefield only interact with units at that battlefield, or can they target anywhere?
 * A: Once hidden at a battlefield, a card can only TARGET things at that battlefield. Zhonya's is the (rules-as-written) exception:
 *    it targets nothing, so even played from hidden it protects friendly units everywhere.
 * Rules: 811.1.d.2 (a card played from facedown may only choose targets at that battlefield), 811.2 (non-targeting parts unaffected),
 *        366–372 (a replacement effect does not target).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const BLOCK = "ogn-057-298";

/**
 * Turn 3, P2's turn. P1 holds bf1 (Sentinel 4 + the facedown card under test, hidden on an earlier turn) and bf2 (Pawn 2).
 * P2's Raider (5) attacks bf2, where the Pawn would die.
 */
function board(hiddenAtBf1: string) {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Sentinel" }, "sentinel")
    .facedown(P1, "bf1", hiddenAtBf1, "hid")
    .unit(P1, "bf2", { might: 2, name: "Pawn" }, "pawn")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

/** Raider attacks bf2; P2 passes Focus so P1 (defender) may act in the showdown. */
async function raidBf2(hiddenAtBf1: string): Promise<Game> {
  const game = await board(hiddenAtBf1).build();
  await game.p2.move("raider", "bf2");
  expect(game.state("pawn").combatRole).toBe("defender");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "hid")).toBe(true);
  return game;
}

describe("Ruling ddc388afc10e0237 — hidden cards target only 'here'; Zhonya's (no targets) still protects globally", () => {
  test("a TARGETING hidden card (Block hidden at bf1) flipped during the fight at bf2 may only choose a unit AT bf1 — the Sentinel — never the Pawn or Raider at bf2", async () => {
    const game = await raidBf2(BLOCK);
    await game.p1.reveal("hid");
    const d = game.decision();
    // Either a pick restricted to bf1's units, or (single legal object) auto-bound to the Sentinel.
    if (d?.kind === "pick" && d.source?.cardId === "hid") {
      expect(d.seat).toBe(P1);
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["sentinel"]);
      await game.p1.pick("sentinel");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hid", controller: P1, targets: ["sentinel"] })]);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("sentinel").grantedKeywords.map((k) => k.keyword).sort()).toEqual(["Shield", "Tank"]);
    expect(game.state("pawn").grantedKeywords).toEqual([]);
    // …so the Pawn is not helped and dies to the Raider.
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
  });

  test("Zhonya's hidden at bf1, flipped during the fight at bf2: no target is asked at all — it just becomes gear in P1's base", async () => {
    const game = await raidBf2(ZHONYAS);
    expect(game.p1.option("reveal", "hid")?.fields.some((f) => f.name === "targets") ?? false).toBe(false);
    await game.p1.reveal("hid");
    expect(game.decision()?.kind).not.toBe("pick");
    for (let i = 0; i < 6 && game.zoneOf("hid") !== "base"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("hid")).toBe("base");
    expect(game.p1.gear()).toContain("hid");
  });

  test("…and (rules-as-written) it then saves the Pawn dying at bf2, a DIFFERENT battlefield: Zhonya's killed instead, Pawn healed/exhausted/recalled", async () => {
    const game = await raidBf2(ZHONYAS);
    await game.p1.reveal("hid");
    await game.settle();
    expect(game.zoneOf("hid")).toBe("trash");
    expect(game.state("pawn")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("raider")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});

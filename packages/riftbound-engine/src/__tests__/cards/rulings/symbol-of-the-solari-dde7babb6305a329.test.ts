/**
 * Ruling dde7babb6305a329 — Symbol of the Solari (OGN-227 → ogn-227-298) · Gear · Order · 1
 *     "If a combat where you are the attacker ends in a tie, recall ALL units instead."
 *   × Galio, Indefatigable (UNL-171 → unl-171-219) · 6 Might · [Deflect] [Tank] "I don't deal combat damage."
 *
 * Q: I attack an occupied battlefield with Galio (more Might than the defender) with Symbol of the Solari out — is it a
 *    tie, and are all units recalled?
 * A: Yes. Galio contributes 0 combat damage, so the defender survives; Galio survives too → both sides have units left
 *    after combat damage = a tie. Symbol of the Solari then recalls ALL units at that battlefield (both sides) to base
 *    instead of just the attackers. Same with an extra attacker whose damage doesn't finish the defender.
 * Rules: 460.2.a (attacker sums Might → damage), 465/466 (tie = both sides remain; attackers recalled), 450 (recall
 *        is not a move), Symbol's "instead" replacement of the tie outcome.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SYMBOL = "ogn-227-298";
const GALIO = "unl-171-219";

const hitsOn = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>, id: string) =>
  (game.gameState.damageLog ?? []).filter((r) => r.target === id).map((r) => r.amount);

describe("Ruling dde7babb6305a329 — Galio attacks can only tie; Symbol of the Solari turns that tie into 'recall everyone'", () => {
  test("baseline (no Symbol): Galio (6) alone into a 3-Might defender — Galio deals 0, takes 3 and lives → tie → only the ATTACKER is recalled; defender keeps bf1", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", GALIO, "galio")
      .unit(P2, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
      .build();
    await game.p1.move("galio", "bf1");
    expect(game.state("galio").combatRole).toBe("attacker");
    expect(game.state("galio").might).toBeGreaterThan(game.state("sentinel").might);
    await game.settle();
    expect(hitsOn(game, "sentinel").reduce((a, b) => a + b, 0)).toBe(0); // "I don't deal combat damage"
    expect(game.state("galio")).toMatchObject({ damage: 0, zone: "base" }); // survived 3 < 6, recalled, healed
    expect(game.state("sentinel")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("with Symbol of the Solari: the same Galio-alone attack ties and ALL units — Galio AND the defender — are recalled to their bases; nobody scores", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .gear(P1, SYMBOL, "symbol")
      .unit(P1, "base", GALIO, "galio")
      .unit(P2, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
      .build();
    await game.p1.move("galio", "bf1");
    await game.settle();
    expect(hitsOn(game, "sentinel").reduce((a, b) => a + b, 0)).toBe(0);
    expect(game.state("galio")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("sentinel")).toMatchObject({ damage: 0, zone: "base" }); // recalled too — "ALL units"
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1); // no conquer
    expect(game.violations()).toEqual([]);
  });

  test("with Symbol and a second attacker: Buddy (2) + Galio into a 5-Might defender — 2 damage doesn't kill it, its 5 (Tank: onto Galio first) doesn't kill Galio → tie → all three units recalled", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .gear(P1, SYMBOL, "symbol")
      .unit(P1, "base", GALIO, "galio")
      .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
      .unit(P2, "bf1", { might: 5, name: "Bulwark" }, "bulwark")
      .build();
    await game.p1.move(["galio", "buddy"], "bf1");
    expect(game.state("galio").combatRole).toBe("attacker");
    expect(game.state("buddy").combatRole).toBe("attacker");
    expect(game.state("bulwark").combatRole).toBe("defender");
    await game.settle();
    expect(hitsOn(game, "bulwark").reduce((a, b) => a + b, 0)).toBe(2); // only Buddy's Might
    expect(game.zoneOf("galio")).toBe("base");
    expect(game.zoneOf("buddy")).toBe("base");
    expect(game.zoneOf("bulwark")).toBe("base");
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Symbol only replaces TIES: if the second attacker's damage kills the defender, P1 simply wins and conquers (nothing recalled)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .gear(P1, SYMBOL, "symbol")
      .unit(P1, "base", GALIO, "galio")
      .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
      .unit(P2, "bf1", { might: 3, name: "Sentinel" }, "sentinel")
      .build();
    await game.p1.move(["galio", "striker"], "bf1");
    await game.settle();
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.zoneOf("galio")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});

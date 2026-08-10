/**
 * Ruling 4094b75788b988d2 — Bounty Hunter (OGN-267 → ogn-267-298) · Legend (Miss Fortune)
 *     "[Exhaust]: Give a unit [Ganking] this turn."
 *   × Miss Fortune, Buccaneer (ogn-193-298) · Champion Unit · [4][chaos] · 4 Might
 *     "You may play me to an open battlefield. Friendly units may be played to open battlefields."
 *
 * Q: Can the legend be exhausted as an action at no cost? Is the champion's "friendly units may be played to open
 *    battlefields" passive always active while she is face up?
 * A: The legend's ability costs only its [Exhaust] (no energy/power) — but it is base speed: your turn, open state only.
 *    The champion's passive works while she is on the BOARD (base or any battlefield), NOT while she waits in the
 *    Champion Zone (not in play there).
 * Rules: 377/381 + 313.1.a (untagged activated ability: Neutral Open on your turn), 403.1.a ([Exhaust] cost), 107/113
 *        (Champion Zone is not the board; abilities of cards there are not active), 170.11.c ("open" battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BOUNTY_HUNTER = "ogn-267-298";
const MF_BUCCANEER = "ogn-193-298";
const SKULKER = "ogn-175-298"; // vanilla [3] unit — the "friendly unit" being played

const playDestinations = (game: Game, card: string) =>
  [...((game.p1.option("play", card)?.fields.find((f) => f.arg === "to")?.options as string[]) ?? [])].sort();

/** P1: MF legend, empty pool, Ally (3) on P1's bf1; P2 holds bf2 with a Foe (2). */
function legendBoard() {
  return scenario()
    .legend(P1, BOUNTY_HUNTER, "mfLegend")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .autoProcedures(false);
}

/** P1's turn with [3] and a Skulker in hand; an OPEN battlefield, P1's own bf (held) and P2's bf. */
function championBoard() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("open", { controller: null })
    .battlefield("mine", { controller: P1 })
    .battlefield("theirs", { controller: P2 })
    .unit(P1, "mine", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "theirs", { might: 1, name: "Their Holder" }, "theirHolder")
    .hand(P1, SKULKER, "sk");
}

describe("Ruling 4094b75788b988d2 — the legend: free apart from [Exhaust], but only in an open state on your turn", () => {
  test("with an EMPTY pool on P1's turn (open state) the ability is offered; activating exhausts the legend, costs nothing else, and grants Ganking on resolution", async () => {
    const game = await legendBoard().build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.can("activate", "mfLegend")).toBe(true);
    await game.p1.activate("mfLegend", undefined, { targets: "ally" });
    expect(game.state("mfLegend").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("ally").keywords).toContain("Ganking");
  });

  test("NOT during a showdown (even P1's own attack, holding Focus)", async () => {
    const game = await legendBoard().unit(P1, "base", { might: 3, name: "Raider" }, "raider").build();
    await game.p1.move("raider", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "mfLegend")).toBe(false);
    expect((await game.p1.try((p) => p.activate("mfLegend", undefined, { targets: "ally" }))).ok).toBe(false);
    expect(game.state("mfLegend").isReady).toBe(true);
  });

  test("NOT on the opponent's turn", async () => {
    const game = await legendBoard().active(P2).build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("activate", "mfLegend")).toBe(false);
    expect((await game.p1.try((p) => p.activate("mfLegend", undefined, { targets: "ally" }))).ok).toBe(false);
  });
});

describe("Ruling 4094b75788b988d2 — the champion's passive: on while she is on the board, off in the Champion Zone", () => {
  test("Miss Fortune still in the CHAMPION ZONE: a friendly unit may only be played to base / P1's battlefield — the open battlefield is NOT offered", async () => {
    const game = await championBoard().champion(P1, MF_BUCCANEER, "mf").build();
    expect(game.zoneOf("mf")).toBe("championZone");
    expect(playDestinations(game, "sk")).toEqual(["base", "battlefield-mine"]);
    expect((await game.p1.try((p) => p.play("sk", { to: "open" }))).ok).toBe(false);
    expect(game.zoneOf("sk")).toBe("hand");
  });

  test("Miss Fortune in BASE: the open battlefield becomes a legal destination and the Skulker can be played there", async () => {
    const game = await championBoard().unit(P1, "base", MF_BUCCANEER, "mf").build();
    expect(playDestinations(game, "sk")).toEqual(["base", "battlefield-mine", "battlefield-open"]);
    await game.p1.play("sk", { to: "open" });
    await game.settle();
    expect(game.locationOf("sk")).toBe("open");
    expect(game.violations()).toEqual([]);
  });

  test("Miss Fortune at a BATTLEFIELD (any — here P1's own 'mine'): the passive is just as active", async () => {
    const game = await championBoard().unit(P1, "mine", MF_BUCCANEER, "mf").build();
    expect(playDestinations(game, "sk")).toEqual(["base", "battlefield-mine", "battlefield-open"]);
  });

  test("nuance — 'open' = no units and no controller: the enemy-held battlefield is never offered, with or without her", async () => {
    const withMf = await championBoard().unit(P1, "base", MF_BUCCANEER, "mf").build();
    expect(playDestinations(withMf, "sk")).not.toContain("battlefield-theirs");
  });
});

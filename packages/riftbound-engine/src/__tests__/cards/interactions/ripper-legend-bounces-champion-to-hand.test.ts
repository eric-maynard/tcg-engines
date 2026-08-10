/**
 * Interaction: Bloodharbor Ripper (unl-185-219) × Sett, Brawler (ogn-164-298)
 *
 *   Bloodharbor Ripper — Legend (Pyke) · Fury/Chaos
 *     "[1], [Exhaust]: Return a friendly unit at a battlefield to its owner's hand. Play a Gold gear
 *      token exhausted."
 *   Sett, Brawler — Champion Unit · Body · 5 + [body] · 4 Might
 *     "When I'm played and when I conquer, buff me. (If I don't have a buff, I get a +1 [Might] buff.)
 *      Spend my buff: Give me +4 [Might] this turn."
 *
 * Rules: 108.3.c / 108.3.d (the Chosen Champion cannot be returned to the Champion Zone by normal
 * means; it is played from there as normal), 174.4 / 174.8 / 175 (a legend is not a permanent, is not
 * a unit, is never on the board), 355.9.a.1 / 355.10.b (a unit at a battlefield is public → it is a
 * TARGET chosen on activation), 381 / 310.1.a / 313.1.a (activated abilities: controller's turn, Open
 * state only), 403.1.a / 404.1 (cost before the ":" is paid at finalization), 705 + 124 / 748 (a unit
 * leaving play loses its buffs — it is a new object in the hand).
 *
 * Question: P1's Chosen Champion Sett was played from the Champion Zone last turn and sits at bf1
 * (P1 controls it) with 1 buff = 5 Might; P1 also has a vanilla unit in base; P2 has a unit at bf2.
 *   (a) What does the Ripper ability offer? (b) Activate on Sett: costs, P2's window, and where does
 *   Sett land — hand or the empty Champion Zone? Buff? Gold token? (c) Replaying Sett from hand next
 *   turn: cost, Might after "When I'm played" — 5 or 6? Any play-from-Champion-Zone action after the
 *   bounce? (d) Is the ability offered in a showdown where P1 has Focus, or on P2's turn?
 *
 * Expected: (a) Sett only. (b) [1] + exhaust paid up front; P2 gets priority; Sett → P1's HAND
 * (never the Champion Zone), unbuffed 4 Might; an exhausted Gold gear token in P1's base. (c) 5 +
 * [body] from hand; exactly one buff → 5 Might; `playChampion` is never offered. (d) No and no.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIPPER = "unl-185-219";
const SETT_BRAWLER = "ogn-164-298";

const golds = (game: Game, seat: "p1" | "p2" = "p1") =>
  game[seat].gear().filter((g) => game.state(g).name === "Gold" && game.state(g).isToken);

/** The candidate set the Ripper ability lists for its "friendly unit at a battlefield". */
function targetsOffered(game: Game): string[] {
  const field = game.p1.option("activate", "rip")?.fields.find((f) => f.name === "targets" || f.arg === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/**
 * P1's turn (turn 3, main, Open). P1: legend Bloodharbor Ripper (ready), 1 energy, empty Champion Zone,
 * Sett, Brawler BUFFED (5 Might) at bf1 which P1 controls, vanilla Home (2) in base, six body runes for
 * the replay later. P2: vanilla Foe (3) at bf2 which P2 controls.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P1)
    .resources(P1, { energy: 1 })
    .legend(P1, RIPPER, "rip")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SETT_BRAWLER, "sett", { buffed: true })
    .unit(P1, "base", { might: 2, name: "Home" }, "home")
    .unit(P2, "bf2", { might: 3, name: "Foe" }, "foe")
    .runes(P1, "body", 6);
}

async function bounced(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("rip", undefined, { targets: "sett" });
  await game.settle();
  return game;
}

describe("(a) candidates — only FRIENDLY UNITS AT A BATTLEFIELD", () => {
  test("precondition: Sett is P1's buffed champion at bf1 (5 Might), Champion Zone empty, legend ready", async () => {
    const game = await board().build();
    expect(game.state("sett")).toMatchObject({ baseMight: 4, controller: P1, isBuffed: true, might: 5, zone: "battlefield-bf1" });
    expect(game.p1.champion()).toBeUndefined();
    expect(game.state("rip")).toMatchObject({ isReady: true, zone: "legendZone" });
    expect(game.p1.can("activate", "rip")).toBe(true);
  });

  test("Sett (bf1) is offered; Home (base), the legend itself (175/174.4) and P2's Foe ('friendly') are not", async () => {
    const game = await board().build();
    const offered = targetsOffered(game);
    expect(offered).toEqual(["sett"]);
    expect(offered).not.toContain("home");
    expect(offered).not.toContain("rip");
    expect(offered).not.toContain("foe");
  });

  test("naming a non-candidate is rejected and nothing is paid", async () => {
    const game = await board().build();
    for (const bad of ["home", "rip", "foe"]) {
      expect((await game.p1.try((p) => p.activate("rip", undefined, { targets: bad }))).ok).toBe(false);
    }
    expect(game.p1.energy()).toBe(1);
    expect(game.state("rip").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
  });
});

describe("(b) activation on Sett — costs at finalization, P2 may respond, Sett goes to the OWNER'S HAND", () => {
  test("[1] and the legend's exhaust are paid immediately (403.1.a/404.1); the ability sits on the chain targeting Sett", async () => {
    const game = await board().build();
    await game.p1.activate("rip", undefined, { targets: "sett" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("rip").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rip", controller: P1, targets: ["sett"], triggered: false })]);
    expect(game.zoneOf("sett")).toBe("battlefield-bf1");
  });

  test("P2 gets priority before it resolves (may react); Sett is still on bf1 meanwhile", async () => {
    const game = await board().build();
    await game.p1.activate("rip", undefined, { targets: "sett" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("sett")).toBe("battlefield-bf1");
    expect(golds(game)).toEqual([]);
  });

  test("on resolution Sett is in P1's HAND — not the (empty) Champion Zone (108.3.c), not base/trash", async () => {
    const game = await bounced();
    expect(game.zoneOf("sett")).toBe("hand");
    expect(game.p1.hand()).toContain("sett");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.p2.hand()).not.toContain("sett");
    expect(game.chain()).toEqual([]);
  });

  test("leaving the board strips the buff (705, 124/748): in hand Sett is unbuffed, printed 4 Might", async () => {
    const game = await bounced();
    expect(game.state("sett")).toMatchObject({ baseMight: 4, damage: 0, isBuffed: false, might: 4, zone: "hand" });
  });

  test("then a Gold gear TOKEN is played to P1's base, EXHAUSTED; P2 gets nothing", async () => {
    const game = await bounced();
    const gold = golds(game);
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, owner: P1, zone: "base" });
    expect(golds(game, "p2")).toEqual([]);
  });

  test("aftermath: bf1 is now empty so P1 no longer controls it; Home/Foe untouched; back to P1's open main phase", async () => {
    const game = await bounced();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.zoneOf("home")).toBe("base");
    expect(game.zoneOf("foe")).toBe("battlefield-bf2");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("no 'play from Champion Zone' action exists after the bounce — Sett is a hand card (108.3.d applies only to the zone)", async () => {
    const game = await bounced();
    expect(game.p1.can("playChampion")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "playChampion" || o.moveId === "playFromChampionZone")).toBe(false);
  });
});

describe("(c) next turn: Sett replayed FROM HAND for 5 + [body] → one fresh buff = 5 Might, never 6", () => {
  async function replayTurn(): Promise<Game> {
    const game = await bounced();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1, turn 5
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    return game;
  }

  test("at the start of P1's next turn Sett is still in hand, unbuffed; playChampion is still not offered", async () => {
    const game = await replayTurn();
    expect(game.zoneOf("sett")).toBe("hand");
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4 });
    expect(game.p1.champion()).toBeUndefined();
    expect(game.p1.can("playChampion")).toBe(false);
  });

  test("cost: with only 5 energy and no [body] power the hand play is illegal; 5 energy + 1 body makes it legal", async () => {
    const game = await replayTurn();
    await game.p1.tapRunes(5);
    expect(game.p1.resources()).toMatchObject({ energy: 5 });
    expect(game.p1.power("body")).toBe(0);
    expect(game.p1.can("play", "sett")).toBe(false);
    await game.p1.recycleRune(undefined, "body");
    expect(game.p1.power("body")).toBe(1);
    expect(game.p1.can("play", "sett")).toBe(true);
  });

  test("play from hand: pays exactly 5 + [body]; enters as a NEW object with 0 buffs (4 Might) with 'When I'm played' pending", async () => {
    const game = await replayTurn();
    await game.p1.tapRunes(5);
    await game.p1.recycleRune(undefined, "body");
    await game.p1.play("sett", { to: "base" });
    expect(game.p1.resources()).toMatchObject({ energy: 0 });
    expect(game.p1.power("body")).toBe(0);
    expect(game.zoneOf("sett")).toBe("base");
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sett", controller: P1, triggered: true })]);
  });

  test("after the trigger resolves: exactly ONE buff → 5 Might (not 6 — nothing survived to stack on)", async () => {
    const game = await replayTurn();
    await game.p1.tapRunes(5);
    await game.p1.recycleRune(undefined, "body");
    await game.p1.play("sett", { to: "base" });
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.state("sett")).toMatchObject({ baseMight: 4, isBuffed: true, might: 5, zone: "base" });
    expect(game.state("sett").might).not.toBe(6);
    expect(game.p1.can("playChampion")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) NO side — the Ripper ability has no Action/Reaction tag: own turn + Open state only (381, 310.1.a, 313.1.a)", () => {
  test("during a combat showdown where P1 holds Focus and priority: not offered, activation rejected", async () => {
    const game = await board().build();
    await game.p1.move("home", "bf2"); // 2 into Foe's bf2 → combat showdown, attacker P1 has Focus
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "rip")).toBe(false);
    expect((await game.p1.try((p) => p.activate("rip", undefined, { targets: "sett" }))).ok).toBe(false);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("rip").isReady).toBe(true);
  });

  test("on P2's turn (P1 has energy, ready legend, Sett at bf1): not offered", async () => {
    const game = await board().active(P2).build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("activate", "rip")).toBe(false);
    expect(targetsOffered(game)).toEqual([]);
    expect((await game.p1.try((p) => p.activate("rip", undefined, { targets: "sett" }))).ok).toBe(false);
    expect(game.zoneOf("sett")).toBe("battlefield-bf1");
  });

  test("control: back in P1's Neutral Open main phase the very same position offers it", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "rip")).toBe(true);
  });
});

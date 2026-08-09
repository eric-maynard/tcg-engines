/**
 * Voidreaver — unl-201-219 · Legend (Kha'Zix) · Body/Chaos
 *
 *   When you win a combat, gain 1 XP.
 *   Spend 1 XP, [Exhaust]: [Buff] a unit.
 *   Spend 2 XP, [Exhaust]: Move an exhausted friendly unit from a battlefield to its base.
 *
 * Rules: 466.3.a (a PLAYER wins a combat when they held the attacker/defender designation and are the
 * only player with units left there in the result step — one win per combat, however many units
 * survive), 466.3.d (attackers recalled because defenders survived, or a mutual wipe = No Result: nobody
 * won), 469.1 (walking onto an empty battlefield is a Conquer but no combat happened), 730.1/730.2
 * (Gain/Spend XP act on the controller's persistent XP total; Spend is a COST → paid on activation,
 * 202–203), 377.3 (activated abilities use the chain; the opponent gets priority), 343.1.b / 313.1.a
 * (no [Action]/[Reaction] tag → only in your Main Phase, Neutral Open, never inside a showdown), the
 * shared [Exhaust] cost (a legend exhausted by one ability cannot pay for the other until it readies),
 * 702 (Buff = a +1 Might buff counter, max one per unit — 702.3.a; "a unit" = ANY unit, either side),
 * 355 (ability #3's object must be EXHAUSTED + FRIENDLY + AT A BATTLEFIELD; with no such unit the
 * ability cannot be activated), 420/446 (the move is an effect move, not a Standard Move: it needs no
 * ready unit and does not ready it), 190.4.c (leaving a battlefield empty in an Open state loses
 * control of it at the next cleanup — the point already scored stays).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. "When YOU win": exactly +1 XP per combat won — two surviving attackers must not pay twice; winning
 *     as the DEFENDER on the opponent's turn counts; No Result / mutual wipe / empty conquer give 0; the
 *     opponent winning gives THEM nothing from my legend.
 *  2. Costs are XP + Exhaust, both mandatory: 0 XP → neither ability; 1 XP → only the Buff; exhausted
 *     legend → neither even at 9 XP; XP leaves on activation, effect lands on resolution after P2's window.
 *  3. Buff targets ANY unit (enemy too); buffing an already-buffed unit still costs 1 XP + Exhaust and
 *     changes nothing.
 *  4. Rescue targets only an EXHAUSTED FRIENDLY unit AT A BATTLEFIELD: a ready unit there, an exhausted
 *     unit in base, an exhausted ENEMY unit there — none qualify; with no qualifier the ability is absent.
 *  5. The natural loop in one turn: attack at 1 XP → win (+1 → 2 XP, attacker now exhausted on the
 *     conquered battlefield) → Spend 2 + Exhaust → the attacker is home (still exhausted), the point
 *     stays, and the emptied battlefield is no longer P1's after the cleanup.
 *  6. Timing: neither ability is offered while P1 holds Focus in a showdown or on P2's turn.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-201-219";

function attackWith(attackers: readonly (readonly [number, string])[], defenderMight: number, xp = 0, defenderMeta?: { stunned?: boolean }) {
  let b = scenario().xp(P1, xp).legend(P1, CARD, "vr").battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: defenderMight, name: "Guard" }, "guard", defenderMeta);
  for (const [might, alias] of attackers) {
    b = b.unit(P1, "base", { might, name: alias }, alias);
  }
  return b;
}

describe("Voidreaver (unl-201-219)", () => {
  test("registry payload: Body/Chaos Kha'Zix legend — [0] controller win-combat → gain 1 XP; [1] {xp 1 + exhaust}: buff a unit; [2] {xp 2 + exhaust}: move an exhausted friendly unit battlefield → base", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Kha'Zix", domain: ["body", "chaos"], name: "Voidreaver" });
    expect(def?.abilities).toEqual([
      { effect: { amount: 1, type: "gain-xp" }, trigger: { event: "win-combat", on: "controller" }, type: "triggered" },
      { cost: { exhaust: true, xp: 1 }, effect: { target: { type: "unit" }, type: "buff" }, type: "activated" },
      {
        cost: { exhaust: true, xp: 2 },
        effect: { from: "battlefield", target: { controller: "friendly", filter: "exhausted", location: "battlefield", type: "unit" }, to: "base", type: "move" },
        type: "activated",
      },
    ]);
  });

  test("win as the lone attacker (3 into 2): Guard dies, P1 conquers for a point AND gains exactly 1 XP; P2 gains nothing", async () => {
    const game = await attackWith([[3, "hunter"]], 2).build();
    await game.p1.move("hunter", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("'when YOU win a combat' is one event per combat (466.3.a) — two attackers both survive a win → still exactly +1 XP, not +1 per surviving unit", async () => {
    // Expected: 0 → 1 XP. Actual: the engine fires the controller trigger once per surviving unit → 2 XP.
    const game = await attackWith([[3, "a"], [3, "b"]], 2).build();
    await game.p1.move(["a", "b"], "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
  });

  test("winning as the DEFENDER on the opponent's turn counts: a 2-Might raider dies against my 4 → +1 XP for me, none for P2", async () => {
    const game = await scenario().active(P2).legend(P1, CARD, "vr").battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 4, name: "Warden" }, "warden").unit(P2, "base", { might: 2, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("warden")).toBe("bf1");
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
  });

  test("negative space — not a win: No Result (stunned 5-Might wall, both survive, attacker recalled), a mutual wipe (3 v 3), a LOSS (3 into 4), and conquering an EMPTY battlefield all give 0 XP", async () => {
    const noResult = await attackWith([[3, "hunter"]], 5, 0, { stunned: true }).build();
    await noResult.p1.move("hunter", "bf1");
    await noResult.settle();
    expect(noResult.locationOf("hunter")).toBe("base");
    expect(noResult.p1.xp()).toBe(0);

    const wipe = await attackWith([[3, "hunter"]], 3).build();
    await wipe.p1.move("hunter", "bf1");
    await wipe.settle();
    expect(wipe.zoneOf("hunter")).toBe("trash");
    expect(wipe.zoneOf("guard")).toBe("trash");
    expect(wipe.p1.xp()).toBe(0);
    expect(wipe.p2.xp()).toBe(0);

    const loss = await attackWith([[3, "hunter"]], 4).build();
    await loss.p1.move("hunter", "bf1");
    await loss.settle();
    expect(loss.zoneOf("hunter")).toBe("trash");
    expect(loss.p1.xp()).toBe(0);
    expect(loss.p2.xp()).toBe(0); // P2 won, but Voidreaver is MY legend

    const empty = await scenario().legend(P1, CARD, "vr").battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await empty.p1.move("scout", "bf1");
    await empty.settle();
    expect(empty.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(empty.p1.points()).toBe(1);
    expect(empty.p1.xp()).toBe(0);
  });

  test("Spend 1 XP, [Exhaust]: Buff a unit — XP 1 → 0 and legend exhausted ON ACTIVATION, an un-triggered chain item with a P2 window, the +1 buff only on resolution; 'a unit' includes an ENEMY unit", async () => {
    const game = await scenario().xp(P1, 1).legend(P1, CARD, "vr").unit(P1, "base", { might: 2, name: "Mine" }, "mine").unit(P2, "base", { might: 2, name: "Theirs" }, "theirs").build();
    expect([...(game.p1.option("activateAbility:vr#1")?.fields.find((f) => f.name === "targets")?.options ?? [])].map(String).sort()).toEqual(["mine", "theirs"]);
    await game.p1.activate("vr", 1, { targets: "theirs" });
    expect(game.p1.xp()).toBe(0);
    expect(game.state("vr").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vr", controller: P1, triggered: false })]);
    expect(game.state("theirs")).toMatchObject({ isBuffed: false, might: 2 });
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.state("theirs")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("mine")).toMatchObject({ isBuffed: false, might: 2 });
    // Shared [Exhaust]: nothing more this turn even after topping XP back up.
    expect(game.p1.legal().some((o) => o.verb === "activate")).toBe(false);
  });

  test("cost gates: 0 XP → neither ability; 1 XP → only the Buff (#1); an EXHAUSTED legend at 9 XP → neither; 702.3.a buffing an already-buffed unit still costs 1 XP and leaves it at +1", async () => {
    const withXp = (xp: number, exhausted = false) =>
      scenario()
        .xp(P1, xp)
        .card("vr", { def: CARD, meta: exhausted ? { exhausted: true } : undefined, owner: P1, zone: "legendZone" })
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", { might: 2, name: "Tired" }, "tired", { exhausted: true });
    const keys = (g: Awaited<ReturnType<ReturnType<typeof withXp>["build"]>>) => g.p1.legal().filter((o) => o.verb === "activate").map((o) => o.key).sort();
    expect(keys(await withXp(0).build())).toEqual([]);
    expect(keys(await withXp(1).build())).toEqual(["activateAbility:vr#1"]);
    expect(keys(await withXp(2).build())).toEqual(["activateAbility:vr#1", "activateAbility:vr#2"]);
    expect(keys(await withXp(9, true).build())).toEqual([]);

    const buffed = await scenario().xp(P1, 3).legend(P1, CARD, "vr").unit(P1, "base", { might: 2, name: "Vet" }, "vet", { buffed: true }).build();
    expect(buffed.state("vet").might).toBe(3);
    await buffed.p1.activate("vr", 1, { targets: "vet" });
    await buffed.settle();
    expect(buffed.p1.xp()).toBe(2);
    expect(buffed.state("vet")).toMatchObject({ isBuffed: true, might: 3 });
  });

  test("Spend 2 XP, [Exhaust]: only an EXHAUSTED + FRIENDLY unit AT A BATTLEFIELD qualifies (ready-at-bf, exhausted-in-base, exhausted-enemy-at-bf are all excluded); 3 → 1 XP; it lands in base STILL exhausted", async () => {
    const game = await scenario()
      .xp(P1, 3)
      .legend(P1, CARD, "vr")
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Stranded" }, "stranded", { exhausted: true })
      .unit(P1, "bf1", { might: 1, name: "Awake" }, "awake")
      .unit(P1, "base", { might: 2, name: "Napper" }, "napper", { exhausted: true })
      .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe", { exhausted: true })
      .build();
    expect(game.p1.option("activateAbility:vr#2")?.fields.find((f) => f.name === "targets")?.options).toEqual([["stranded"]]);
    expect((await game.p1.try((p) => p.activate("vr", 2, { targets: "awake" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.activate("vr", 2, { targets: "foe" }))).ok).toBe(false);
    await game.p1.activate("vr", 2, { targets: "stranded" });
    expect(game.p1.xp()).toBe(1);
    expect(game.state("vr").isExhausted).toBe(true);
    expect(game.locationOf("stranded")).toBe("bf1"); // still on the chain
    await game.settle();
    expect(game.locationOf("stranded")).toBe("base");
    expect(game.state("stranded").isExhausted).toBe(true); // an effect move readies nobody
    expect(game.locationOf("awake")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // Awake still holds it
  });

  test("no qualifying unit → ability #2 is simply not available even at 5 XP (only a READY friendly unit at the battlefield, an exhausted one in base)", async () => {
    const game = await scenario().xp(P1, 5).legend(P1, CARD, "vr").battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 1, name: "Awake" }, "awake").unit(P1, "base", { might: 2, name: "Napper" }, "napper", { exhausted: true }).build();
    expect(game.p1.can("activateAbility:vr#2")).toBe(false);
    expect(game.p1.can("activateAbility:vr#1")).toBe(true);
    expect((await game.p1.try((p) => p.activate("vr", 2, { targets: "napper" }))).ok).toBe(false);
    expect(game.p1.xp()).toBe(5);
    expect(game.state("vr").isReady).toBe(true);
  });

  test("the one-turn loop: attack at 1 XP and win (→ 2 XP, hunter exhausted on conquered bf1), then Spend 2 + Exhaust pulls the hunter home; the point stays but empty bf1 is lost at the cleanup (190.4.c)", async () => {
    const game = await attackWith([[3, "hunter"]], 2, 1).build();
    await game.p1.move("hunter", "bf1");
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.state("hunter")).toMatchObject({ isExhausted: true, location: "bf1" });
    expect(game.p1.can("activateAbility:vr#2")).toBe(true);
    await game.p1.activate("vr", 2, { targets: "hunter" });
    await game.settle();
    expect(game.locationOf("hunter")).toBe("base");
    expect(game.state("hunter").isExhausted).toBe(true);
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller ?? null).not.toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("timing (343.1.b / 313.1.a): with XP and a ready legend, neither ability is offered on the opponent's turn nor while P1 holds Focus in a showdown", async () => {
    const opp = await scenario().active(P2).xp(P1, 5).legend(P1, CARD, "vr").battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 2, name: "Tired" }, "tired", { exhausted: true }).build();
    expect(opp.p1.legal().some((o) => o.verb === "activate")).toBe(false);

    const sd = await scenario()
      .xp(P1, 5)
      .legend(P1, CARD, "vr")
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Tired" }, "tired", { exhausted: true })
      .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
      .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
      .autoProcedures(false)
      .build();
    await sd.p1.move("scout", "bf2");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("activateAbility:vr#1")).toBe(false);
    expect(sd.p1.can("activateAbility:vr#2")).toBe(false); // no mid-combat rescue of Tired either
  });

  test("XP persists and the legend readies next turn: win on turn N (1 XP), Buff on turn N+2 with that XP", async () => {
    const game = await attackWith([[3, "hunter"]], 2).unit(P1, "base", { might: 2, name: "Pal" }, "pal").build();
    await game.p1.move("hunter", "bf1");
    await game.settle();
    expect(game.p1.xp()).toBe(1);
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1 again (hunter also held bf1 → +1 point, no XP from holding)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.points()).toBe(2);
    expect(game.state("vr").isReady).toBe(true);
    await game.p1.activate("vr", 1, { targets: "pal" });
    await game.settle();
    expect(game.state("pal")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.p1.xp()).toBe(0);
  });
});

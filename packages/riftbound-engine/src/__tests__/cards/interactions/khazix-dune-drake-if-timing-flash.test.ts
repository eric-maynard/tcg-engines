/**
 * Interaction: Kha'Zix, Mutating Horror (unl-143-219) · Champion Unit · Chaos · 4+[chaos] · 4 Might
 *     "When I attack or defend, if an enemy unit is alone here, give me +2 [Might] this turn and gain 2 XP."
 *   × Dune Drake (ogn-131-298) · Unit · Body · 5 · 5 Might
 *     "When I attack, give me +2 [Might] this turn if there is a ready enemy unit here."
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · [Reaction] "Move up to 2 friendly units to base."
 *
 * Rules: 383.2.a.1 (an "if" IMMEDIATELY after the trigger condition is part of the CONDITION —
 * checked once when it triggers, never re-checked on resolution; a TRAILING "if" — Loose Cannon
 * pattern — is part of the EFFECT and is evaluated on resolution), 383.4.e.2 / .a / .b (attack
 * triggers become pending when the unit gains the Attacker designation; extra requirements are
 * checked once per combat, right then — no late/retroactive trigger), 383.3.d (simultaneous
 * triggers of ONE controller are ordered by that controller), 740.2.a (alone = no other friendly
 * unit at that location), 466.3.a (only side with units left wins the combat), 337.4 (priority
 * after finalizing).
 *
 * Question: P1 group-moves Kha'Zix + Dune Drake into bf1 held by P2's lone READY vanilla 3-Might D.
 *  (a) Which triggers go on the chain and who orders them?
 *  (b) P2 responds with Flash moving D home: Kha'Zix still +2/+2 XP (condition locked at trigger
 *      time), Drake's trailing "if" finds no ready enemy → stays 5; no defender → P1 conquers.
 *  (c) No Flash: Kha'Zix 6, Drake 7, D dies, P2 assigns D's 3 damage among the attackers, P1 conquers.
 *  (d) TWO ready defenders when designations are assigned, P2 Flashes ONE home in response to
 *      Drake's trigger: Kha'Zix never triggers (not retroactively), Drake still finds a ready enemy → 7.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KHAZIX = "unl-143-219";
const DUNE_DRAKE = "ogn-131-298";
const FLASH = "ogs-011-024";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn. P2 holds bf1 with `defenders` ready vanilla 3-Might units (d0, d1…); P2 has Flash + 2 energy. */
function board(defenders = 1) {
  const b = scenario()
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", KHAZIX, "kz")
    .unit(P1, "base", DUNE_DRAKE, "drake")
    .hand(P2, FLASH, "flash");
  for (let i = 0; i < defenders; i++) {
    b.unit(P2, "bf1", { might: 3, name: `D${i}` }, `d${i}`);
  }
  return b;
}

const chainIds = (game: Game): string[] => game.chain().map((c) => c.cardId);

/** Pass priority back and forth until the chain is empty (stops at any non-action prompt). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 20 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
}

/** (a)/(b)/(c) opening: group-move in, accept the listed trigger order. */
async function attackWithBoth(game: Game): Promise<void> {
  await game.p1.move(["kz", "drake"], "bf1");
  await game.acceptTriggerOrder();
}

describe("Kha'Zix × Dune Drake × Flash — intervening-if (condition) vs trailing-if (effect) timing", () => {
  // ── (a) what triggers, who orders ────────────────────────────────────────────────────────

  test("(a) both gain Attacker; Kha'Zix's condition (D alone, 740.2.a) holds at designation time and Drake's trigger is unconditional → BOTH become P1-controlled triggered chain items", async () => {
    const game = await board().build();
    await game.p1.move(["kz", "drake"], "bf1");
    expect(game.state("kz").combatRole).toBe("attacker");
    expect(game.state("drake").combatRole).toBe("attacker");
    expect(game.state("d0").combatRole).toBe("defender");
    expect(game.p2.units("bf1")).toEqual(["d0"]); // the enemy unit is alone here
    expect(game.chain()).toHaveLength(2);
    expect(game.chain()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "kz", controller: P1, triggered: true }),
        expect.objectContaining({ cardId: "drake", controller: P1, triggered: true }),
      ]),
    );
    // Nothing has resolved yet.
    expect(game.state("kz").might).toBe(4);
    expect(game.state("drake").might).toBe(5);
    expect(game.p1.xp()).toBe(0);
  });

  test("(a) P1 — and only P1 — is asked to order the two simultaneous triggers (383.3.d); P2 never sees an ordering prompt", async () => {
    const game = await board().build();
    let p2AskedToOrder = false;
    game.script(P2, [
      (d) => {
        if (d.kind === "order") {
          p2AskedToOrder = true;
        }
        return undefined;
      },
    ]);
    await game.p1.move(["kz", "drake"], "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const items = d?.kind === "order" ? d.items.map((i) => i.card ?? i.key) : [];
    expect(new Set(items)).toEqual(new Set(["kz", "drake"]));
    // P1 may pick either layout: put Kha'Zix on top this time.
    const keyOf = (card: string) => (d?.kind === "order" ? (d.items.find((i) => (i.card ?? i.key) === card)?.key ?? card) : card);
    await game.p1.order([keyOf("drake"), keyOf("kz")]);
    expect(chainIds(game)).toEqual(["drake", "kz"]);
    // After finalizing, the controller of the top item (P1) has priority (337.4); P2 was never asked to order.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(p2AskedToOrder).toBe(false);
  });

  // ── (b) Flash in response ────────────────────────────────────────────────────────────────

  test("(b) with both triggers pending P2 may respond with Flash on D; Flash sits on top of the two triggers and resolves first (LIFO) → D is in P2's base", async () => {
    const game = await board().build();
    await attackWithBoth(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["d0"] });
    expect(game.p2.energy()).toBe(0);
    expect(chainIds(game)).toEqual(["kz", "drake", "flash"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves
    expect(game.locationOf("d0")).toBe("base");
    expect(chainIds(game)).toEqual(["kz", "drake"]);
    // Neither trigger has resolved yet.
    expect(game.state("kz").might).toBe(4);
    expect(game.state("drake").might).toBe(5);
  });

  test("(b) Kha'Zix's item then resolves IN FULL although no enemy is here any more — the intervening 'if' is not re-checked (383.2.a.1): 6 Might this turn and +2 XP", async () => {
    const game = await board().build();
    await attackWithBoth(game);
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["d0"] });
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.state("kz")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.p1.xp()).toBe(2);
  });

  test("(b) Dune Drake's trailing 'if there is a ready enemy unit here' is evaluated ON RESOLUTION: nobody is here → no +2, Drake stays 5", async () => {
    const game = await board().build();
    await attackWithBoth(game);
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["d0"] });
    await drainChain(game);
    expect(game.state("drake")).toMatchObject({ might: 5, mightModifier: 0 });
  });

  test("(b) no defender remains → no combat damage is assigned (P2 never gets a distribute prompt), both attackers undamaged, P1 wins the combat and conquers bf1 for 1 point (466.3.a)", async () => {
    const game = await board().build();
    let p2AskedToAssign = false;
    game.script(P2, [
      (d) => {
        if (d.kind === "distribute") {
          p2AskedToAssign = true;
        }
        return undefined;
      },
    ]);
    await attackWithBoth(game);
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["d0"] });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(p2AskedToAssign).toBe(false);
    expect(game.locationOf("d0")).toBe("base");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.p1.units("bf1").sort()).toEqual(["drake", "kz"]);
    expect(game.state("kz").damage).toBe(0);
    expect(game.state("drake").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("kz").might).toBe(6); // still this turn
    expect(game.state("drake").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) contrast: no response ────────────────────────────────────────────────────────────

  test("(c) no Flash: both triggers resolve with D still here → Kha'Zix 6 (+2 XP) and Drake 7", async () => {
    const game = await board().build();
    await attackWithBoth(game);
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("kz").might).toBe(6);
    expect(game.p1.xp()).toBe(2);
    expect(game.state("drake").might).toBe(7);
    expect(game.locationOf("d0")).toBe("bf1");
  });

  test("(c) no Flash: 13 vs 3 — P2 (defender) is asked to assign D's 3 damage among Kha'Zix and Drake; D dies, nobody else does, P1 conquers bf1 (+1)", async () => {
    const game = await board().build();
    await attackWithBoth(game);
    await drainChain(game);
    await game.acting().passFocus();
    await game.acting().passFocus();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 3 });
    const buckets = d?.kind === "distribute" ? d.buckets.map((b) => b.card ?? b.key) : [];
    expect(new Set(buckets)).toEqual(new Set(["kz", "drake"]));
    // 465.2.c: damage must be stacked on one unit up to lethal before spilling — 3 < 6, so all on one.
    await game.p2.distribute({ kz: 3 });
    await game.settle();
    expect(game.zoneOf("d0")).toBe("trash");
    expect(game.p1.units("bf1").sort()).toEqual(["drake", "kz"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.hand()).toEqual(["flash"]); // never cast
    expect(game.violations()).toEqual([]);
  });

  // ── (d) contrast: two defenders, one Flashed home ────────────────────────────────────────

  test("(d) TWO ready defenders when designations are assigned: Kha'Zix's condition is false → ONLY Drake's trigger goes on the chain (no ordering prompt needed)", async () => {
    const game = await board(2).build();
    await game.p1.move(["kz", "drake"], "bf1");
    expect(game.decision()?.kind).not.toBe("order");
    expect(chainIds(game)).toEqual(["drake"]);
    expect(game.state("kz").combatRole).toBe("attacker");
    expect(game.p2.units("bf1").sort()).toEqual(["d0", "d1"]);
  });

  test("(d) P2 Flashes d0 home in response, leaving d1 alone — Kha'Zix does NOT trigger late (383.4.e.2.a/b: checked once, at designation): no Kha'Zix item ever appears, he stays 4, XP 0", async () => {
    const game = await board(2).build();
    await game.p1.move(["kz", "drake"], "bf1");
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["d0"] });
    expect(chainIds(game)).toEqual(["drake", "flash"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves → d1 is now alone here
    expect(game.locationOf("d0")).toBe("base");
    expect(game.p2.units("bf1")).toEqual(["d1"]);
    expect(chainIds(game)).toEqual(["drake"]); // no retroactive Kha'Zix trigger
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("kz")).toMatchObject({ might: 4, mightModifier: 0 });
    expect(game.p1.xp()).toBe(0);
  });

  test("(d) Drake's trailing check at resolution still finds a READY enemy unit (d1) here → Drake +2 (7)", async () => {
    const game = await board(2).build();
    await game.p1.move(["kz", "drake"], "bf1");
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["d0"] });
    await drainChain(game);
    expect(game.state("d1")).toMatchObject({ isReady: true, location: "bf1" });
    expect(game.state("drake")).toMatchObject({ might: 7, mightModifier: 2 });
  });

  test("(d) end state: 4+7 = 11 vs d1's 3 → d1 dies, P1 conquers bf1; Kha'Zix never gained XP this combat", async () => {
    const game = await board(2).build();
    await game.p1.move(["kz", "drake"], "bf1");
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["d0"] });
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.locationOf("d0")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0);
    expect(game.state("kz").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});

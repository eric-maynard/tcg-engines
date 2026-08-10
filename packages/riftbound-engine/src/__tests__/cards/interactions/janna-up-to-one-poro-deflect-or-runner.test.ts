/**
 * Interaction: Janna, Savior (sfd-053-221) · Champion Unit · Calm · 3+[calm] · 3 Might
 *     "[Reaction] … When you play me, heal your units here, then move up to one enemy unit from here to
 *      its base."
 *   × Pouty Poro (ogn-013-298) · Unit · Fury · 2 · 2 Might
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)"
 *   × Ruin Runner (sfd-105-221) · Unit · Body · 6 · 5 Might — "I can't be chosen by enemy spells and abilities."
 *
 * Question: P1 controls bf1 with a damaged friendly unit there and plays Janna to bf1; her play trigger goes
 * on the chain.
 *   Case A : the only enemy unit at bf1 is P2's Pouty Poro and P1 has exactly 1 spare power.
 *   Case A′: same, but P1 has 0 spare power.
 *   Case B : the only enemy unit at bf1 is P2's Ruin Runner.
 * In each: what target set is P1 offered, is "none" legal, is Deflect owed even though the Poro is the ONLY
 * possible choice, and does the heal still happen?
 *
 * Rules: 355.5.b / 355.7 / 355.9.a.1 (a triggered ability's board choice is a TARGET, fixed when the trigger
 * is finalized on the chain), 355.13 ("up to one" — zero is a legal choice and the ability still goes on the
 * chain and resolves), 355.10.d.2 (a sole legal candidate is still a choice → still targeting), 809.1.c /
 * 809.1.d (Deflect: mandatory extra [rainbow] to choose it with an ability; unpayable → not selectable),
 * 757 / 758 / 355.9.b (Ruin Runner cannot be chosen by enemy abilities → never offered).
 *
 * Expected:
 *   A : offered {Poro} + "none". Choosing Poro costs 1 power (any domain) → heal, then Poro to P2's base.
 *       Choosing none → nothing paid, heal, Poro stays.
 *   A′: Deflect unpayable → Poro not selectable; the trigger still resolves and heals; Poro stays.
 *   B : offered set EMPTY; the trigger is still finalized with zero targets (not removed), heals, Runner stays.
 *   The heal is never skipped — it is not linked to the move.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JANNA_SAVIOR = "sfd-053-221";
const POUTY_PORO = "ogn-013-298";
const RUIN_RUNNER = "sfd-105-221";

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn. P1 controls bf1 with a 4-Might ally carrying 2 damage; P2's `enemy` is the only enemy unit
 * there. P2 also has a 2-Might unit at ITS bf2 (not "here") and P1 a damaged unit in base (not "here").
 * P1 has exactly Janna's cost (3 + [calm]) plus `spare` FURY power (off-domain — Deflect takes any).
 */
function board(o: { enemy: "pouty" | "runner"; spare: number }) {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1, fury: o.spare } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Wounded Ally" }, "ally", { damage: 2 })
    .unit(P1, "base", { might: 3, name: "Home Wounded" }, "home", { damage: 1 })
    .unit(P2, "bf1", o.enemy === "pouty" ? POUTY_PORO : RUIN_RUNNER, "foe")
    .unit(P2, "bf2", { might: 2, name: "Far Poro" }, "far")
    .hand(P1, JANNA_SAVIOR, "janna");
}

function isJannaPick(d: Decision | null): d is Pick {
  return !!d && d.kind === "pick" && d.seat === P1 && d.source?.cardId === "janna";
}

/**
 * P1 plays Janna to bf1, then everyone passes priority until either P1 is asked to choose the enemy unit
 * for her trigger (returned, unanswered — whether asked at finalization or at resolution) or the trigger
 * has fully resolved without asking (returns null).
 */
async function playJannaUntilAsked(game: Game): Promise<Pick | null> {
  await game.p1.play("janna", { to: "bf1" });
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (isJannaPick(d)) {
      return d;
    }
    if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
      continue;
    }
    break;
  }
  return null;
}

describe("Janna, Savior — the play and its trigger", () => {
  test("Janna (3 + [calm]) is played to bf1 (a battlefield P1 controls), enters exhausted, and her 'When you play me' goes on the chain as P1's triggered item", async () => {
    const game = await board({ enemy: "pouty", spare: 1 }).build();
    await game.p1.play("janna", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 1 } });
    expect(game.state("janna")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "janna", controller: P1, triggered: true })]);
    expect(game.state("ally").damage).toBe(2); // nothing resolves yet
  });

  // Expected (355.5.b, 355.7, 355.9.a.1): "up to one enemy unit from here" is a TARGET of the triggered
  // ability, chosen when the trigger is finalized — P1 is asked right after the play (timing FIN), before
  // anyone holds priority, and the chain item then names the Poro. Actual: nothing is asked until the
  // trigger resolves (timing RES, chain already empty).
  test("the enemy unit is chosen at FINALIZATION — P1 is prompted before priority and the chain item shows the target (355.5.b, 355.7)", async () => {
    const game = await board({ enemy: "pouty", spare: 1 }).build();
    await game.p1.play("janna", { to: "bf1" });
    const d = game.decision();
    expect(isJannaPick(d)).toBe(true);
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    await game.p1.pick("foe");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "janna", targets: ["foe"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });
});

describe("Case A — lone Pouty Poro [Deflect] here, P1 has 1 spare power", () => {
  test("offered set is exactly {Pouty Poro} — not the enemy at bf2 (not 'here'), not a friendly unit — and 'none' is a legal answer ('up to one', 355.13)", async () => {
    const game = await board({ enemy: "pouty", spare: 1 }).build();
    const d = await playJannaUntilAsked(game);
    expect(d).not.toBeNull();
    expect((d as Pick).options.map((o) => o.card ?? o.key)).toEqual(["foe"]);
    expect((d as Pick).max).toBe(1);
    expect((d as Pick).allowDecline).toBe(true);
  });

  test("choosing the Poro: on resolution P1's units HERE are healed (ally 2→0; the damaged unit in base is not 'here'), then the Poro is moved to P2's base", async () => {
    const game = await board({ enemy: "pouty", spare: 1 }).build();
    await playJannaUntilAsked(game);
    await game.p1.pick("foe");
    await game.settle();
    expect(game.state("ally")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("home").damage).toBe(1);
    expect(game.state("foe")).toMatchObject({ controller: P2, damage: 0, zone: "base" });
    expect(game.p2.base()).toContain("foe");
    expect(game.locationOf("far")).toBe("bf2");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected (355.10.d.2 + 809.1.c/.d): the Poro being the ONLY candidate does not make the choice
  // programmatic — "up to one enemy unit from here" is targeting, so Deflect's mandatory extra cost of
  // 1 power (any domain; the fury pip does) is paid when P1 chooses it. Actual: the Poro is moved and
  // P1's spare fury is untouched.
  test("choosing the sole-candidate Poro still PAYS Deflect — P1's 1 spare power is spent (355.10.d.2, 809.1.c)", async () => {
    const game = await board({ enemy: "pouty", spare: 1 }).build();
    await playJannaUntilAsked(game);
    expect(game.p1.power("fury")).toBe(1);
    await game.p1.pick("foe");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
  });

  test("choosing NONE: no power is spent, the heal still happens (ally 2→0), the Poro stays at bf1; the trigger resolved (chain empty, open main phase)", async () => {
    const game = await board({ enemy: "pouty", spare: 1 }).build();
    await playJannaUntilAsked(game);
    await game.p1.decline();
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 1 } });
    expect(game.state("ally").damage).toBe(0);
    expect(game.state("foe")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Case A′ — lone Pouty Poro here, P1 has 0 spare power", () => {
  test("the trigger still goes on the chain and resolves: ally healed 2→0 with no enemy moved (the heal is not linked to the move); nothing but Janna's own cost was paid", async () => {
    const game = await board({ enemy: "pouty", spare: 0 }).build();
    const d = await playJannaUntilAsked(game); // asserts the trigger was on the chain (priority was passed on it)
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    if (d) {
      await game.p1.decline(); // a pick is (wrongly) offered — answer "none"
    }
    await game.settle();
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.state("ally").damage).toBe(0);
    expect(game.state("home").damage).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected (809.1.d): with no power at all the Deflect cost cannot be paid, so the Poro is not a
  // selectable target — P1 is offered nothing but "none" (or not asked at all) and the Poro stays at bf1.
  // Actual: the Poro is offered, and picking it moves it to base for free.
  test("with 0 power the Deflect Poro is NOT selectable — never offered, and it stays at bf1 (809.1.d)", async () => {
    const game = await board({ enemy: "pouty", spare: 0 }).build();
    const d = await playJannaUntilAsked(game);
    const offered = d ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).not.toContain("foe");
    if (d) {
      const r = await game.p1.try((p) => p.pick("foe"));
      if (r.ok) {
        await game.settle();
      } else {
        await game.p1.decline();
        await game.settle();
      }
    }
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.state("ally").damage).toBe(0);
  });
});

describe("Case B — lone Ruin Runner here ('can't be chosen by enemy … abilities')", () => {
  test("the offered set is EMPTY: P1 is never asked to choose the Runner (757/758, 355.9.b) — yet the trigger is still finalized on the chain with zero targets rather than removed (355.13)", async () => {
    const game = await board({ enemy: "runner", spare: 1 }).build();
    await game.p1.play("janna", { to: "bf1" });
    expect(isJannaPick(game.decision())).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "janna", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    let offeredRunner = false;
    for (let i = 0; i < 8 && game.decision()?.kind !== undefined; i++) {
      const d = game.decision();
      if (isJannaPick(d)) {
        offeredRunner ||= d.options.some((o) => (o.card ?? o.key) === "foe");
        await game.p1.decline();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    expect(offeredRunner).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("it resolves: P1's units here are healed (ally 2→0), the Ruin Runner stays at bf1 untouched, no power spent; back to P1's open main phase", async () => {
    const game = await board({ enemy: "runner", spare: 1 }).build();
    await game.p1.play("janna", { to: "bf1" });
    await game.settle();
    expect(isJannaPick(game.decision())).toBe(false);
    expect(game.state("ally")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("home").damage).toBe(1);
    expect(game.state("foe")).toMatchObject({ controller: P2, damage: 0, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

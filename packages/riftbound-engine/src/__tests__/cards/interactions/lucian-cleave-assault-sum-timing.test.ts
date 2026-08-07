/**
 * Interaction: Lucian, Gunslinger (sfd-028-221) · Champion Unit · Fury · 3 energy · 2 Might
 *     "[Assault] (+1 [Might] while I'm an attacker.)
 *      When I attack, deal damage equal to my [Assault] to an enemy unit here."
 *   × Cleave (ogn-004-298) · Spell · Fury · 1 energy
 *     "[Action] Give a unit [Assault 3] this turn."
 *
 * Rules:
 *   807.2, 807.3        — Assault from several sources SUMS; "my [Assault]" reads that summed value.
 *   807.1.c, 465.2.a    — while attacking, +X Might; combat damage uses current Might.
 *   383.4.e.2, 464.2.e  — "When I attack" goes on the initial combat chain as the attacker
 *                          designation is gained; 464.2.f the state is Closed while it is there.
 *   346.1, 347.1        — after that (triggered) chain empties Focus does NOT pass: the attacker may
 *                          then play an Action; 331.1.a / 338.1.a.2 — only Reactions join a chain.
 *   806.1.b vs 813.1.c.1 — Cleave is an Action, not a Reaction.
 *
 * Question: (a) Cleave BEFORE the attack: trigger damage and combat Might? (b) Cleave only during
 * the showdown: does the trigger benefit? (c) can Cleave be cast in response to the trigger?
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LUCIAN = "sfd-028-221";
const CLEAVE = "ogn-004-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1: Lucian ready in base, Cleave in hand, 1 energy. P2 holds bf1 with a single big "wall"
 * (survives anything here) — used to read the trigger's damage number off the wall mid-combat.
 */
function soloWall() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", LUCIAN, "lucian")
    .unit(P2, "bf1", { might: 12, name: "Wall" }, "wall")
    .hand(P1, CLEAVE, "cleave");
}

/**
 * Same, but P2 also has a 1-Might "decoy" at bf1 to soak Lucian's trigger, so the combat damage
 * step is exactly Lucian's Might vs a wall of `wallMight` (damage heals after combat, so the only
 * durable read-out of combat Might is whether the wall died).
 */
function decoyAndWall(wallMight: number) {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", LUCIAN, "lucian")
    .unit(P2, "bf1", { might: 1, name: "Decoy" }, "decoy")
    .unit(P2, "bf1", { might: wallMight, name: "Wall" }, "wall")
    .hand(P1, CLEAVE, "cleave");
}

/** Both players pass priority once each so the single item on the chain resolves. */
async function resolveTopOfChain(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

/** Attack bf1 with Lucian and point his trigger at the decoy (answering the prompt if one appears). */
async function attackAndShootDecoy(game: Game): Promise<void> {
  await game.p1.move("lucian", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lucian", triggered: true })]);
  // rule 402 (finalization): the target is chosen as the trigger goes on the chain, before priority.
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("decoy");
  }
  await resolveTopOfChain(game);
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("decoy")).toBe("trash"); // any Assault value ≥ 1 kills the 1-Might decoy
}

describe("Lucian, Gunslinger × Cleave — Assault summing and attack-trigger timing", () => {
  // ── (a) Cleave first, then attack ───────────────────────────────────────────────────────────

  test("(a) Cleave on Lucian in the main phase: he now carries printed Assault AND a granted Assault 3 (807.2)", async () => {
    const game = await soloWall().build();
    await game.p1.cast("cleave", { targets: "lucian" });
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("lucian").keywords).toContain("Assault");
    expect(game.state("lucian").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.zoneOf("cleave")).toBe("trash");
  });

  test("(a) moving in opens combat: Lucian is the attacker and his 'When I attack' trigger is the combat chain (383.4.e.2, 464.2.e)", async () => {
    const game = await soloWall().build();
    await game.p1.cast("cleave", { targets: "lucian" });
    await game.settle();
    await game.p1.move("lucian", "bf1");
    expect(game.state("lucian").combatRole).toBe("attacker");
    expect(game.state("wall").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lucian", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(a) with Cleave already applied the trigger deals his summed Assault = 4 (807.2, 807.3)", async () => {
    // Expected: Assault 1 (printed) + Assault 3 (Cleave) = 4 damage on the wall when the trigger
    // resolves. Actual: the trigger is wired to Lucian's Might (2), not his Assault value.
    const game = await soloWall().build();
    await game.p1.cast("cleave", { targets: "lucian" });
    await game.settle();
    await game.p1.move("lucian", "bf1");
    await resolveTopOfChain(game);
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("wall");
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(4);
  });

  test("(a) in the damage step Lucian swings for 2 + 1 + 3 = 6: a 6-Might wall dies, a 7-Might wall survives (807.1.c, 465.2.a)", async () => {
    const six = await decoyAndWall(6).build();
    await six.p1.cast("cleave", { targets: "lucian" });
    await six.settle();
    await attackAndShootDecoy(six);
    await six.settle(); // both pass focus → combat damage
    expect(six.zoneOf("wall")).toBe("trash");

    const seven = await decoyAndWall(7).build();
    await seven.p1.cast("cleave", { targets: "lucian" });
    await seven.settle();
    await attackAndShootDecoy(seven);
    await seven.settle();
    expect(seven.zoneOf("wall")).toBe("battlefield-bf1");
    expect(seven.state("wall").damage).toBe(0); // healed after combat
    expect(seven.zoneOf("lucian")).toBe("trash"); // took 7 ≥ his 6
  });

  // ── (b) attack first, Cleave only in the showdown ───────────────────────────────────────────

  test("(b) attacking without Cleave, the trigger deals only his printed Assault = 1", async () => {
    // Expected: 1 damage (Assault with no value = 1, 807.1.b.3). Actual: 2 (his Might).
    const game = await soloWall().build();
    await game.p1.move("lucian", "bf1");
    await resolveTopOfChain(game);
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("wall");
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(1);
  });

  test("(b) after the triggered combat chain empties, Focus stays with the ATTACKER, who may now cast Cleave (346.1, 347.1)", async () => {
    // Expected: the combat chain opened from a triggered ability, so Focus does not pass when it
    // empties — P1 (attacker) acts first in the open showdown and Cleave is legal for P1 now.
    // Actual: the engine hands Focus to P2 first.
    const game = await soloWall().build();
    await game.p1.move("lucian", "bf1");
    await resolveTopOfChain(game);
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("wall");
    }
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(true);
  });

  test("(b) Cleave cast during the showdown is too late for the trigger but still counts for combat: Lucian swings for 6 (6-wall dies, 7-wall lives)", async () => {
    for (const [wallMight, wallEndsIn] of [
      [6, "trash"],
      [7, "battlefield-bf1"],
    ] as const) {
      const game = await decoyAndWall(wallMight).build();
      await attackAndShootDecoy(game); // trigger already resolved (decoy dead) before any Action window
      if (game.actingSeat() === P2) {
        await game.p2.passFocus(); // tolerate the focus-order bug above; P1 gets Focus next either way
      }
      expect(game.p1.can("cast", "cleave")).toBe(true);
      await game.p1.cast("cleave", { targets: "lucian" });
      await game.settle(); // Cleave resolves, both pass focus, combat damage
      expect(game.zoneOf("cleave")).toBe("trash");
      expect(game.zoneOf("wall")).toBe(wallEndsIn);
    }
  });

  // ── (c) no Action "in response" to the trigger ──────────────────────────────────────────────

  test("(c) while Lucian's trigger is on the chain the state is Closed: Cleave (Action, not Reaction) cannot be cast by either timing window (331.1.a, 338.1.a.2)", async () => {
    const game = await soloWall().build();
    await game.p1.move("lucian", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lucian", triggered: true })]);
    // P1 holds priority first (attacker) — only pass / Reactions.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(false);
    await expect(game.p1.cast("cleave", { targets: "lucian" })).rejects.toThrow();
    expect(game.zoneOf("cleave")).toBe("hand");
    // Still not legal after P1 passes and before the trigger resolves.
    await game.p1.passPriority();
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "cleave")).toBe(false);
  });
});

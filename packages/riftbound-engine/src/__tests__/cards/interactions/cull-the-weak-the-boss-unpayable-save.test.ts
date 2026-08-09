/**
 * Interaction: Cull the Weak (ogn-209-298) · Spell · Order · 2 + [order]
 *     "Each player kills one of their units."
 *   × The Boss (ogn-269-298) · Legend · Sett
 *     "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to
 *      heal it, exhaust it, and recall it instead. (Send it to base. This isn't a move.)"
 *   × Vanguard Sergeant (ogn-219-298) · Unit · 4 Might — P1's ONLY unit, BUFFED, at bf1. P2 controls NO units.
 *
 * Rules: 355.10.e ("Each player kills one of their units" does not target — castable with no enemy units;
 * each player chooses as it resolves), 359.3.e.11 (an impossible part of an instruction — P2 has nothing to
 * kill — is skipped, no prompt), 370.1 / 370.1.a.1 (a kill is a "would die" event a replacement can catch;
 * replaced = the kill never happened), 371.2 / 371.2.a (an optional replacement is offered to its controller
 * when the event occurs — only if it CAN be applied, i.e. its whole compound cost is payable), 371.2.b
 * (declined → not applied: the unit just dies, The Boss untouched), 702.2.b (spending the buff removes it).
 *
 * Question: P1 casts Cull the Weak. (a) Boss ready + 1 spare power; (b) Boss ready, 0 power left; (c) power
 * but Boss already exhausted; (d) Sergeant not buffed. Who is prompted for what; where does the Sergeant end?
 *
 * Expected: castable although P2 has no units; P2 is never prompted for anything. P1's only unit is the kill
 * (no "may" — no way out). (a) one yes/no to P1: YES → pay 1 power (any domain), Boss exhausted, buff spent,
 * Sergeant healed + exhausted + recalled to base (bf1 left empty → uncontrolled at cleanup); NO → Sergeant to
 * trash, Boss stays ready, power kept. (b)/(c) cost not fully payable → no prompt at all, Sergeant dies.
 * (d) condition unmet → no prompt, Sergeant dies.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, YesNoDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";
const THE_BOSS = "ogn-269-298";
const VANGUARD_SERGEANT = "ogn-219-298";

interface Variant {
  /** Power left in P1's pool AFTER Cull's own [order] (the Boss's [rainbow] is paid from here). */
  readonly spare?: Record<string, number>;
  readonly bossExhausted?: boolean;
  readonly buffed?: boolean;
}

/** P1's turn. The Boss in P1's legend zone; buffed Sergeant alone at P1's bf1; P2 has no units at all. */
function board(v: Variant = {}) {
  const s = v.bossExhausted
    ? scenario().card("boss", { def: THE_BOSS, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
    : scenario().legend(P1, THE_BOSS, "boss");
  const power: Record<string, number> = { order: 1 }; // Cull's own pip
  for (const [domain, n] of Object.entries(v.spare ?? { body: 1 })) {
    power[domain] = (power[domain] ?? 0) + n;
  }
  return s
    .resources(P1, { energy: 2, power })
    .resources(P2, { energy: 3, power: { body: 1 } }) // P2 has resources — it is UNITS it lacks
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", VANGUARD_SERGEANT, "sarge", { buffed: v.buffed ?? true })
    .hand(P1, CULL_THE_WEAK, "cull");
}

/** Every non-priority prompt seen while draining to P1's open main phase; a Boss yes/no is answered with `boss` (or left standing if undefined). */
async function resolveCull(game: Game, boss?: boolean): Promise<Decision[]> {
  const prompts: Decision[] = [];
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
      continue;
    }
    prompts.push(d);
    if (d.kind === "yes-no" && d.seat === P1 && boss !== undefined) {
      await game.p1.answer(boss);
    } else {
      break; // an unexpected prompt — leave it for the test to inspect
    }
  }
  return prompts;
}

describe("Cull the Weak × The Boss — a forced self-kill, an optional costed save, and an opponent with nothing to cull", () => {
  // ---- premise ---------------------------------------------------------------------------------------------

  test("premise: Cull the Weak targets nothing (355.10.e) — castable although P2 controls no units; P1's own menu lists only P1's Sergeant; 2 energy + [order] are paid and it goes on the chain", async () => {
    const game = await board().build();
    expect(game.p2.units()).toEqual([]);
    expect(game.p1.can("cast", "cull")).toBe(true);
    const offered = (game.p1.option("cast", "cull")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect([...new Set(offered.flat())]).toEqual(["sarge"]);
    await game.p1.cast("cull", { targets: "sarge" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1, order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1 })]);
    expect(game.state("sarge")).toMatchObject({ isBuffed: true, might: 5, zone: "battlefield-bf1" });
  });

  test("no 'may': even a cast that names nothing up front still kills P1's ONLY unit as it resolves — the single candidate binds, there is no way to keep the Sergeant", async () => {
    const game = await board({ spare: {} }).build(); // no spare power → no Boss question muddying the water
    await game.p1.cast("cull", { targets: [] });
    const prompts = await resolveCull(game);
    expect(prompts).toEqual([]); // nobody was asked anything
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("trash");
  });

  // ---- (a) everything payable: the one and only question ------------------------------------------------------

  test("(a) Boss ready + 1 spare power: the kill is a 'would die' of a buffed friendly unit → P1 gets exactly ONE acceptable yes/no sourced from The Boss, before anything dies; P2 is never prompted (359.3.e.11)", async () => {
    const game = await board().build();
    await game.p1.cast("cull", { targets: "sarge" });
    const prompts = await resolveCull(game); // leaves the yes/no standing
    expect(prompts).toHaveLength(1);
    const ask = prompts[0] as YesNoDecision;
    expect(ask).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    expect(ask.canAccept).not.toBe(false);
    expect(prompts.some((p) => p.seat === P2)).toBe(false);
    expect(game.actingSeat()).toBe(P1);
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1"); // still alive while the question is open
    expect(game.state("boss").isReady).toBe(true);
  });

  test("(a) YES → pays exactly 1 power (any domain — here [body]) and no energy, exhausts The Boss, spends the buff; the Sergeant is healed, exhausted and RECALLED to base instead of dying — bf1 is left empty and goes uncontrolled", async () => {
    const game = await board().build();
    await game.p1.cast("cull", { targets: "sarge" });
    const prompts = await resolveCull(game, true);
    expect(prompts.map((p) => [p.seat, p.kind])).toEqual([[P1, "yes-no"]]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.state("sarge")).toMatchObject({ controller: P1, damage: 0, isBuffed: false, isExhausted: true, might: 4 });
    expect(game.p1.trash()).not.toContain("sarge");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // nobody stands there any more
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) YES with the spare power in ORDER instead: [rainbow] is any domain, same save", async () => {
    const game = await board({ spare: { order: 1 } }).build(); // pool: order 2 → 1 for Cull, 1 for the Boss
    await game.p1.cast("cull", { targets: "sarge" });
    await resolveCull(game, true);
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("boss").isExhausted).toBe(true);
  });

  test("(a) NO → the replacement 'has not been applied' (371.2.b): Sergeant dies to P1's trash, The Boss stays READY, the spare power is kept; still nobody asked P2 anything", async () => {
    const game = await board().build();
    await game.p1.cast("cull", { targets: "sarge" });
    const prompts = await resolveCull(game, false);
    expect(prompts.map((p) => [p.seat, p.kind])).toEqual([[P1, "yes-no"]]);
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["sarge", "cull"]));
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1, order: 0 } });
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  // ---- (b)(c)(d) the save cannot apply: no question at all ----------------------------------------------------

  test("(b) Boss ready but 0 power left after Cull: the [rainbow] is unpayable → NO yes/no is surfaced at all, the Sergeant just dies, The Boss stays ready", async () => {
    const game = await board({ spare: {} }).build();
    await game.p1.cast("cull", { targets: "sarge" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    const prompts = await resolveCull(game);
    expect(prompts).toEqual([]);
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.state("boss").isReady).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b') energy is irrelevant: 0 power but plenty of ENERGY still cannot pay [rainbow] — no prompt, Sergeant dies", async () => {
    const game = await board({ spare: {} }).resources(P1, { energy: 9 }).build();
    await game.p1.cast("cull", { targets: "sarge" });
    expect(game.p1.energy()).toBe(7);
    const prompts = await resolveCull(game);
    expect(prompts).toEqual([]);
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p1.energy()).toBe(7);
  });

  test("(c) power available but The Boss ALREADY exhausted: 'exhaust me' is unpayable → no prompt, Sergeant dies, the power is kept", async () => {
    const game = await board({ bossExhausted: true }).build();
    expect(game.state("boss").isExhausted).toBe(true);
    await game.p1.cast("cull", { targets: "sarge" });
    const prompts = await resolveCull(game);
    expect(prompts).toEqual([]);
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1, order: 0 } });
    expect(game.state("boss").isExhausted).toBe(true);
  });

  test("(d) Sergeant NOT buffed: the replacement's condition ('a buffed unit you control') is unmet → no prompt, Sergeant (4 Might) dies, Boss ready, power kept", async () => {
    const game = await board({ buffed: false }).build();
    expect(game.state("sarge")).toMatchObject({ isBuffed: false, might: 4 });
    await game.p1.cast("cull", { targets: "sarge" });
    const prompts = await resolveCull(game);
    expect(prompts).toEqual([]);
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1, order: 0 } });
  });

  // ---- P2's side in every variant --------------------------------------------------------------------------------

  test("in EVERY variant P2 — who controls no units — only ever sees priority on the chain, never a pick / yes-no; P2's resources and board are untouched", async () => {
    const variants: [string, Variant, boolean | undefined][] = [
      ["a-yes", {}, true],
      ["a-no", {}, false],
      ["b", { spare: {} }, undefined],
      ["c", { bossExhausted: true }, undefined],
      ["d", { buffed: false }, undefined],
    ];
    for (const [name, v, boss] of variants) {
      const game = await board(v).build();
      await game.p1.cast("cull", { targets: "sarge" });
      const prompts = await resolveCull(game, boss);
      expect({ name, p2Prompts: prompts.filter((p) => p.seat === P2) }).toEqual({ name, p2Prompts: [] });
      expect(game.p2.resources()).toEqual({ energy: 3, power: { body: 1 } });
      expect(game.p2.trash()).toEqual([]);
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
      expect(game.zoneOf("cull")).toBe("trash");
    }
  });
});

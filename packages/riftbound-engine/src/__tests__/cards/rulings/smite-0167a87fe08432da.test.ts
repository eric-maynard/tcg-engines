/**
 * Ruling 0167a87fe08432da — Smite (UNL-007 → unl-007-219, Action, [2][fury])
 *   "Deal 3 to a unit at a battlefield. If it would die this turn, banish it instead."
 *   × Zhonya's Hourglass (ogn-077-298, Gear) "If a friendly unit would die, kill this instead. Heal that unit,
 *     exhaust it, and recall it."
 *   × Tactical Retreat (unl-175-219, Reaction) "Choose a friendly unit. The next time it would die this turn, heal
 *     it, exhaust it, and recall it instead."
 *   × Guardian Angel (sfd-051-221, Equipment, +1 Might) — dies in place of the equipped unit.
 *
 * Q: Can Guardian Angel, Zhonya's Hourglass, or Tactical Retreat save a unit from Smite?
 * A: Yes. Smite's "banish instead" and each protective effect are replacement effects on the same death event;
 *    the CONTROLLER of the dying unit orders them. Protective effect first → the death is fully replaced (unit
 *    healed/exhausted/recalled, or the equipment dies instead) and Smite has nothing left to replace → not
 *    banished. Smite first → banished; the protective effects can't apply to a banish (not a kill).
 * Rules: 369.1, 372, 370.1.a.1, 370.2, 427.2.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMITE = "unl-007-219";
const ZHONYAS = "ogn-077-298";
const TACTICAL_RETREAT = "unl-175-219";
const GUARDIAN_ANGEL = "sfd-051-221";

/** P1 to act with exactly Smite's [2][fury]; P2's 3-Might victim sits at bf1. */
function base() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .hand(P1, SMITE, "smite");
}

const zhonyasBoard = () => base().unit(P2, "bf1", { might: 3, name: "Victim" }, "victim").gear(P2, ZHONYAS, "zh");

const retreatBoard = () =>
  base()
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .resources(P2, { energy: 2 })
    .hand(P2, TACTICAL_RETREAT, "retreat");

/** Guardian Angel already attached: 2 printed Might + 1 = 3, so Smite's 3 is still lethal. */
const guardianBoard = () =>
  base()
    .unit(P2, "bf1", { might: 2, name: "Victim" }, "victim", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "victim" } as Record<string, unknown>, owner: P2, zone: "bf1" });

/** P1 Smites the victim; with Tactical Retreat in hand P2 answers on the chain first; then everyone passes. */
async function smiteResolves(game: Game, opts: { retreat?: boolean } = {}): Promise<void> {
  await game.p1.cast("smite", { targets: "victim" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  if (opts.retreat) {
    await game.p1.passPriority();
    expect(game.p2.can("cast", "retreat")).toBe(true);
    const f = game.p2.option("cast", "retreat")?.fields.find((x) => x.name === "targets");
    await game.p2.cast("retreat", f ? { targets: "victim" } : {});
    expect(game.chain().map((i) => i.cardId)).toEqual(["smite", "retreat"]);
    // Retreat resolves first (LIFO) and installs its shield; then Smite resolves.
  }
  await game.settle();
}

/** After Smite's damage is found lethal, P2 (controller of the victim) must be asked to order the replacements. */
function expectOrderingDecisionForP2(game: Game): void {
  const d = game.decision();
  expect(d?.seat).toBe(P2);
  expect(["pick", "order"]).toContain(d?.kind as string);
}

/** P2 answers the ordering prompt putting `first` first. */
async function p2Applies(game: Game, first: string): Promise<void> {
  const d = game.decision();
  if (d?.kind === "order") {
    const keys = d.items.map((i) => i.key);
    await game.p2.order([first, ...keys.filter((k) => k !== first)]);
  } else {
    await game.p2.pick(first);
  }
  await game.settle();
}

function expectSavedToBase(game: Game): void {
  expect(game.zoneOf("victim")).toBe("base");
  expect(game.state("victim").damage).toBe(0);
  expect(game.state("victim").isExhausted).toBe(true);
  expect(game.p2.banishment()).not.toContain("victim");
  expect(game.p2.trash()).not.toContain("victim");
}

describe("Ruling 0167a87fe08432da — Smite vs Zhonya's Hourglass / Tactical Retreat / Guardian Angel", () => {
  test("control: Smite alone — 3 damage is lethal to the 3-Might victim and it is banished instead of dying", async () => {
    const game = await base().unit(P2, "bf1", { might: 3, name: "Victim" }, "victim").build();
    await smiteResolves(game);
    expect(game.zoneOf("victim")).toBe("banishment");
    expect(game.p2.trash()).not.toContain("victim");
    expect(game.zoneOf("smite")).toBe("trash");
  });

  // ── Zhonya's Hourglass ───────────────────────────────────────────────────────────────────

  // Expected: two replacement effects want the same death → P2 (victim's controller) orders them (372).
  // Actual: Smite's banish replacement is applied silently; nobody is asked.
  test("ruling 0167a87fe08432da — Zhonya's: P2 is asked to order Smite's and Zhonya's replacement effects (engine: no prompt)", async () => {
    const game = await zhonyasBoard().build();
    await smiteResolves(game);
    expectOrderingDecisionForP2(game);
  });

  // Expected: P2 applies Zhonya's first → Hourglass killed (trash); victim healed, exhausted, recalled to base; Smite's
  // "banish instead" has no death left to replace (370.2) → NOT banished. Actual: no prompt; victim banished.
  test("ruling 0167a87fe08432da — Zhonya's applied first saves the unit: Hourglass to trash, victim in base healed+exhausted, not banished (engine: banished)", async () => {
    const game = await zhonyasBoard().build();
    await smiteResolves(game);
    expectOrderingDecisionForP2(game);
    await p2Applies(game, "zh");
    expect(game.zoneOf("zh")).toBe("trash");
    expectSavedToBase(game);
  });

  // Expected: P2 may instead apply Smite first → victim banished; Zhonya's cannot chain onto a banish (427.2.a) so it
  // stays on the board unused. Actual: the outcome matches, but P2 is never given the choice.
  test("ruling 0167a87fe08432da — Zhonya's: P2 CHOOSES Smite first → banished, Hourglass stays (engine: right outcome, but no choice offered)", async () => {
    const game = await zhonyasBoard().build();
    await smiteResolves(game);
    expectOrderingDecisionForP2(game);
    await p2Applies(game, "smite");
    expect(game.zoneOf("victim")).toBe("banishment");
    expect(game.zoneOf("zh")).toBe("base");
  });

  test("Zhonya's — engine default (no ordering offered) coincides with the Smite-first branch: victim banished, Hourglass untouched in base", async () => {
    const game = await zhonyasBoard().build();
    await smiteResolves(game);
    if (game.decision()?.seat === P2 && game.decision()?.kind !== "action") {
      await p2Applies(game, "smite");
    }
    expect(game.zoneOf("victim")).toBe("banishment");
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p2.gear()).toContain("zh");
  });

  // ── Tactical Retreat ─────────────────────────────────────────────────────────────────────

  test("Tactical Retreat: P2 can answer Smite on the chain; Retreat resolves first and installs its one-shot die-replacement for this turn", async () => {
    const game = await retreatBoard().build();
    await game.p1.cast("smite", { targets: "victim" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "retreat")).toBe(true);
    const f = game.p2.option("cast", "retreat")?.fields.find((x) => x.name === "targets");
    await game.p2.cast("retreat", f ? { targets: "victim" } : {});
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((i) => i.cardId)).toEqual(["smite", "retreat"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Retreat resolves
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.chain().map((i) => i.cardId)).toEqual(["smite"]);
    const shields = (game.gameState.activeReplacements ?? []) as { replaces?: string; sourceCardId?: string }[];
    expect(shields.some((r) => r.replaces === "die" && r.sourceCardId === "retreat")).toBe(true);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1"); // nothing has happened to it yet
  });

  // Expected: when Smite then resolves, P2 orders the two replacements (372). Actual: no prompt; banished.
  test.failing("BUG: ruling 0167a87fe08432da — Tactical Retreat: P2 is asked to order Retreat's and Smite's replacements (engine: no prompt)", async () => {
    const game = await retreatBoard().build();
    await smiteResolves(game, { retreat: true });
    expectOrderingDecisionForP2(game);
  });

  // Expected: Retreat first → victim healed, exhausted, recalled to base, not banished. Actual: banished.
  test.failing("BUG: ruling 0167a87fe08432da — Tactical Retreat applied first saves the unit to base, healed+exhausted, not banished (engine: banished)", async () => {
    const game = await retreatBoard().build();
    await smiteResolves(game, { retreat: true });
    expectOrderingDecisionForP2(game);
    await p2Applies(game, "retreat");
    expectSavedToBase(game);
    expect(game.zoneOf("retreat")).toBe("trash");
  });

  // rule 370.2 / 372: with no ordering prompt yet, the engine applies Retreat's shield first — the
  // branch P2 would pick anyway. The death is fully replaced, so Smite's "banish instead" finds no
  // death left to replace.
  test("Tactical Retreat — engine default (no ordering offered) coincides with the Retreat-first branch: victim saved to base", async () => {
    const game = await retreatBoard().build();
    await smiteResolves(game, { retreat: true });
    if (game.decision()?.seat === P2 && game.decision()?.kind !== "action") {
      await p2Applies(game, "retreat");
    }
    expectSavedToBase(game);
    expect(game.zoneOf("retreat")).toBe("trash");
  });

  // ── Guardian Angel ───────────────────────────────────────────────────────────────────────

  test("Guardian Angel setup: attached, +1 Might → the 2-Might victim is 3, so Smite's 3 is lethal", async () => {
    const game = await guardianBoard().build();
    expect(game.state("ga").attachedTo).toBe("victim");
    expect(game.state("victim").attachments).toEqual(["ga"]);
    expect(game.state("victim").might).toBe(3);
  });

  // Expected: P2 orders GA's and Smite's replacements; GA first → the Equipment dies in the unit's place: GA to trash,
  // victim still on the board (not banished, not in trash). Actual: our sfd-051-221 data carries only "[Equip] [calm]"
  // — no protective replacement exists — so there is no prompt and the victim is banished.
  test.failing("BUG: ruling 0167a87fe08432da — Guardian Angel applied first dies instead of the unit; unit stays on the board, not banished (engine: GA has no replacement; banished)", async () => {
    const game = await guardianBoard().build();
    await smiteResolves(game);
    expectOrderingDecisionForP2(game);
    await p2Applies(game, "ga");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.locationOf("victim")).toBeDefined(); // base or bf1 — still on the board
    expect(game.p2.banishment()).not.toContain("victim");
    expect(game.p2.trash()).not.toContain("victim");
  });
});

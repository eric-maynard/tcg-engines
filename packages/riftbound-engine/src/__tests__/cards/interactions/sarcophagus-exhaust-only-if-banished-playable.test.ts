/**
 * Interaction: Cursed Sarcophagus (unl-148-219) · Gear · Chaos · 4 + [chaos]
 *     "When you play this, banish all units from your trash. [Exhaust]: Play a unit banished with this.
 *      (You must pay its costs.)"
 *   × Perched Grimwyrm (sfd-015-221) · Unit · Fury · 4 · 5 Might
 *     "Play me only to a battlefield you conquered this turn. (You can't play me anywhere else.)"
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla)
 *   + Mageseeker Warden (ogn-070-298) "While I'm at a battlefield, opponents can only play units to their base."
 *
 * Rules: 108.6.e (banishment is public) → "a unit banished with this" is a specific object CHOSEN when the
 * ability is activated (355.5, 355.9.a, 402.2); 427.3 (only what THIS Sarcophagus banished); 419.3.b/c (the
 * effect-play follows every step of Play — costs, valid location); 355.2.a as narrowed by Grimwyrm's "only"
 * (054.2) and the Warden's "can only … base" (054.1); 469.1 vs 469.2 (holding ≠ conquering); 402.3 + 355.16
 * (an activated ability with no legal option cannot be activated — P1 must not be able to exhaust the gear for
 * nothing); 358.5 / 404 (a refused activation undoes its [Exhaust] cost); 343.1.b (no [Action]/[Reaction] →
 * never during a showdown).
 *
 * Board: P1's turn, Neutral Open. P1 holds bfA (Keeper there, from before), has a Runner in base, and plays
 * the Sarcophagus first so that Perched Grimwyrm and Vanguard Sergeant (both in the trash) are banished WITH
 * IT. bfB and bfC are P2's (empty unless the Warden stands on bfC). Then P1's pool is set exactly.
 *   (a) 3 energy, nothing conquered → ability ABSENT (Sergeant unaffordable; Grimwyrm unaffordable + homeless).
 *   (b) 4 energy, nothing conquered → offered; choices {Sergeant} only → {base, bfA}; pays 4, enters exhausted;
 *       Sarcophagus exhausted; Grimwyrm stays banished and is selectable on a later activation.
 *   (c) 4 energy, bfB conquered THIS turn. Warden at bfC: {Sergeant → base} only, Grimwyrm not selectable.
 *       Warden in P2's base: Sergeant → {base, bfA, bfB}; Grimwyrm → {bfB} only, pays 4, enters bfB exhausted.
 *   (d) only Grimwyrm banished, 4 energy, nothing conquered → ABSENT.
 *   (e) raw activation on (a)/(d) → refused atomically: Sarcophagus still READY, units still banished, energy
 *       unchanged, chain empty.
 *   (f) during a showdown on P1's turn with Focus → absent, raw refused, Sarcophagus ready.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SARCOPHAGUS = "unl-148-219";
const GRIMWYRM = "sfd-015-221";
const SERGEANT = "ogn-219-298";
const WARDEN = "ogn-070-298";

type Opts = { sergeant?: boolean; grimwyrm?: boolean; warden?: "bfC" | "base" };

function board(o: Opts = {}) {
  const s = scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } }) // exactly the Sarcophagus; the test pool is floated afterwards
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: P2 })
    .unit(P1, "bfA", { might: 2, name: "Keeper" }, "keeper")
    .unit(P1, "base", { might: 2, name: "Runner" }, "runner")
    .unit(P2, "base", { might: 3, name: "Bystander" }, "foe")
    .hand(P1, SARCOPHAGUS, "sarc");
  if (o.grimwyrm !== false) {
    s.trash(P1, GRIMWYRM, "wyrm");
  }
  if (o.sergeant !== false) {
    s.trash(P1, SERGEANT, "sarge");
  }
  if (o.warden === "bfC") {
    s.unit(P2, "bfC", WARDEN, "warden");
  } else if (o.warden === "base") {
    s.unit(P2, "base", WARDEN, "warden");
  }
  return s;
}

/**
 * Play the Sarcophagus (its trigger banishes the trash units WITH IT), optionally conquer bfB with the Runner
 * (empty enemy battlefield → conquered at once), then float exactly `energy`. Ends in P1's Neutral Open state.
 */
async function ready(energy: number, o: Opts & { conquerB?: boolean } = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p1.play("sarc");
  await game.settle();
  expect(game.state("sarc")).toMatchObject({ isReady: true, zone: "base" });
  expect(game.p1.trash()).toEqual([]);
  if (o.conquerB) {
    await game.p1.move("runner", "bfB");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.battlefields.bfB).toMatchObject({ controller: P1 });
    expect(game.p1.points()).toBe(1); // conquered bfB this turn
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.p1.do("addResources", { energy });
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

/** Activate the [Exhaust] ability and pass priority until P1's "which banished unit" pick (or the chain is gone). */
async function activateToUnitPick(game: Game): Promise<Decision | null> {
  await game.p1.activate("sarc");
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main") {
      break;
    }
    await game.acting().pass();
  }
  return game.decision();
}

const pickKeys = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []);

const RAW_ACTIVATE = { abilityIndex: 1, cardId: "sarc" } as const;

describe("Cursed Sarcophagus [Exhaust] — only activatable when a unit banished WITH IT can actually be played", () => {
  test("premise: after the Sarcophagus resolves, Grimwyrm and Sergeant are in P1's banishment (banished WITH IT), the gear is ready, the ability is index #1", async () => {
    const game = await ready(4);
    expect(game.p1.banishment().sort()).toEqual(["sarge", "wyrm"]);
    expect(game.state("sarc").isReady).toBe(true);
    expect(game.p1.option("activate", "sarc")?.key).toBe("activateAbility:sarc#1");
    expect(game.gameState.battlefields.bfA).toMatchObject({ controller: P1 });
    expect(game.p1.points()).toBe(0); // bfA is HELD from before, nothing conquered this turn
  });

  // ── (a) 3 energy, nothing conquered ────────────────────────────────────────────────────────────

  // Expected: neither linked unit can be finalized (Sergeant costs 4 > 3; Grimwyrm costs 4 AND has no battlefield
  // conquered this turn), so per 402.3 / 355.16 the [Exhaust] ability is not a legal activation at all.
  // Actual: `activateAbility:sarc#1` is on the menu; activating exhausts the gear and the resolution plays nothing.
  test.failing("BUG: (a) with 3 energy and nothing conquered the [Exhaust] ability must be ABSENT from seat.legal() — no banished-with-this unit is playable (402.3, 355.16)", async () => {
    const game = await ready(3);
    expect(game.p1.can("activate", "sarc")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "sarc")).toBe(false);
  });

  // ── (b) 4 energy, nothing conquered ────────────────────────────────────────────────────────────

  test("(b) with 4 energy the ability IS offered; activating pays [Exhaust] (gear exhausted) and puts P1's activated ability on the chain", async () => {
    const game = await ready(4);
    expect(game.p1.can("activate", "sarc")).toBe(true);
    await game.p1.activate("sarc");
    expect(game.state("sarc").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sarc", controller: P1, triggered: false, type: "ability" })]);
    expect(game.p1.energy()).toBe(4); // the unit's cost is not paid yet
  });

  // Expected: banishment is public (108.6.e), so "a unit banished with this" is a specific object chosen while
  // the ability is being activated (355.5 / 355.9.a / 402.2, Decision timing FIN) — before anyone gets priority.
  // Actual: activation asks nothing; the unit is picked only when the ability RESOLVES (a `reveal-and-pick`,
  // timing RES) after both players pass.
  test.failing("BUG: (b) the banished unit is a TARGET named at activation — right after activate() P1 faces a FIN pick offering exactly [Sergeant], not a priority window (355.5, 402.2)", async () => {
    const game = await ready(4);
    await game.p1.activate("sarc");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(pickKeys(d)).toEqual(["sarge"]);
  });

  test("(b) the choice offers exactly {Sergeant}: Grimwyrm is filtered out because {battlefields conquered this turn} = ∅ leaves it no legal destination (054.2, 419.3.b)", async () => {
    const game = await ready(4);
    const d = await activateToUnitPick(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickKeys(d)).toEqual(["sarge"]);
    await expect(game.p1.pick("wyrm")).rejects.toThrow();
  });

  test("(b) Sergeant → destinations offered are exactly {base, bfA (held)}; bfB/bfC (P2's) are not (355.2.a)", async () => {
    const game = await ready(4);
    await activateToUnitPick(game);
    await game.p1.pick("sarge");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(pickKeys(d)).toEqual(["base", "battlefield-bfA"]);
  });

  test("(b) → base: pays exactly 4 ('you must pay its costs'), Sergeant enters base EXHAUSTED at 4 Might; the Sarcophagus stays exhausted; Grimwyrm remains in banishment; back to the open main phase", async () => {
    const game = await ready(4);
    await activateToUnitPick(game);
    await game.p1.pick("sarge");
    await game.p1.pick("base");
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.state("sarge")).toMatchObject({ controller: P1, isExhausted: true, might: 4 });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("sarc").isExhausted).toBe(true);
    expect(game.zoneOf("wyrm")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["wyrm"]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) → bfA is equally fine (a held battlefield is a normal unit destination): Sergeant lands at bfA exhausted for 4", async () => {
    const game = await ready(4);
    await activateToUnitPick(game);
    await game.p1.pick("sarge");
    await game.p1.pick("battlefield-bfA");
    expect(game.zoneOf("sarge")).toBe("battlefield-bfA");
    expect(game.state("sarge").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
  });

  test("(b) Grimwyrm stays linked: two turns later, after P1 conquers bfB and has 4 energy, the readied Sarcophagus offers Grimwyrm and it lands on bfB", async () => {
    const game = await ready(4);
    await activateToUnitPick(game);
    await game.p1.pick("sarge");
    await game.p1.pick("base");
    await game.settle();
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1 again — Awaken readies the Sarcophagus
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("sarc").isReady).toBe(true);
    await game.p1.move("runner", "bfB");
    await game.settle();
    expect(game.gameState.battlefields.bfB).toMatchObject({ controller: P1 });
    const pool = game.p1.energy();
    await game.p1.do("addResources", { energy: Math.max(0, 4 - pool) });
    const d = await activateToUnitPick(game);
    expect(pickKeys(d)).toContain("wyrm");
    await game.p1.pick("wyrm");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bfB");
    }
    expect(game.zoneOf("wyrm")).toBe("battlefield-bfB");
    expect(game.state("wyrm")).toMatchObject({ isExhausted: true, might: 5 });
  });

  // ── (c) 4 energy, bfB conquered THIS turn, Mageseeker Warden ───────────────────────────────────

  test("(c) Warden at bfC: P1 may play units only to base → the choice is {Sergeant} only (Grimwyrm: {bfB} ∩ {base} = ∅ → not selectable); Sergeant goes to base with no destination prompt (single legal location), pays 4", async () => {
    const game = await ready(4, { conquerB: true, warden: "bfC" });
    expect(game.p1.can("activate", "sarc")).toBe(true);
    const d = await activateToUnitPick(game);
    expect(pickKeys(d)).toEqual(["sarge"]);
    await game.p1.pick("sarge");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // base was forced
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.state("sarge").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("wyrm")).toBe("banishment");
  });

  test("(c) Warden in P2's BASE (text off): both units are selectable; Sergeant's destinations are exactly {base, bfA, bfB}", async () => {
    const game = await ready(4, { conquerB: true, warden: "base" });
    const d = await activateToUnitPick(game);
    expect(pickKeys(d)).toEqual(["sarge", "wyrm"]);
    await game.p1.pick("sarge");
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(pickKeys(dest)).toEqual(["base", "battlefield-bfA", "battlefield-bfB"]);
    await game.p1.pick("battlefield-bfB");
    expect(game.zoneOf("sarge")).toBe("battlefield-bfB");
    expect(game.p1.energy()).toBe(0);
  });

  test("(c) Warden in base, choosing Grimwyrm: its ONLY legal location is bfB (conquered this turn) — not base, not the merely-held bfA (469.1 vs 469.2) — so it lands there with no destination prompt, exhausted, 5 Might, 4 paid; Sergeant stays banished", async () => {
    const game = await ready(4, { conquerB: true, warden: "base" });
    await activateToUnitPick(game);
    await game.p1.pick("wyrm");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // bfB was forced
    expect(game.zoneOf("wyrm")).toBe("battlefield-bfB");
    expect(game.state("wyrm")).toMatchObject({ controller: P1, isExhausted: true, location: "bfB", might: 5 });
    expect(game.p1.units("bfB").sort()).toEqual(["runner", "wyrm"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("sarge")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });

  test("(c) no Warden at all, bfB conquered: same as Warden-in-base — {Sergeant, Grimwyrm} selectable, Grimwyrm → bfB only", async () => {
    const game = await ready(4, { conquerB: true });
    const d = await activateToUnitPick(game);
    expect(pickKeys(d)).toEqual(["sarge", "wyrm"]);
    await game.p1.pick("wyrm");
    expect(game.zoneOf("wyrm")).toBe("battlefield-bfB");
  });

  // ── (d) only Grimwyrm banished, 4 energy, nothing conquered ────────────────────────────────────

  // Expected: the sole linked unit has no legal destination, so the ability is absent (402.3) — otherwise P1
  // could exhaust the gear for nothing. Actual: offered; activating exhausts the Sarcophagus and resolves as a
  // no-op (Grimwyrm stays banished).
  test.failing("BUG: (d) with only Grimwyrm banished and nothing conquered this turn the ability must be ABSENT even at 4 energy (402.3 — no legal option)", async () => {
    const game = await ready(4, { sergeant: false });
    expect(game.p1.banishment()).toEqual(["wyrm"]);
    expect(game.p1.can("activate", "sarc")).toBe(false);
  });

  test("(d) …contrast: the same board after conquering bfB this turn — the ability is offered and Grimwyrm lands on bfB for 4", async () => {
    const game = await ready(4, { conquerB: true, sergeant: false });
    expect(game.p1.can("activate", "sarc")).toBe(true);
    const d = await activateToUnitPick(game);
    // a single legal card may be auto-taken or asked; accept either
    if (d?.kind === "pick") {
      expect(pickKeys(d)).toEqual(["wyrm"]);
      await game.p1.pick("wyrm");
    }
    expect(game.zoneOf("wyrm")).toBe("battlefield-bfB");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("sarc").isExhausted).toBe(true);
  });

  // ── (e) rollback probes ────────────────────────────────────────────────────────────────────────

  // Expected: the raw activation is refused as a whole (358.5 / 404): the [Exhaust] cost is part of the undone
  // activation, so the Sarcophagus is still READY, both units still banished, energy 3, chain empty, P1 still in
  // Neutral Open. Actual: accepted — gear exhausted, an ability item sits on the chain and later resolves empty.
  test.failing("BUG: (e) raw {activate Sarcophagus} on board (a) (3 energy) is refused atomically — gear still ready, Grimwyrm + Sergeant still banished, energy 3, chain empty, still P1's open main phase", async () => {
    const game = await ready(3);
    const r = await game.p1.try((p) => p.do("activateAbility", RAW_ACTIVATE));
    expect(r.ok).toBe(false);
    expect(game.state("sarc").isReady).toBe(true);
    expect(game.p1.banishment().sort()).toEqual(["sarge", "wyrm"]);
    expect(game.p1.energy()).toBe(3);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test.failing("BUG: (e) raw {activate Sarcophagus} on board (d) (only Grimwyrm, nothing conquered) is refused atomically — gear still ready, Grimwyrm still banished, energy 4, chain empty", async () => {
    const game = await ready(4, { sergeant: false });
    const r = await game.p1.try((p) => p.do("activateAbility", RAW_ACTIVATE));
    expect(r.ok).toBe(false);
    expect(game.state("sarc").isReady).toBe(true);
    expect(game.p1.banishment()).toEqual(["wyrm"]);
    expect(game.p1.energy()).toBe(4);
    expect(game.chain()).toEqual([]);
  });

  test("(e) what the engine does today on board (a): the activation goes through, and once both pass it resolves into NOTHING — no unit leaves banishment, no energy is spent, no 'unit played' trigger, but the Sarcophagus has been exhausted for the turn", async () => {
    const game = await ready(3);
    await game.p1.do("activateAbility", RAW_ACTIVATE);
    expect(game.state("sarc").isExhausted).toBe(true);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.banishment().sort()).toEqual(["sarge", "wyrm"]);
    expect(game.p1.energy()).toBe(3);
    expect(game.chain()).toEqual([]);
    expect(game.p1.units().sort()).toEqual(["keeper", "runner"]);
    expect(game.state("sarc").isExhausted).toBe(true); // ← the cost was taken for no effect
  });

  // ── (f) timing: showdown ───────────────────────────────────────────────────────────────────────

  test("(f) during a showdown on P1's own turn (P1 holds Focus, 4 energy, Sergeant banished) the ability is absent — no [Action]/[Reaction] (343.1.b) — and a raw activation is refused with the Sarcophagus still READY and the chain empty", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Runner" }, "runner")
      .trash(P1, SERGEANT, "sarge")
      .hand(P1, SARCOPHAGUS, "sarc")
      .build();
    await game.p1.play("sarc");
    await game.settle();
    expect(game.p1.banishment()).toEqual(["sarge"]);
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("activate", "sarc")).toBe(true); // Neutral Open: fine
    await game.p1.move("runner", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "sarc")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "sarc")).toBe(false);
    const r = await game.p1.try((p) => p.do("activateAbility", RAW_ACTIVATE));
    expect(r.ok).toBe(false);
    expect(game.state("sarc").isReady).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sarge")).toBe("banishment");
    expect(game.p1.energy()).toBe(4);
  });
});

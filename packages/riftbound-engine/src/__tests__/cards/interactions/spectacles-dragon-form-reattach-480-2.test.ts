/**
 * Interaction: TWO Shady Spectacles (ven-137-166) · Gear · Order · [Equip] [1][order] · "As this is attached to a unit, choose
 *     another friendly unit. The equipped unit becomes a copy of that unit for as long as this is attached to it."
 *   × Dragon Form (ven-116-166) · Spell · Order · 3 · "Choose a unit. Its base Might becomes 5 this turn. [Flow] [3]"
 *   × Angle Shot (sfd-011-221) · Spell · Fury · 2 · Reaction · "Choose a unit and an Equipment with the same controller. Attach
 *     that Equipment to that unit or detach that Equipment from that unit. Draw 1."                              — cast by P2
 *   on P1's Daring Poro (ogn-210-298, printed 2, [Assault]) with the models Vanguard Sergeant (ogn-219-298, vanilla 4) and
 *   Shipyard Skulker (ogn-175-298, vanilla 3).
 *
 * Rules: 477.1.a.1 (a Might ASSIGNMENT — "base Might becomes N" — is a layer-1 trait-altering effect), 477.1.b / 477.1.b.1.a
 * ("becomes a copy" is layer 1 too and overwrites the copyable traits: name, cost, Might, rules text — NOT damage / exhausted /
 * buffs), 478.1.c / 479 / 479.1 / 479.2 (inside one layer an effect whose result would be changed or wiped by applying another
 * first DEPENDS on it and is applied immediately after it, before timestamps are consulted), 480 / 480.1 / 480.3 (independent
 * effects → timestamp order, latest wins), 480.2 (Rules/Effect Text that becomes Inactive LOSES its timestamp and receives a NEW
 * one when it becomes active again), 724 / 435.1.d (a detached Equipment's Effect Text is Inactive), 434.1 (attach), 818 (Equip).
 *
 * Question: S1 attached first (t1) choosing Vanguard Sergeant, S2 second (t2) choosing Shipyard Skulker → the Poro reads
 * 'Shipyard Skulker' 3. Same turn: (a) P1 casts Dragon Form on it — name/Might, and is DF-vs-copy ordered by dependency or by
 * timestamp? (b) P2 Angle-Shots (Poro, S1) in detach mode (S1 = the OLDER Spectacles) — name/Might? (c) P1 re-Equips S1 onto
 * the Poro, again choosing Vanguard Sergeant: same two gear, same two models as at the start — Skulker again or Sergeant? Might
 * now, and after Dragon Form expires? (d) Contrast: no detach at all. (e) Where does 480.2 bite, and what would (c) read under
 * the alternative "no dependency, pure timestamp" reading of DF-vs-copy?
 *
 * Expected: (a) all three live in layer 1. Copy-vs-copy: no dependency → timestamps S1(t1) then S2(t2) → Skulker traits. DF only
 * rewrites one trait on top of whatever the object is and would be wiped by a later-applied copy → DF DEPENDS on the copies →
 * applied right after them regardless of timestamps → 'Shipyard Skulker', 5 Might, no keywords. (b) S1's Effect Text goes
 * Inactive and loses its timestamp; only S2 applies → still 'Shipyard Skulker'; DF on top → 5; S1 unattached in P1's base with
 * its [Equip] active again; P2 drew 1. (c) S1's text is active again with a NEW timestamp t3 > t2 → order S2 then S1 → the Poro
 * is 'VANGUARD SERGEANT' (cost 4, blank text): the identical gear/model pair now yields the opposite identity — that flip IS
 * 480.2. Might: copies first, dependent DF after → 5 for the rest of the turn; after end of turn DF expires → Sergeant's 4 (not
 * Skulker's 3). (d) never detached: 'Shipyard Skulker' 5 now, 'Shipyard Skulker' 3 after end of turn. (e) 480.2 acts on S1's
 * Effect Text only; S2 kept t2 throughout; DF's own timestamp is irrelevant (placed by dependency). Under the pure-timestamp
 * reading (a) and (b) are still 5 but (c) would read 'Vanguard Sergeant' at 4 mid-turn (S1's renewed copy newest, DF buried) —
 * the NAME flip is identical under both readings, only the mid-turn Might (5 vs 4) discriminates them. Throughout: the Poro's
 * 1 damage and exhausted status are untouched (477.1.b.1.a). Text-state: S1 ACTIVE(t1) → INACTIVE(no ts) → ACTIVE(t3); S2
 * ACTIVE(t2) throughout.
 *
 * Sequencing note: on P1's turn P2 only ever holds priority on a chain, so P2 answers Dragon Form itself with Angle Shot. LIFO
 * resolves the detach BEFORE Dragon Form — the board passes through "(b) without DF" (only S2 applies → Skulker 3) and then
 * lands on "(a)+(b)" (Skulker 5). DF's timestamp thus sits after S2's and before the re-attached S1's exactly as in the question,
 * so every discriminating answer — in particular (c)'s 5-vs-4 — is unchanged. (a) on its own is checked with P2 passing.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHADY_SPECTACLES = "ven-137-166";
const DRAGON_FORM = "ven-116-166";
const ANGLE_SHOT = "sfd-011-221";
const DARING_PORO = "ogn-210-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const SHIPYARD_SKULKER = "ogn-175-298";

/**
 * P1's turn. P1: Daring Poro (1 damage, EXHAUSTED — statuses no layer-1 effect may touch), Vanguard Sergeant, Shipyard Skulker,
 * two unattached Shady Spectacles, Dragon Form in hand; 6 energy + 3 order = three Equips ([1][order] each) + Dragon Form (3).
 * P2: Angle Shot in hand with exactly 2 energy for it. No battlefields are involved.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 3 } })
    .resources(P2, { energy: 2 })
    .unit(P1, "base", DARING_PORO, "poro", { damage: 1, exhausted: true })
    .unit(P1, "base", VANGUARD_SERGEANT, "sergeant")
    .unit(P1, "base", SHIPYARD_SKULKER, "skulker")
    .gear(P1, SHADY_SPECTACLES, "s1")
    .gear(P1, SHADY_SPECTACLES, "s2")
    .hand(P1, DRAGON_FORM, "df")
    .hand(P2, ANGLE_SHOT, "angle");
}

/** [Equip] `specs` onto the Poro, let it resolve, and answer "choose another friendly unit" with `model`. */
async function equip(game: Game, specs: "s1" | "s2", model: "sergeant" | "skulker"): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: specs, unitId: "poro" } });
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: specs } });
  await game.p1.pick(model);
  await game.settle();
}

/** (t1) S1 → Poro as Vanguard Sergeant; (t2) S2 → same Poro as Shipyard Skulker. */
async function bothAttached(): Promise<Game> {
  const game = await board().build();
  await equip(game, "s1", "sergeant");
  await equip(game, "s2", "skulker");
  return game;
}

/** (a)+(b): P1 casts Dragon Form on the Poro; P2 answers with Angle Shot (Poro, S1) → detach resolves, then Dragon Form. */
async function dragonFormAndDetach(): Promise<Game> {
  const game = await bothAttached();
  await game.p1.cast("df", { targets: "poro" });
  await game.p1.passPriority();
  await game.p2.cast("angle", { targets: ["poro", "s1"] });
  await game.settle();
  expect(game.chain()).toEqual([]);
  return game;
}

/** (c): …then P1 re-Equips S1 onto the Poro, again choosing Vanguard Sergeant. */
async function reattached(): Promise<Game> {
  const game = await dragonFormAndDetach();
  await equip(game, "s1", "sergeant");
  return game;
}

/** Which unattached Spectacles currently offer [Equip] — i.e. whose RULES text is active (their Effect Text is then Inactive, 724). */
const equippable = (game: Game) => [...((game.p1.option("equipCard:-")?.fields.find((f) => f.name === "equipmentId")?.options as string[] | undefined) ?? [])].sort();

const SKULKER = { energyCost: 3, name: "Shipyard Skulker" };
const SERGEANT = { energyCost: 4, name: "Vanguard Sergeant" };
const UNTOUCHED = { damage: 1, isExhausted: true, location: "base", zone: "base" };

describe("Two Shady Spectacles + Dragon Form + Angle Shot detach/re-Equip — layer-1 dependency (479) vs renewed timestamp (480.2)", () => {
  // ── premise ─────────────────────────────────────────────────────────────────────────────────────────

  test("premise (t1, t2): S1→Sergeant then S2→Skulker on the same Poro — copy vs copy has no dependency, timestamps S1 then S2 → 'Shipyard Skulker', 3 Might, cost 3, no keywords (Assault overwritten); damage/exhausted untouched; both Spectacles' [Equip] now Inactive", async () => {
    const game = await board().build();
    expect(game.state("poro")).toMatchObject({ keywords: ["Assault"], might: 2, name: "Daring Poro", ...UNTOUCHED });
    expect(equippable(game)).toEqual(["s1", "s2"]); // both unattached: Rules Text ([Equip]) active, Effect Text inactive
    await equip(game, "s1", "sergeant");
    expect(game.state("poro")).toMatchObject({ ...SERGEANT, keywords: [], might: 4, ...UNTOUCHED }); // S1 ACTIVE (t1)
    expect(equippable(game)).toEqual(["s2"]);
    await equip(game, "s2", "skulker");
    expect(game.state("poro")).toMatchObject({ ...SKULKER, keywords: [], might: 3, ...UNTOUCHED }); // S2 ACTIVE (t2) — newest wins (480.3)
    expect([...game.state("poro").attachments].sort()).toEqual(["s1", "s2"]);
    expect(equippable(game)).toEqual([]); // both attached: neither offers [Equip]
    expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 1 } });
    // the models are never affected
    expect(game.state("sergeant")).toMatchObject({ might: 4, name: "Vanguard Sergeant" });
    expect(game.state("skulker")).toMatchObject({ might: 3, name: "Shipyard Skulker" });
  });

  // ── (a) Dragon Form on the double-copied Poro ───────────────────────────────────────────────────────

  test("(a) Dragon Form offers the Poro (any unit), costs 3, and goes on the chain targeting it", async () => {
    const game = await bothAttached();
    const offered = (game.p1.option("cast", "df")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect([...offered].sort()).toEqual(["poro", "sergeant", "skulker"]);
    await game.p1.cast("df", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "df", controller: P1, targets: ["poro"], triggered: false })]);
  });

  test("(a) Dragon Form resolves with both Spectacles on: copies applied first (S1 then S2 → Skulker), the DEPENDENT Might assignment after them (479.2) → 'Shipyard Skulker', 5 Might, cost 3, no keywords (no Assault); damage/exhausted untouched (477.1.b.1.a)", async () => {
    const game = await bothAttached();
    await game.p1.cast("df", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("df")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ ...SKULKER, keywords: [], might: 5, ...UNTOUCHED });
    expect([...game.state("poro").attachments].sort()).toEqual(["s1", "s2"]);
    expect(game.violations()).toEqual([]);
  });

  // ── (b) P2 detaches the OLDER Spectacles (S1) ───────────────────────────────────────────────────────

  test("(b) with Dragon Form on the chain P2 holds priority and Angle Shot offers (poro, s1) / (poro, s2) — a unit and an Equipment 'with the same controller' may both be the OPPONENT's; it costs P2 2", async () => {
    const game = await bothAttached();
    expect(game.p2.can("cast", "angle")).toBe(false); // no priority in P1's open main phase
    await game.p1.cast("df", { targets: "poro" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    const pairs = game.p2.option("cast", "angle")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(pairs).toEqual(expect.arrayContaining([["poro", "s1"], ["poro", "s2"]]));
    await game.p2.cast("angle", { targets: ["poro", "s1"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().map((c) => c.cardId)).toEqual(["df", "angle"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "angle", controller: P2, targets: ["poro", "s1"] });
  });

  test("(b) Angle Shot resolves first (LIFO): S1 is DETACHED into P1's base — its Effect Text is Inactive (loses its timestamp, 480.2), its [Equip] is active again; only S2's copy applies → still 'Shipyard Skulker' 3 (not printed Poro, not Sergeant); P2 drew 1; Dragon Form still waiting on the chain", async () => {
    const game = await bothAttached();
    await game.p1.cast("df", { targets: "poro" });
    await game.p1.passPriority();
    const p2Hand = game.p2.hand().length; // Angle Shot still in it
    await game.p2.cast("angle", { targets: ["poro", "s1"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // → Angle Shot resolves, Dragon Form does not yet
    expect(game.zoneOf("angle")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["df"]);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
    expect(game.state("s1")).toMatchObject({ attachedTo: undefined, controller: P1, location: "base", zone: "base" });
    expect(game.state("s2").attachedTo).toBe("poro");
    expect(game.state("poro").attachments).toEqual(["s2"]);
    expect(game.state("poro")).toMatchObject({ ...SKULKER, keywords: [], might: 3, ...UNTOUCHED });
  });

  test("(b) …then Dragon Form resolves: S2's copy first, dependent DF on top → 'Shipyard Skulker', 5 Might, cost 3, no keywords; S1 off, S2 on; statuses untouched", async () => {
    const game = await dragonFormAndDetach();
    expect(game.zoneOf("df")).toBe("trash");
    expect(game.zoneOf("angle")).toBe("trash");
    expect(game.state("poro").attachments).toEqual(["s2"]);
    expect(game.state("s1")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.state("poro")).toMatchObject({ ...SKULKER, keywords: [], might: 5, ...UNTOUCHED });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // back to P1's open main phase
    expect(equippable(game)).toEqual(["s1"]); // S1: Rules Text ([Equip]) active again ⇔ Effect Text INACTIVE; S2 still attached (ACTIVE, t2)
    expect(game.violations()).toEqual([]);
  });

  // ── (c) re-Equip S1 → 480.2 renews its timestamp → identity flips, Might does not ────────────────────

  test("(c) re-Equipping S1 ([1][order]) fires 'As this is attached…' again — a NEW choice offering sergeant | skulker (never the Poro itself)", async () => {
    const game = await dragonFormAndDetach();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "s1", unitId: "poro" } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P1, source: { cardId: "s1" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["sergeant", "skulker"]);
  });

  test("(c) 480.2: S1's Effect Text is active again with the NEWEST timestamp (t3 > t2) → copy order S2 then S1 → the Poro is 'VANGUARD SERGEANT' (cost 4, no keywords) — the identical pair of gear + models reads the OPPOSITE of the start of the turn", async () => {
    const game = await reattached();
    // same two gear, same two chosen models as at (t2)…
    expect([...game.state("poro").attachments].sort()).toEqual(["s1", "s2"]);
    expect(game.state("s1").attachedTo).toBe("poro");
    expect(game.state("s2").attachedTo).toBe("poro");
    expect(equippable(game)).toEqual([]); // S1 ACTIVE (t3), S2 ACTIVE (t2)
    // …opposite identity
    expect(game.state("poro")).toMatchObject({ ...SERGEANT, keywords: [], ...UNTOUCHED });
    expect(game.state("poro").name).not.toBe("Shipyard Skulker");
  });

  test("(c) Might right now is 5, not 4: the copies (S2, S1) are applied first and the DEPENDENT 'base Might becomes 5' after them (479.2) — DF is NOT buried under S1's renewed timestamp (this is the facet that discriminates the dependency reading from pure-timestamp)", async () => {
    const game = await reattached();
    expect(game.state("poro")).toMatchObject({ ...SERGEANT, might: 5, ...UNTOUCHED });
    expect(game.state("poro").might).not.toBe(4); // the pure-timestamp reading's answer
    expect(game.violations()).toEqual([]);
  });

  test("(c) after end of turn Dragon Form expires → the Poro is 'Vanguard Sergeant' at Sergeant's 4 (not Skulker's 3, not Poro's 2); both Spectacles still attached", async () => {
    const game = await reattached();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect([...game.state("poro").attachments].sort()).toEqual(["s1", "s2"]);
    expect(game.state("poro")).toMatchObject({ ...SERGEANT, keywords: [], might: 4 });
    expect(game.state("poro").meta.baseMightOverride).toBeUndefined();
  });

  // ── (d) contrast: never detached ────────────────────────────────────────────────────────────────────

  test("(d) contrast — no detach at all (P2 passes): 'Shipyard Skulker' 5 now; after end of turn DF expires → 'Shipyard Skulker' 3; S1(t1)/S2(t2) both active throughout", async () => {
    const game = await bothAttached();
    await game.p1.cast("df", { targets: "poro" });
    await game.settle(); // P2 passes
    expect(game.zoneOf("angle")).toBe("hand");
    expect(game.state("poro")).toMatchObject({ ...SKULKER, keywords: [], might: 5, ...UNTOUCHED });
    expect(equippable(game)).toEqual([]);
    await game.advanceTurn();
    expect([...game.state("poro").attachments].sort()).toEqual(["s1", "s2"]);
    expect(game.state("poro")).toMatchObject({ ...SKULKER, keywords: [], might: 3 });
  });

  // ── (e) where 480.2 bites: only S1's text lost/regained a timestamp ─────────────────────────────────

  test("(e) side by side after end of turn: detach+re-Equip S1 → 'Vanguard Sergeant' 4; never detached → 'Shipyard Skulker' 3 — same gear, same models, opposite identity: 480.2 acted on S1's Effect Text (S2 kept t2 throughout)", async () => {
    const flipped = await reattached();
    await flipped.advanceTurn();
    const steady = await bothAttached();
    await steady.p1.cast("df", { targets: "poro" });
    await steady.settle();
    await steady.advanceTurn();
    const summary = (g: Game) => ({ attachments: [...g.state("poro").attachments].sort(), might: g.state("poro").might, name: g.state("poro").name });
    expect(summary(flipped)).toEqual({ attachments: ["s1", "s2"], might: 4, name: "Vanguard Sergeant" });
    expect(summary(steady)).toEqual({ attachments: ["s1", "s2"], might: 3, name: "Shipyard Skulker" });
  });

  test("(e) the name flip is reading-independent but the mid-turn Might is not: right after the re-Equip the engine reports ('Vanguard Sergeant', 5) = dependency reading, not ('Vanguard Sergeant', 4) = pure-timestamp reading", async () => {
    const game = await reattached();
    const now = { might: game.state("poro").might, name: game.state("poro").name };
    expect(now).toEqual({ might: 5, name: "Vanguard Sergeant" });
    expect(now).not.toEqual({ might: 4, name: "Vanguard Sergeant" });
  });
});

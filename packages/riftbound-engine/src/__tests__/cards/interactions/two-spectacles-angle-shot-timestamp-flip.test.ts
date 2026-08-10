/**
 * Interaction: TWO Shady Spectacles (ven-137-166) · Gear · Order · [Equip] [1][order] · "As this is attached to a unit,
 *     choose another friendly unit. The equipped unit becomes a copy of that unit for as long as this is attached to it."
 *   × Angle Shot (sfd-011-221) · Spell · Fury · 2 · Reaction · "Choose a unit and an Equipment with the same controller.
 *     Attach that Equipment to that unit or detach that Equipment from that unit. Draw 1."
 *   on Daring Poro (ogn-210-298, 2, [Assault]) with the models Unsung Hero (sfd-167-221, 2, [Deathknell] — if I was
 *   Mighty, draw 2) and Fiora, Victorious (ogn-232-298, 4, "While I'm [Mighty], I have [Deflect], [Ganking], [Shield]").
 *
 * Rules: 477.1.b / 477.1.b.1 (copy effects live in layer 1 and overwrite the copyable traits), 477.1.b.1.a (copyable =
 * name, type, tags, cost, domain, Might, rules text — NOT damage / exhausted / buffs), 478 / 479.1 (two effects in one
 * layer: each copy completely overwrites the other and neither's own values depend on the other → both altered → NO
 * dependency), 480 / 480.1 / 480.3 (→ timestamp order, earliest first, latest wins), 480.2 (Rules/Effect Text that becomes
 * Inactive LOSES its timestamp and gets a NEW one when it becomes active again), 435.1.c / 435.1.d / 724 / 136.2.b (a
 * detached Equipment's Effect Text is Inactive and no longer appended; its Rules Text — [Equip] — is active again),
 * 434.1.b.1 (several cards may be attached to one Top-Most card).
 *
 * Question: (t1) Spectacles #1 → Poro choosing Unsung Hero; (t2) Spectacles #2 → same Poro choosing Fiora.
 *   (a) What is the Poro, and why?  (b) Angle Shot DETACHES #1 — what is it now?  (c) #1 is re-attached to the Poro
 *   (Equip again, or a second Angle Shot in attach mode), again choosing Unsung Hero — same two gear, same two choices
 *   as after t2: Fiora again, or Unsung Hero?  (d) Contrast: detach + re-attach #2 (re-choosing Fiora) instead.
 *
 * Expected: (a) no dependency → timestamps: #1 (t1) then #2 (t2) → 'Fiora, Victorious', 4 Might, cost 4, no keywords
 * (not Mighty; Poro's Assault overwritten). (b) only #2 applies → STILL 'Fiora, Victorious' 4; #1 unattached in base.
 * (c) #1's text was Inactive while detached → new timestamp t3 > t2 → #2 then #1 → 'Unsung Hero', 2 Might, Deathknell:
 * the identical board reads the OPPOSITE of (a). (d) renewing #2's (already latest) timestamp changes nothing: 'Fiora'
 * before and after — but 'Unsung Hero' while #2 is off. Throughout, the Poro's 1 damage and exhausted status are untouched.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const SHADY_SPECTACLES = "ven-137-166";
const ANGLE_SHOT = "sfd-011-221";
const DARING_PORO = "ogn-210-298";
const UNSUNG_HERO = "sfd-167-221";
const FIORA_VICTORIOUS = "ogn-232-298";

/**
 * P1's turn. P1: Daring Poro (1 damage, EXHAUSTED — statuses that no copy may touch), Unsung Hero, Fiora, Victorious, two
 * unattached Shady Spectacles, two Angle Shots in hand; 7 energy + 3 order = three Equips (1+[order] each) + two Angle
 * Shots (2 each). No opponent pieces are involved.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { order: 3 } })
    .unit(P1, "base", DARING_PORO, "poro", { damage: 1, exhausted: true })
    .unit(P1, "base", UNSUNG_HERO, "hero")
    .unit(P1, "base", FIORA_VICTORIOUS, "fiora")
    .gear(P1, SHADY_SPECTACLES, "specs1")
    .gear(P1, SHADY_SPECTACLES, "specs2")
    .hand(P1, ANGLE_SHOT, "angle1")
    .hand(P1, ANGLE_SHOT, "angle2");
}

/** [Equip] `specs` onto the Poro, let it resolve, and answer "choose another friendly unit" with `model`. */
async function equip(game: Game, specs: string, model: string): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: specs, unitId: "poro" } });
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: specs } });
  await game.p1.pick(model);
  await game.settle();
}

/** Angle Shot on (Poro, `specs`): detaches if attached, else attaches — then answer the re-fired "as this is attached" choice with `model`. */
async function angleShot(game: Game, spell: string, specs: string, model?: string): Promise<void> {
  await game.p1.cast(spell, { targets: ["poro", specs] });
  await game.settle();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(model).toBeDefined();
    await game.p1.pick(model as string);
    await game.settle();
  }
}

/** (t1) #1 → Poro as Unsung Hero; (t2) #2 → Poro as Fiora. */
async function bothAttached(): Promise<Game> {
  const game = await board().build();
  await equip(game, "specs1", "hero");
  await equip(game, "specs2", "fiora");
  return game;
}

const FIORA_SHAPE = { baseMight: 4, energyCost: 4, might: 4, name: "Fiora, Victorious" };
const HERO_SHAPE = { baseMight: 2, energyCost: 2, might: 2, name: "Unsung Hero" };
const UNTOUCHED = { damage: 1, isExhausted: true, location: "base", zone: "base" };

describe("Two Shady Spectacles on one Poro × Angle Shot — layer-1 copy vs copy is settled by timestamp, and a detach renews it", () => {
  // ── (a) ───────────────────────────────────────────────────────────────────────────────────────────

  test("(t1) Spectacles #1 alone: the Poro is 'Unsung Hero', 2 Might, with Deathknell (Assault overwritten); 1 damage + exhausted untouched (477.1.b.1.a); each Equip costs 1 + [order]", async () => {
    const game = await board().build();
    await equip(game, "specs1", "hero");
    expect(game.p1.resources()).toEqual({ energy: 6, power: { order: 2 } });
    expect(game.state("specs1").attachedTo).toBe("poro");
    expect(game.state("poro")).toMatchObject({ ...HERO_SHAPE, ...UNTOUCHED, attachments: ["specs1"] });
    expect(game.state("poro").keywords).toEqual(["Deathknell"]);
  });

  test("(t2) Spectacles #2 may go on the SAME Poro (434.1.b.1) and, as it attaches, again offers hero | fiora ('another friendly unit' — never the Poro itself)", async () => {
    const game = await board().build();
    await equip(game, "specs1", "hero");
    expect(game.p1.option("equipCard:-")?.fields.find((f) => f.name === "equipmentId")?.options).toEqual(["specs2"]); // #1 is attached: its [Equip] is Inactive
    await game.p1.choose("equipCard:-", { params: { equipmentId: "specs2", unitId: "poro" } });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "specs2" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["fiora", "hero"]);
  });

  test("(a) both attached: no dependency (479.1) → timestamp order #1 then #2 (480.3) — the Poro is 'Fiora, Victorious', 4 Might, cost 4, NO keywords (not Mighty; Assault and Deathknell both overwritten); damage/exhausted untouched", async () => {
    const game = await bothAttached();
    expect(game.p1.resources()).toEqual({ energy: 5, power: { order: 1 } });
    expect([...game.state("poro").attachments].sort()).toEqual(["specs1", "specs2"]);
    expect(game.state("specs1").attachedTo).toBe("poro");
    expect(game.state("specs2").attachedTo).toBe("poro");
    expect(game.state("poro")).toMatchObject({ ...FIORA_SHAPE, ...UNTOUCHED });
    expect(game.state("poro").keywords).toEqual([]);
    // the models themselves are never affected
    expect(game.state("hero")).toMatchObject({ might: 2, name: "Unsung Hero" });
    expect(game.state("fiora")).toMatchObject({ might: 4, name: "Fiora, Victorious" });
    expect(game.violations()).toEqual([]);
  });

  test("(a) Angle Shot offers P1's own (unit, Equipment) pairs — including (poro, specs1) and (poro, specs2) — and costs 2", async () => {
    const game = await bothAttached();
    const pairs = game.p1.option("cast", "angle1")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(pairs).toEqual(expect.arrayContaining([["poro", "specs1"], ["poro", "specs2"]]));
    await game.p1.cast("angle1", { targets: ["poro", "specs1"] });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { order: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "angle1", controller: P1, targets: ["poro", "specs1"] })]);
  });

  // ── (b) detach #1 ─────────────────────────────────────────────────────────────────────────────────

  test("(b) Angle Shot (poro, #1) DETACHES #1: it sits unattached in P1's base with its [Equip] active again; #2 stays on the Poro; P1 drew 1", async () => {
    const game = await bothAttached();
    const hand = game.p1.hand().length;
    await angleShot(game, "angle1", "specs1");
    expect(game.zoneOf("angle1")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.state("specs1")).toMatchObject({ attachedTo: undefined, location: "base", zone: "base" });
    expect(game.state("specs2").attachedTo).toBe("poro");
    expect(game.state("poro").attachments).toEqual(["specs2"]);
    expect(game.p1.option("equipCard:-")?.fields.find((f) => f.name === "equipmentId")?.options).toEqual(["specs1"]);
  });

  // Expected: with #1 gone only #2's copy effect applies (435.1.c/.d) — the Poro is STILL 'Fiora, Victorious', 4 Might.
  // Actual: detaching either Spectacles wipes the copy entirely — the Poro reverts to printed 'Daring Poro' (2, Assault)
  // even though Spectacles #2 (→ Fiora) is still attached to it.
  test("(b) after detaching #1 the Poro is still 'Fiora, Victorious' 4 — Spectacles #2's copy effect keeps applying (435.1.d, 477.1.b)", async () => {
    const game = await bothAttached();
    await angleShot(game, "angle1", "specs1");
    expect(game.state("poro").attachments).toEqual(["specs2"]);
    expect(game.state("poro")).toMatchObject({ ...FIORA_SHAPE, ...UNTOUCHED });
    expect(game.state("poro").keywords).toEqual([]);
  });

  // ── (c) re-attach #1 → timestamp renewed → identity flips ─────────────────────────────────────────

  test("(c) re-Equipping #1 (1 + [order]) fires 'As this is attached…' again (hero | fiora offered); choosing Unsung Hero, #1 now carries the NEWEST timestamp (480.2) → order #2 then #1 → the Poro is 'Unsung Hero', 2 Might, Deathknell — the opposite of (a) on an identical board", async () => {
    const game = await bothAttached();
    await angleShot(game, "angle1", "specs1");
    await game.p1.choose("equipCard:-", { params: { equipmentId: "specs1", unitId: "poro" } });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 0 } });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "specs1" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["fiora", "hero"]);
    await game.p1.pick("hero");
    await game.settle();
    // same two gear, same two chosen models as after (t2)…
    expect([...game.state("poro").attachments].sort()).toEqual(["specs1", "specs2"]);
    expect(game.state("specs1").attachedTo).toBe("poro");
    expect(game.state("specs2").attachedTo).toBe("poro");
    // …opposite identity
    expect(game.state("poro")).toMatchObject({ ...HERO_SHAPE, ...UNTOUCHED });
    expect(game.state("poro").keywords).toEqual(["Deathknell"]);
    expect(game.violations()).toEqual([]);
  });

  test("(c) same result re-attaching #1 with a SECOND Angle Shot in attach mode (unattached #1 + Poro → attach): the choice is asked again, Unsung Hero chosen → 'Unsung Hero' 2; P1 drew 1 more", async () => {
    const game = await bothAttached();
    await angleShot(game, "angle1", "specs1");
    const hand = game.p1.hand().length;
    await game.p1.cast("angle2", { targets: ["poro", "specs1"] });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "specs1" } }); // "As this is attached" re-fires
    await game.p1.pick("hero");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.state("specs1").attachedTo).toBe("poro");
    expect([...game.state("poro").attachments].sort()).toEqual(["specs1", "specs2"]);
    expect(game.state("poro")).toMatchObject({ ...HERO_SHAPE, ...UNTOUCHED });
    expect(game.state("poro").keywords).toEqual(["Deathknell"]);
  });

  // ── (d) contrast: cycle #2 instead ────────────────────────────────────────────────────────────────

  // Expected: while #2 is detached only #1 (→ Unsung Hero) applies — the Poro is briefly 'Unsung Hero', 2, Deathknell.
  // Actual: same bug as (b) — the detach strips every copy and the Poro reads printed 'Daring Poro' (2, Assault).
  test("(d) detaching #2 instead leaves #1's copy in force — the Poro is 'Unsung Hero' 2 with Deathknell while #2 is off (435.1.d, 477.1.b)", async () => {
    const game = await bothAttached();
    await angleShot(game, "angle1", "specs2");
    expect(game.state("poro").attachments).toEqual(["specs1"]);
    expect(game.state("specs2")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.state("poro")).toMatchObject({ ...HERO_SHAPE, ...UNTOUCHED });
    expect(game.state("poro").keywords).toEqual(["Deathknell"]);
  });

  test("(d) …and re-attaching #2 (re-choosing Fiora) renews the timestamp that was ALREADY the latest → order #1 then #2 as in (a): the Poro is 'Fiora, Victorious' 4, no keywords; statuses untouched", async () => {
    const game = await bothAttached();
    await angleShot(game, "angle1", "specs2");
    await angleShot(game, "angle2", "specs2", "fiora");
    expect(game.state("specs2").attachedTo).toBe("poro");
    expect([...game.state("poro").attachments].sort()).toEqual(["specs1", "specs2"]);
    expect(game.state("poro")).toMatchObject({ ...FIORA_SHAPE, ...UNTOUCHED });
    expect(game.state("poro").keywords).toEqual([]);
    expect(game.p1.trash().sort()).toEqual(["angle1", "angle2"]);
    expect(game.violations()).toEqual([]);
  });
});

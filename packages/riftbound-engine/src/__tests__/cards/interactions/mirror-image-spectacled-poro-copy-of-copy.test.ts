/**
 * Interaction: Mirror Image (unl-200-219 · Spell · Mind/Order · 3 + [C][C] · Action) "Choose a unit. Play a ready Reflection
 *     unit token to your base. It becomes a copy of that unit. Give it [Temporary]."
 *   × Shady Spectacles (ven-137-166 · Gear/Equipment · Order · 4 · +0) "[Equip] [1][order]. As this is attached to a unit,
 *     choose another friendly unit. The equipped unit becomes a copy of that unit for as long as this is attached to it."
 *   × Angle Shot (sfd-011-221 · Spell · Fury · 2 · Reaction) "Choose a unit and an Equipment with the same controller.
 *     Attach that Equipment to that unit or detach that Equipment from that unit. Draw 1."
 *   with Daring Poro (ogn-210-298 · Order · 2 · 2 Might · Poro · [Assault]) as the HOLDER and Ruined Rex (unl-067-219 ·
 *   Mind · 6+[mind] · 6 Might · [Deathknell] Deal 4 to an enemy unit) as the MODEL, both P1's, in base.
 *
 * Question: P1's exhausted Daring Poro wears Shady Spectacles copying Ruined Rex (so it reads 'Ruined Rex' 6) and has
 * 2 damage. P1 casts Mirror Image choosing the Spectacled Poro.
 *   (a) What is the Reflection — a copy of the Poro's PRINTED card or of its currently-COPIED values? Name, domain, cost,
 *       Might, tags, text/keywords, Temporary, ready state, damage, equipped-status, location, token-ness, controller.
 *   (b) P2 then Angle-Shots (Poro, Spectacles) in detach mode (as a Reaction on a chain P1 opened). The Poro reverts —
 *       does the Reflection revert too?
 *   (c) 206 probe: after (b), what cost does each of Poro / Reflection / real Rex have?
 *   (d) NO-side contrast: Mirror Image on the Poro BEFORE the Spectacles — what is the Reflection, and does equipping
 *       the Spectacles afterwards change it?
 *
 * Rules: 477.1.b.1 / .1.a / .1.b (a copy takes the target's CURRENT copyable traits — for an object that is itself a copy,
 * the copied ones), 477.2.a (granted keywords sit in layer 2 on top of the copy), 185.1.a (a token stays a token),
 * 185.3.a.2 (a token copying a card takes that card's cost), 206 / 356.1.c (cost = printed or copied), 435.1.c / 435.1.d
 * (detaching ends "for as long as this is attached"), 184.1 / 182 / 183 (statuses — damage, exhaustion, attachments —
 * belong to the object, are not copyable traits).
 *
 * Expected: (a) Reflection = 'Ruined Rex': unit, Mind, 6 + [mind], base/current 6, no tags, Deathknell, NO Assault, plus a
 * GRANTED Temporary; READY, 0 damage, nothing attached, in P1's base, a token, owned+controlled by P1. The Poro is
 * unchanged (still 'Ruined Rex' 6, exhausted, 2 damage, wearing the Spectacles). (b) Detach → the Poro is Daring Poro
 * again (Order, 2, 2 Might, Poro, Assault) keeping exhaustion and its 2 damage — 2 ≥ 2, so it dies at the next Cleanup
 * (printed self in the trash; Spectacles loose in base); the Reflection does NOT change (one-shot copy, values locked).
 * (c) Poro 2 / no power; Reflection 6 + [mind]; Rex 6 + [mind]. (d) Reflection = 'Daring Poro', Order, 2, 2 Might, Poro,
 * Assault + Temporary, ready, undamaged; equipping the Spectacles on the Poro afterwards leaves that Reflection as is.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
// Read-only peek at copyable TAGS (477.1.b.1.a) — CardState does not surface tags.
import { getGlobalCardRegistry } from "../../../operations/card-lookup";

const MIRROR_IMAGE = "unl-200-219";
const SHADY_SPECTACLES = "ven-137-166";
const ANGLE_SHOT = "sfd-011-221";
const DARING_PORO = "ogn-210-298";
const RUINED_REX = "unl-067-219";

/** Inline 0-cost "Deal 2 to a unit." — puts the 2 damage on the (by then 6-Might) Spectacled Poro through the real pipeline. */
const ZAP = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Zap",
  timing: "action",
};
/** Inline 0-cost "Draw 1." — P1 opens a chain with it so P2 gets priority to react with Angle Shot on P1's turn. */
const NUDGE = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Nudge",
  timing: "action",
};

function tagsOf(card: string): readonly string[] {
  return getGlobalCardRegistry().get(card)?.tags ?? [];
}

/**
 * P1's turn 2. P1: EXHAUSTED Daring Poro + Ruined Rex in base, loose Shady Spectacles, Mirror Image / Zap / Nudge in hand,
 * 4 energy + 2 order + 2 mind (Equip 1+[order], Mirror Image 3+[C][C]). P2: a 3-Might unit in base, Angle Shot in hand,
 * 2 energy + 1 fury.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { mind: 2, order: 2 } })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", DARING_PORO, "poro", { exhausted: true })
    .unit(P1, "base", RUINED_REX, "rex")
    .unit(P2, "base", { might: 3, name: "Enemy" }, "enemy")
    .gear(P1, SHADY_SPECTACLES, "specs")
    .hand(P1, MIRROR_IMAGE, "mirror")
    .hand(P1, ZAP, "zap")
    .hand(P1, NUDGE, "nudge")
    .hand(P2, ANGLE_SHOT, "angle");
}

/** [Equip] the Spectacles onto the Poro, choosing Ruined Rex as the model (auto-bound when Rex is the only other friendly unit). */
async function spectaclesOnPoroCopyingRex(game: Game): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: "poro" } });
  for (let i = 0; i < 4; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason === "unanswered" && d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("rex");
      continue;
    }
    break;
  }
  expect(game.state("specs").attachedTo).toBe("poro");
  expect(game.state("poro").name).toBe("Ruined Rex");
}

/** Premise: Spectacled Poro reading 'Ruined Rex' 6, exhausted, 2 damage. */
async function spectacledDamagedPoro(): Promise<Game> {
  const game = await board().build();
  await spectaclesOnPoroCopyingRex(game);
  await game.p1.cast("zap", { targets: "poro" });
  await game.settle();
  expect(game.state("poro")).toMatchObject({ damage: 2, isExhausted: true, might: 6, name: "Ruined Rex", zone: "base" });
  return game;
}

/** Cast Mirror Image choosing `target`; returns the new Reflection's id. */
async function mirror(game: Game, target: string): Promise<string> {
  const before = game.p1.base();
  await game.p1.cast("mirror", { targets: target });
  await game.settle();
  expect(game.zoneOf("mirror")).toBe("trash");
  const token = game.p1.base().find((id) => !before.includes(id));
  expect(token).toBeDefined();
  return token as string;
}

/** P1 opens a chain with Nudge and passes; P2 reacts with Angle Shot (Poro, Spectacles) → detach; everything resolves. */
async function p2AngleShotsDetach(game: Game): Promise<void> {
  await game.p1.cast("nudge");
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "angle")).toBe(true);
  await game.p2.cast("angle", { targets: ["poro", "specs"] });
  await game.settle();
}

describe("Mirror Image on a Shady-Spectacled Daring Poro (copying Ruined Rex) — a copy of a copy, then Angle Shot detaches", () => {
  test("premise: after [Equip] + Zap the Poro reads 'Ruined Rex' — Mind, 6 + [mind], 6 Might, Deathknell, no Assault, no Poro tag — and is exhausted with 2 damage, wearing the Spectacles; the real Rex is untouched", async () => {
    const game = await spectacledDamagedPoro();
    const p = game.state("poro");
    expect(p).toMatchObject({ attachments: ["specs"], baseMight: 6, damage: 2, domains: ["mind"], energyCost: 6, isExhausted: true, isToken: false, might: 6, name: "Ruined Rex", powerCost: ["mind"] });
    expect(p.keywords).toContain("Deathknell");
    expect(p.keywords).not.toContain("Assault");
    expect(tagsOf("poro")).toEqual([]);
    expect(game.state("rex")).toMatchObject({ attachments: [], damage: 0, isReady: true, might: 6, name: "Ruined Rex" });
    expect(game.violations()).toEqual([]);
  });

  // ================================================================== (a)
  test("(a) Mirror Image offers the Spectacled Poro like any unit; the Reflection copies its CURRENT copyable traits (477.1.b.1.b): name 'Ruined Rex', unit, Mind, cost 6 + [mind] (185.3.a.2), base & current Might 6, no tags, Deathknell — and NO Assault", async () => {
    const game = await spectacledDamagedPoro();
    const offered = (game.p1.option("cast", "mirror")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect(offered).toEqual(expect.arrayContaining(["poro", "rex", "enemy"]));
    const refl = await mirror(game, "poro");
    const s = game.state(refl);
    expect(s).toMatchObject({ baseMight: 6, cardType: "unit", domains: ["mind"], energyCost: 6, might: 6, name: "Ruined Rex", powerCost: ["mind"] });
    expect(s.keywords).toContain("Deathknell");
    expect(s.keywords).not.toContain("Assault");
    expect(tagsOf(refl)).toEqual([]); // neither Poro (printed on the holder) nor anything else
  });

  test("(a) …plus a GRANTED [Temporary] layered on top of the copy (477.2.a) — a grant, not a copied trait", async () => {
    const game = await spectacledDamagedPoro();
    const refl = await mirror(game, "poro");
    expect(game.state(refl).keywords).toContain("Temporary");
    expect(game.state(refl).grantedKeywords).toEqual([expect.objectContaining({ keyword: "Temporary" })]);
    expect(game.state("poro").keywords).not.toContain("Temporary"); // the source got nothing
  });

  test("(a) the Reflection's STATE is its own, not copied (182–184): READY (Mirror Image says ready), 0 damage, nothing attached, in P1's BASE, a TOKEN (185.1.a), owned and controlled by P1", async () => {
    const game = await spectacledDamagedPoro();
    const refl = await mirror(game, "poro");
    expect(game.state(refl)).toMatchObject({
      attachedTo: undefined,
      attachments: [],
      controller: P1,
      damage: 0,
      isExhausted: false,
      isReady: true,
      isToken: true,
      location: "base",
      owner: P1,
      zone: "base",
    });
    expect(game.state("specs").attachedTo).toBe("poro"); // the Spectacles are still on the Poro, not on the token
  });

  test("(a) being copied changes nothing about the Poro: still 'Ruined Rex' 6, exhausted, 2 damage, wearing the Spectacles; Mirror Image → trash, chain empty, back to P1's main phase", async () => {
    const game = await spectacledDamagedPoro();
    await mirror(game, "poro");
    expect(game.state("poro")).toMatchObject({ attachments: ["specs"], damage: 2, isExhausted: true, might: 6, name: "Ruined Rex", zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ================================================================== (b)
  test("(b) P2 reacts with Angle Shot choosing (Poro, Spectacles) — same controller, already attached → DETACH; Angle Shot resolves (P2 draws 1, spell to P2's trash) and the Spectacles sit loose in P1's base (435.1.c/d)", async () => {
    const game = await spectacledDamagedPoro();
    await mirror(game, "poro");
    const p2Hand = game.p2.hand().length; // includes Angle Shot
    await p2AngleShotsDetach(game);
    expect(game.zoneOf("angle")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
    expect(game.state("specs")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b) the Poro REVERTS to its printed self — Daring Poro, Order, cost 2, 2 Might, Poro, [Assault], no Deathknell — and, keeping its 2 damage (2 ≥ 2), is killed at the very next Cleanup: it is in P1's trash as printed Daring Poro", async () => {
    const game = await spectacledDamagedPoro();
    await mirror(game, "poro");
    await p2AngleShotsDetach(game);
    expect(game.zoneOf("poro")).toBe("trash");
    const p = game.state("poro");
    expect(p).toMatchObject({ attachments: [], baseMight: 2, domains: ["order"], energyCost: 2, might: 2, name: "Daring Poro", powerCost: [] });
    expect(p.keywords).toContain("Assault");
    expect(p.keywords).not.toContain("Deathknell");
    expect(tagsOf("poro")).toEqual(["Poro"]);
    // It died as Daring Poro (no Deathknell of its own) — nobody took 4: P2's Enemy is untouched.
    expect(game.state("enemy")).toMatchObject({ damage: 0, zone: "base" });
  });

  test("(b) the Reflection does NOT revert — Mirror Image's copy was a one-shot whose values were locked at resolution: still 'Ruined Rex', Mind, 6 + [mind], 6 Might, Deathknell + granted Temporary, ready, undamaged, in base", async () => {
    const game = await spectacledDamagedPoro();
    const refl = await mirror(game, "poro");
    await p2AngleShotsDetach(game);
    const s = game.state(refl);
    expect(s).toMatchObject({ baseMight: 6, damage: 0, domains: ["mind"], energyCost: 6, isReady: true, isToken: true, might: 6, name: "Ruined Rex", powerCost: ["mind"], zone: "base" });
    expect(s.keywords).toEqual(expect.arrayContaining(["Deathknell", "Temporary"]));
    expect(s.keywords).not.toContain("Assault");
    expect(tagsOf(refl)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ================================================================== (c) 206 probe
  test("(c) 206 / 356.1.c — cost after (b): the Poro card is its printed 2 (no power); the Reflection its COPIED 6 + [mind]; the real Rex its printed 6 + [mind]", async () => {
    const game = await spectacledDamagedPoro();
    const refl = await mirror(game, "poro");
    await p2AngleShotsDetach(game);
    expect(game.state("poro")).toMatchObject({ energyCost: 2, powerCost: [] });
    expect(game.state(refl)).toMatchObject({ energyCost: 6, powerCost: ["mind"] });
    expect(game.state("rex")).toMatchObject({ energyCost: 6, powerCost: ["mind"] });
  });

  // ================================================================== (d) NO-side contrast
  test("(d) contrast: Mirror Image on the Poro BEFORE any Spectacles → the Reflection is printed 'Daring Poro': Order, cost 2, 2 Might, Poro, [Assault] + granted Temporary, READY (although the Poro is exhausted), undamaged, a token in P1's base", async () => {
    const game = await board().build();
    expect(game.state("poro")).toMatchObject({ isExhausted: true, name: "Daring Poro" });
    const refl = await mirror(game, "poro");
    const s = game.state(refl);
    expect(s).toMatchObject({ baseMight: 2, controller: P1, damage: 0, domains: ["order"], energyCost: 2, isReady: true, isToken: true, might: 2, name: "Daring Poro", powerCost: [], zone: "base" });
    expect(s.keywords).toEqual(expect.arrayContaining(["Assault", "Temporary"]));
    expect(s.keywords).not.toContain("Deathknell");
    expect(s.grantedKeywords).toEqual([expect.objectContaining({ keyword: "Temporary" })]);
    expect(tagsOf(refl)).toEqual(["Poro"]);
  });

  test("(d) …equipping the Spectacles on the Poro AFTERWARDS (the Reflection is now also offered as 'another friendly unit'; P1 picks Rex) turns the Poro into 'Ruined Rex' 6 but does NOT retroactively change that Reflection — still 'Daring Poro' 2 with Assault + Temporary", async () => {
    const game = await board().build();
    const refl = await mirror(game, "poro");
    await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: "poro" } });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered"); // two other friendly units now → a real choice
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["rex", refl].sort()); // "another": never the Poro itself
    await game.p1.pick("rex");
    await game.settle();
    expect(game.state("specs").attachedTo).toBe("poro");
    expect(game.state("poro")).toMatchObject({ might: 6, name: "Ruined Rex" });
    const s = game.state(refl);
    expect(s).toMatchObject({ baseMight: 2, energyCost: 2, might: 2, name: "Daring Poro" });
    expect(s.keywords).toEqual(expect.arrayContaining(["Assault", "Temporary"]));
    expect(s.keywords).not.toContain("Deathknell");
    expect(game.violations()).toEqual([]);
  });
});

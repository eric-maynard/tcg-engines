/**
 * Interaction: Stalwart Poro (ogn-052-298) · Unit · Calm · 2 · 2 Might · "[Shield] (+1 [Might] while I'm a defender.)"
 *   × Fortified Position (ogn-279-298) · Battlefield · "When you defend here, choose a unit. It gains [Shield 2]
 *     this combat. (+2 [Might] while it's a defender.)"                                          — P2 controls it
 *   × Incinerate (ogs-003-024) · Spell · Fury · 2 · "[Action] Deal 2 to a unit at a battlefield."   — P1, mid-showdown
 *   with Shipyard Skulker (ogn-175-298, 3, vanilla) as the second defender and Playful Phantom (ogn-049-298, 5,
 *   vanilla) as P1's lone attacker.
 *
 * Rules: 814.1.b.3 (Shield with X omitted = 1), 814.1.c (Shield X = "+X Might while I am a defender"), 814.1.d.1
 * (lasts as long as the Defender designation), 814.2 (multiple Shields SUM), 814.3 (Shield is a characteristic),
 * 465.2.c.3 (lethal in full before moving on), 465.2.c.4 (no over-assignment while others remain; ALREADY-MARKED
 * damage counts toward lethal), 465.2.c.7 (same priority → any order), 466.1.a (Combat Cleanup heals survivors).
 *
 * Question: FP's defend trigger chooses the Poro. (a) Poro's Shield value / Might this combat? (b) P1 (Focus)
 * Incinerates the Poro mid-showdown — is Shield "used up", does Poro die, and what minimum does the assignment
 * Decision then demand for Poro? Enumerate P1's legal 5-damage lines and outcomes. (c) Contrast: FP chose the
 * Skulker. (d) A surviving Poro's Might after combat?
 * Expected: (a) Shield 1 + 2 = 3 → 5 Might. (b) Shield is only +Might: 2 marked on a 5-Might Poro, alive, still 5;
 * lethal-at = 3 for Poro (5 − 2), 3 for Skulker; legal {Poro 3, Skulker 2} or {Skulker 3, Poro 2}; illegal {Poro 5}
 * and {Poro 2, Skulker 3}-starting-with-Poro… (i.e. 1/1-style non-lethal splits); defenders' 5 + 3 = 8 kills the
 * Phantom either way, P2 keeps the field. (c) Poro = 3 (Shield 1), lethal-at 1 after Incinerate; Skulker = 5,
 * lethal-at 5. (d) Poro reads 2 again (printed Shield dormant, the combat grant gone).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STALWART_PORO = "ogn-052-298";
const FORTIFIED_POSITION = "ogn-279-298";
const INCINERATE = "ogs-003-024";
const SHIPYARD_SKULKER = "ogn-175-298";
const PLAYFUL_PHANTOM = "ogn-049-298";

/** P1's turn. P2 controls a live Fortified Position with Poro + Skulker on it; P1: Phantom in base, Incinerate in hand, exactly 2 energy. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("fp", { controller: P2, def: FORTIFIED_POSITION, inert: false, owner: P2 })
    .unit(P2, "fp", STALWART_PORO, "poro")
    .unit(P2, "fp", SHIPYARD_SKULKER, "skulker")
    .unit(P1, "base", PLAYFUL_PHANTOM, "phantom")
    .hand(P1, INCINERATE, "incinerate");
}

/** Phantom attacks; FP's defend trigger targets `chosen`; the trigger resolves (P2 then P1 pass priority). Showdown open, P1 has Focus. */
async function attackWithFpOn(chosen: "poro" | "skulker"): Promise<Game> {
  const game = await board().build();
  await game.p1.move("phantom", "fp");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fp", controller: P2, triggered: true })]);
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "fp" } });
  await game.p2.pick(chosen);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** …then P1 (holding Focus) Incinerates the Poro and it resolves (P1 then P2 pass priority). Showdown still open. */
async function incineratePoro(game: Game): Promise<void> {
  await game.p1.cast("incinerate", { targets: "poro" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "incinerate", controller: P1 })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("incinerate")).toBe("trash");
}

/** Pass Focus for whoever holds it until the combat-damage assignment (or anything that is not a pass) surfaces. */
async function passFocusToDamageStep(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "showdown" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("(a) FP chooses the Poro: printed Shield (1) + granted Shield 2 sum to Shield 3 → 5 Might while defending", () => {
  test("before combat the Poro reads its printed 2 (Shield is dormant off-defence, 814.1.c) and carries the Shield keyword (814.3)", async () => {
    const game = await board().build();
    expect(game.state("poro")).toMatchObject({ baseMight: 2, combatRole: null, might: 2 });
    expect(game.state("poro").keywords).toContain("Shield");
    expect(game.state("poro").grantedKeywords).toEqual([]);
  });

  test("after FP's trigger resolves on the Poro: it is a defender with a 'combat'-duration Shield 2 grant and reads 2 + 1 + 2 = 5 Might (814.1.b.3 + 814.2)", async () => {
    const game = await attackWithFpOn("poro");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("poro").grantedKeywords).toEqual([{ duration: "combat", keyword: "Shield", value: 2 }]);
    expect(game.state("poro").might).toBe(5);
    // The un-chosen Skulker is a plain 3; the attacker is 5.
    expect(game.state("skulker")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("phantom")).toMatchObject({ combatRole: "attacker", might: 5 });
  });
});

describe("(b) Incinerate on the 5-Might Poro mid-showdown: Shield is not a damage pool", () => {
  test("Incinerate is castable by P1 in the showdown for exactly 2 energy and offers both defenders (and the attacker) — all are 'at a battlefield'", async () => {
    const game = await attackWithFpOn("poro");
    expect(game.p1.can("cast", "incinerate")).toBe(true);
    const field = game.p1.option("cast", "incinerate")?.fields.find((f) => f.name === "targets");
    expect(new Set((field?.options ?? []).flat() as string[])).toEqual(new Set(["poro", "skulker", "phantom"]));
  });

  test("it resolves: 2 damage is MARKED on the Poro, which stays at 5 Might (Shield 3 intact, not 'consumed') and does not die (2 < 5); P1's pool is 0", async () => {
    const game = await attackWithFpOn("poro");
    await incineratePoro(game);
    expect(game.zoneOf("poro")).toBe("battlefield-fp");
    expect(game.state("poro")).toMatchObject({ damage: 2, might: 5 });
    expect(game.state("poro").grantedKeywords).toEqual([{ duration: "combat", keyword: "Shield", value: 2 }]);
    expect(game.p1.energy()).toBe(0);
  });

  test("both players pass Focus → P1 gets a `distribute` Decision for 5 with NO ordering constraint; Poro's lethal threshold is 3 (5 Might − 2 marked, 465.2.c.4), Skulker's is 3", async () => {
    const game = await attackWithFpOn("poro");
    await incineratePoro(game);
    await passFocusToDamageStep(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
    const buckets = d?.kind === "distribute" ? d.buckets : [];
    expect(buckets.map((b) => b.key).sort()).toEqual(["poro", "skulker"]);
    expect(buckets.find((b) => b.key === "poro")).toMatchObject({ lethal: 3, min: 0 });
    expect(buckets.find((b) => b.key === "poro")?.lethal).not.toBe(5);
    expect(buckets.find((b) => b.key === "skulker")).toMatchObject({ lethal: 3, min: 0 });
  });

  test("illegal lines are refused: {Poro 5} over-assigns while the Skulker is unassigned (465.2.c.4); {Poro 2, Skulker 2}-ish non-lethal splits and {Poro 4, Skulker 1} are refused (465.2.c.3/.4)", async () => {
    const game = await attackWithFpOn("poro");
    await incineratePoro(game);
    await passFocusToDamageStep(game);
    expect(game.decision()?.kind).toBe("distribute");
    expect((await game.p1.try((p) => p.distribute({ poro: 5, skulker: 0 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ poro: 4, skulker: 1 }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.distribute({ poro: 2, skulker: 2 }))).ok).toBe(false); // 1 unassigned / nobody lethal first
    expect((await game.p1.try((p) => p.distribute({ poro: 1, skulker: 4 }))).ok).toBe(false); // over-assign on Skulker while Poro not lethal
    expect(game.decision()?.kind).toBe("distribute"); // still asking
  });

  test("legal line 1 — {Poro 3, Skulker 2}: Poro reaches 5/5 and dies, Skulker (2/3) survives healed; the defenders' 5 + 3 = 8 kills the Phantom; P2 keeps Fortified Position, nobody scores", async () => {
    const game = await attackWithFpOn("poro");
    await incineratePoro(game);
    await passFocusToDamageStep(game);
    await game.p1.distribute({ poro: 3, skulker: 2 });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("skulker")).toMatchObject({ damage: 0, zone: "battlefield-fp" });
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.gameState.battlefields.fp?.controller).toBe(P2);
    expect(game.gameState.battlefields.fp?.contested).toBe(false);
    expect(game.p1.points() + game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("legal line 2 — {Skulker 3, Poro 2}: Skulker dies; Poro ends at 4 marked vs 5 Might → survives the Cleanup and is healed to 0; Phantom still dies to 8; P2 keeps the field", async () => {
    const game = await attackWithFpOn("poro");
    await incineratePoro(game);
    await passFocusToDamageStep(game);
    await game.p1.distribute({ poro: 2, skulker: 3 });
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ damage: 0, zone: "battlefield-fp" });
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.gameState.battlefields.fp?.controller).toBe(P2);
    expect(game.p2.units("fp")).toEqual(["poro"]);
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("without Incinerate the Poro's threshold is the full 5 (nothing marked): legal {Poro 5} or {Skulker 3, Poro 2}; {Poro 3, Skulker 2} is now refused", async () => {
    const game = await attackWithFpOn("poro");
    await passFocusToDamageStep(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
    const buckets = d?.kind === "distribute" ? d.buckets : [];
    expect(buckets.find((b) => b.key === "poro")?.lethal).toBe(5);
    expect(buckets.find((b) => b.key === "skulker")?.lethal).toBe(3);
    expect((await game.p1.try((p) => p.distribute({ poro: 3, skulker: 2 }))).ok).toBe(false);
    await game.p1.distribute({ poro: 5, skulker: 0 });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("battlefield-fp");
    expect(game.zoneOf("phantom")).toBe("trash");
  });
});

describe("(c) contrast — FP chose the Skulker instead", () => {
  test("Poro defends with only its printed Shield 1 → 3 Might; Skulker has Shield 2 → 5 Might", async () => {
    const game = await attackWithFpOn("skulker");
    expect(game.state("poro")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("poro").grantedKeywords).toEqual([]);
    expect(game.state("skulker")).toMatchObject({ combatRole: "defender", might: 5 });
    expect(game.state("skulker").grantedKeywords).toEqual([{ duration: "combat", keyword: "Shield", value: 2 }]);
  });

  test("after the same Incinerate (2 marked on a 3-Might Poro — it lives), the assignment shows Poro lethal-at 1 and Skulker lethal-at 5", async () => {
    const game = await attackWithFpOn("skulker");
    await incineratePoro(game);
    expect(game.state("poro")).toMatchObject({ damage: 2, might: 3, zone: "battlefield-fp" });
    await passFocusToDamageStep(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
    const buckets = d?.kind === "distribute" ? d.buckets : [];
    expect(buckets.find((b) => b.key === "poro")).toMatchObject({ lethal: 1 });
    expect(buckets.find((b) => b.key === "skulker")).toMatchObject({ lethal: 5 });
  });

  test("legal {Poro 1, Skulker 4 (the rest, non-lethal)}: Poro dies, Skulker survives healed; legal {Skulker 5}: Skulker dies, Poro survives healed — Phantom dies to 3 + 5 = 8 in both", async () => {
    const a = await attackWithFpOn("skulker");
    await incineratePoro(a);
    await passFocusToDamageStep(a);
    expect((await a.p1.try((p) => p.distribute({ poro: 2, skulker: 3 }))).ok).toBe(false); // over-assign on Poro (lethal at 1) while Skulker remains
    await a.p1.distribute({ poro: 1, skulker: 4 });
    await a.settle();
    expect(a.zoneOf("poro")).toBe("trash");
    expect(a.state("skulker")).toMatchObject({ damage: 0, zone: "battlefield-fp" });
    expect(a.zoneOf("phantom")).toBe("trash");
    expect(a.gameState.battlefields.fp?.controller).toBe(P2);

    const b = await attackWithFpOn("skulker");
    await incineratePoro(b);
    await passFocusToDamageStep(b);
    await b.p1.distribute({ poro: 0, skulker: 5 });
    await b.settle();
    expect(b.zoneOf("skulker")).toBe("trash");
    expect(b.state("poro")).toMatchObject({ damage: 0, zone: "battlefield-fp" });
    expect(b.zoneOf("phantom")).toBe("trash");
    expect(b.gameState.battlefields.fp?.controller).toBe(P2);
  });
});

describe("(d) after combat: a surviving Poro reads its printed 2 again", () => {
  test("Poro survives line 2 ({Skulker 3, Poro 2}): no longer a defender, healed, and back to Might 2 — printed Shield dormant (814.1.c), still HAS Shield (814.3), and the 'this combat' Shield 2 grant is gone (814.1.d.1)", async () => {
    const game = await attackWithFpOn("poro");
    await incineratePoro(game);
    await passFocusToDamageStep(game);
    await game.p1.distribute({ poro: 2, skulker: 3 });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("poro")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-fp" });
    expect(game.state("poro").keywords).toContain("Shield");
    expect(game.state("poro").might).toBe(2);
    expect(game.state("poro").grantedKeywords).toEqual([]);
  });
});

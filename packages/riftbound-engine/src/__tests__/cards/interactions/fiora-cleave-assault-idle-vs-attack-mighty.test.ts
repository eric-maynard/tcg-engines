/**
 * Interaction: Fiora, Victorious (ogn-232-298) · Champion Unit · Order · 4 · 4 Might
 *     "While I'm [Mighty], I have [Deflect], [Ganking], and [Shield]. (I'm Mighty while I have 5+ [Might].)"
 *   × Cleave (ogn-004-298) · Spell · Fury · 1 · Action — "Give a unit [Assault 3] this turn."
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1 + [fury] · Action — "Deal 3 to a unit at a battlefield."
 *   (+ an inline vanilla 4-Might "Vanguard Sergeant" holding P2's bf1, and a 1-Might P1 scout whose only
 *    job is to open a showdown elsewhere so P2 gets a window to Ray an IDLE Fiora.)
 *
 * Question: P1 casts Cleave ([Assault 3] this turn) on Fiora.
 *   (a) Fiora sits at a friendly battlefield and never attacks: Assault value, Might, Mighty?, Deflect /
 *       Ganking (bf→bf move legal? must P2 pay extra to Ray her?), and what happens to the grant at end
 *       of turn?
 *   (b) Instead she attacks bf1 (Vanguard Sergeant 4): Might as attacker, Mighty?, and when P2 (after
 *       Focus passes) Rays her — what does it cost and does she survive combat? Does Shield add anything
 *       while attacking? And if P2 skips the Ray?
 *   (c) Control: the same attack without Cleave — Ray's cost and outcome.
 *
 * Rules: 807.1.c / 807.1.d / 807.1.d.1 (Assault = +X Might only WHILE holding the Attacker designation),
 * 807.2, 807.3 (Assault is a characteristic even when it grants nothing), 809.1.c / 809.1.d (Deflect =
 * mandatory +1 Power of any domain for an opponent's spell that chooses her), 810 (Ganking adds the
 * bf→bf option to the Standard Move), 814.1.c (Shield = +X only while a DEFENDER), 465.2.c.4 (lethal
 * counts marked damage), 466.7.a (designations removed after combat), 317.2.c ("this turn" expires in
 * the Expiration step).
 *
 * Expected: (a) Assault 3 granted, Might 4, not Mighty, no Deflect/Ganking/Shield: bf→bf move illegal, Ray
 * costs P2 exactly 1 + [fury]; grant gone after the turn ends. (b) Attacker → 4+3 = 7 → Mighty → Deflect,
 * Ganking, Shield on (Shield dormant while attacking → stays 7). Ray at her costs 1 + [fury] + 1 any-domain
 * power (unaffordable without the spare pip); 3 marked on 7 → lives; damage step: 7 into Sergeant (dies),
 * Sergeant's 4 onto Fiora → 3+4 = 7 ≥ 7 → Fiora ALSO dies; nobody conquers. Without the Ray: she takes
 * 4 < 7, conquers (+1), then drops back to 4 / not Mighty / keywords off with Assault 3 still granted until
 * end of turn. (c) No Cleave: attacks at 4, never Mighty → no surcharge (spare pip untouched); Ray alone
 * (3 < 4) doesn't kill her, Ray 3 + Sergeant 4 does; Sergeant takes 4 and dies too.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA = "ogn-232-298";
const CLEAVE = "ogn-004-298";
const HEXTECH_RAY = "ogn-009-298";
const GRANTED = ["Deflect", "Ganking", "Shield"];

type Pool = { energy: number; power: Record<string, number> };
/** Ray's printed 1 + [fury] plus ONE spare off-domain pip for a possible Deflect surcharge. */
const RAY_WITH_SPARE: Pool = { energy: 1, power: { calm: 1, fury: 1 } };
const RAY_EXACT: Pool = { energy: 1, power: { fury: 1 } };

function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/**
 * P1's turn. P1 controls bfHome; P2 holds bf1 with Vanguard Sergeant (4); bf2 is empty/uncontrolled.
 * Fiora is READY at `fioraAt`; a 1-Might P1 scout idles in base. P1: 1 energy + Cleave. P2: Ray + pool.
 */
function board(fioraAt: "base" | "bfHome", p2Pool: Pool = RAY_WITH_SPARE) {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, p2Pool)
    .battlefield("bfHome", { controller: P1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2")
    .unit(P1, fioraAt, FIORA, "fiora")
    .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
    .unit(P2, "bf1", { might: 4, name: "Vanguard Sergeant" }, "sergeant")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, HEXTECH_RAY, "ray");
}

async function cleaveFiora(game: Game): Promise<void> {
  await game.p1.cast("cleave", { targets: "fiora" });
  await game.settle();
  expect(game.zoneOf("cleave")).toBe("trash");
  expect(game.state("fiora").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
}

/** Pass priority around until the chain is empty (whoever holds it passes). */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

const hasAnyGranted = (game: Game) => GRANTED.some((k) => game.state("fiora").keywords.includes(k));

describe("Fiora, Victorious × Cleave × Hextech Ray — Assault idle vs attacking, Mighty keywords mid-combat", () => {
  // ── (a) Cleaved but never an attacker ─────────────────────────────────────────────────────────
  test("(a) idle at a friendly battlefield after Cleave: Assault 3 is a characteristic (807.3) but grants no Might out of combat → 4 Might, not Mighty, no Deflect/Ganking/Shield", async () => {
    const game = await board("bfHome").build();
    await cleaveFiora(game);
    expect(game.state("fiora")).toMatchObject({ baseMight: 4, combatRole: null, might: 4 });
    expect(game.state("fiora").keywords).toContain("Assault");
    expect(hasAnyGranted(game)).toBe(false);
  });

  test("(a) no Ganking at 4 Might: a battlefield→battlefield move (bfHome → bf2 or → bf1) is not offered and is rejected; she stays put, ready", async () => {
    const game = await board("bfHome").build();
    await cleaveFiora(game);
    expect(game.p1.can("gank", "fiora")).toBe(false);
    expect((await game.p1.try((p) => p.gank("fiora", "bf2"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.move("fiora", "bf2"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.move("fiora", "bf1"))).ok).toBe(false);
    expect(game.locationOf("fiora")).toBe("bfHome");
    expect(game.state("fiora").isReady).toBe(true);
  });

  test("(a) no Deflect at 4 Might: in a showdown opened elsewhere (scout attacks bf1) P2 Rays the idle Fiora for exactly 1 + [fury] — the spare pip is untouched; 3 < 4 so she lives", async () => {
    const game = await board("bfHome").build();
    await cleaveFiora(game);
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("fiora").combatRole).toBe(null); // she is not in this combat
    await game.p1.passFocus();
    expect(targetsOffered(game, "p2", "ray")).toEqual(["fiora", "scout", "sergeant"].sort());
    await game.p2.cast("ray", { targets: "fiora" });
    expect(game.p2.resources()).toMatchObject({ energy: 0, power: { calm: 1, fury: 0 } });
    await game.settle();
    expect(game.state("fiora")).toMatchObject({ might: 4, zone: "battlefield-bfHome" });
    expect(game.zoneOf("scout")).toBe("trash"); // 1 into 4: the scout dies, Sergeant holds
    expect(game.zoneOf("sergeant")).toBe("battlefield-bf1");
  });

  test("(a) with only Ray's printed 1 + [fury] P2 can STILL choose the idle 4-Might Fiora (no surcharge owed)", async () => {
    const game = await board("bfHome", RAY_EXACT).build();
    await cleaveFiora(game);
    await game.p1.move("scout", "bf1");
    await game.p1.passFocus();
    expect(targetsOffered(game, "p2", "ray")).toContain("fiora");
    await game.p2.cast("ray", { targets: "fiora" });
    expect(game.p2.resources()).toMatchObject({ energy: 0, power: { fury: 0 } });
  });

  test("(a) never an attacker → the 'this turn' Assault simply expires in the Expiration step having never changed her Might (317.2.c)", async () => {
    const game = await board("bfHome").build();
    await cleaveFiora(game);
    await game.advanceTurn();
    expect(game.state("fiora").grantedKeywords).toEqual([]);
    expect(game.state("fiora").keywords).not.toContain("Assault");
    expect(game.state("fiora").might).toBe(4);
    expect(game.trace().expiration.flatMap((p) => p.expired)).toEqual(expect.arrayContaining([expect.stringContaining("fiora")]));
  });

  // ── (b) Cleaved and attacking ─────────────────────────────────────────────────────────────────
  test("(b) on gaining Attacker at bf1 she is 4+3 = 7 (Shield, even if on, is dormant while attacking — 7 not 8); Sergeant is the 4-Might defender; nothing goes on the chain", async () => {
    const game = await board("base").build();
    await cleaveFiora(game);
    expect(game.state("fiora").might).toBe(4);
    await game.p1.move("fiora", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("fiora")).toMatchObject({ combatRole: "attacker", might: 7 });
    expect(game.state("sergeant")).toMatchObject({ combatRole: "defender", might: 4 });
    expect(game.chain()).toEqual([]); // no trigger — a static flipping on
    await game.p1.passFocus();
    expect(game.state("fiora").might).toBe(7); // still 7 with Focus on P2
  });

  // rule 807.1.c / 476.3 — Assault's +3 is real Might while she holds Attacker, so at 7 she is Mighty and
  // "While I'm Mighty I have Deflect/Ganking/Shield" turns on by continuous re-evaluation.
  test("(b) a 7-Might attacking Fiora is Mighty → Deflect, Ganking and Shield switch on mid-combat", async () => {
    const game = await board("base").build();
    await cleaveFiora(game);
    await game.p1.move("fiora", "bf1");
    expect(game.state("fiora").might).toBe(7);
    expect(game.state("fiora").keywords).toEqual(expect.arrayContaining(GRANTED));
  });

  // rule 809.1.c / 809.1.d — Deflect is live on the Mighty attacker and its surcharge is mandatory, so with
  // only 1 + [fury] P2 cannot choose her.
  test("(b) Deflect is live: with only Ray's printed 1 + [fury] P2 is NOT offered the attacking Fiora and forcing her is rejected", async () => {
    const game = await board("base", RAY_EXACT).build();
    await cleaveFiora(game);
    await game.p1.move("fiora", "bf1");
    await game.p1.passFocus();
    expect(targetsOffered(game, "p2", "ray")).toEqual(["sergeant"]);
    await expect(game.p2.cast("ray", { targets: "fiora" })).rejects.toThrow();
    expect(game.zoneOf("ray")).toBe("hand");
    expect(game.p2.resources()).toMatchObject({ energy: 1, power: { fury: 1 } });
  });

  // rule 809.1.c.1 — the Deflect pip may be of any domain, so the spare [calm] pays it.
  test("(b) with a spare pip of ANY domain ([calm]) Raying the Mighty attacker costs 1 + [fury] + 1 → P2 pool emptied", async () => {
    const game = await board("base").build();
    await cleaveFiora(game);
    await game.p1.move("fiora", "bf1");
    await game.p1.passFocus();
    expect(targetsOffered(game, "p2", "ray")).toEqual(["fiora", "sergeant"]);
    await game.p2.cast("ray", { targets: "fiora" });
    expect(game.p2.resources()).toMatchObject({ energy: 0, power: { calm: 0, fury: 0 } });
  });

  test("(b) Ray resolves: 3 marked on the 7-Might attacker → she is still standing on bf1 before the damage step", async () => {
    const game = await board("base").build();
    await cleaveFiora(game);
    await game.p1.move("fiora", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("ray", { targets: "fiora" });
    await resolveChain(game);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("fiora")).toMatchObject({ damage: 3, might: 7, zone: "battlefield-bf1" });
  });

  test("(b) damage step after the Ray: Fiora's 7 kills Sergeant; Sergeant's 4 onto Fiora makes 3+4 = 7 ≥ 7 → Fiora ALSO dies; both sides empty → no conquer, no point", async () => {
    const game = await board("base").build();
    await cleaveFiora(game);
    await game.p1.move("fiora", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("ray", { targets: "fiora" });
    await game.settle();
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.zoneOf("fiora")).toBe("trash");
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });

  test("(b′) if P2 skips the Ray: Fiora (7) takes 4 < 7, kills Sergeant, survives and conquers bf1 (+1); after combat she loses Attacker → back to 4, not Mighty, keywords off, Assault 3 still granted", async () => {
    const game = await board("base").build();
    await cleaveFiora(game);
    await game.p1.move("fiora", "bf1");
    await game.settle(); // both pass focus → combat resolves
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.state("fiora")).toMatchObject({ combatRole: null, damage: 0, might: 4, zone: "battlefield-bf1" });
    expect(hasAnyGranted(game)).toBe(false);
    expect(game.state("fiora").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // …and the lingering grant is gone once the turn ends.
    await game.advanceTurn();
    expect(game.state("fiora").grantedKeywords).toEqual([]);
    expect(game.state("fiora").might).toBe(4);
  });

  // ── (c) Control: no Cleave ────────────────────────────────────────────────────────────────────
  test("(c) without Cleave she attacks at 4, never Mighty → Ray has no Deflect surcharge: P2 pays exactly 1 + [fury], spare [calm] untouched", async () => {
    const game = await board("base").build();
    await game.p1.move("fiora", "bf1");
    expect(game.state("fiora")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(hasAnyGranted(game)).toBe(false);
    await game.p1.passFocus();
    expect(targetsOffered(game, "p2", "ray")).toEqual(["fiora", "sergeant"]);
    await game.p2.cast("ray", { targets: "fiora" });
    expect(game.p2.resources()).toMatchObject({ energy: 0, power: { calm: 1, fury: 0 } });
  });

  test("(c) Ray alone (3 < 4) does not kill her; the damage step does: Ray 3 + Sergeant 4 = 7 ≥ 4 → Fiora dies, and her 4 kills Sergeant too — no conquer", async () => {
    const game = await board("base").build();
    await game.p1.move("fiora", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("ray", { targets: "fiora" });
    await resolveChain(game);
    expect(game.state("fiora")).toMatchObject({ damage: 3, might: 4, zone: "battlefield-bf1" }); // alive after the Ray
    await game.settle();
    expect(game.zoneOf("fiora")).toBe("trash");
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });
});

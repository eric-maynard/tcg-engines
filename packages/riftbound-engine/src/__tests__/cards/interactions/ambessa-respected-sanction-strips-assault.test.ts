/**
 * Interaction: Ambessa, Respected and Feared (ven-136-166, Champion Unit, printed 5)
 *     "[Empower] [1][order][order]  ·  [Empowered][>] I have [Assault 2].
 *      [Empowered][>] When I attack, kill an enemy unit here with less Might than me."
 *   × Sanction (ven-035-166, Calm Reaction) "Choose one — Empower a unit. Disempower it at end of
 *     turn. • Disempower a unit that's [Empowered]. Empower it at end of turn."
 *
 * Question: Empowered, ready Ambessa Standard-Moves from base into bf1 held by a lone vanilla 6-Might
 * Warden; P2 holds Sanction. (a) Her Might as attacker; does the Empowered attack trigger go on the
 * chain and is the 6 a legal choice? (b) P2 reacts with Sanction mode 2 on Ambessa — after it
 * resolves (LIFO) what is her Might, is the already-finalized trigger removed now that its
 * [Empowered] gate is off, and does the Warden die when it resolves? (c) Combat result and what
 * Sanction's "Empower it at end of turn" does. (d) Contrast: a 4-Might defender, same Sanction.
 * (e) Contrast: no Sanction vs the 6.
 *
 * Rules: 828.1.c / 807.1.c (Empowered → Assault 2 live while attacking: 5+2 = 7); 402.2 ("less Might
 * than me": 6 < 7 legal at finalization); 406.4 (Closed state — P2 may play Reactions); 340.1 (LIFO:
 * Sanction resolves first); 442.1 / 442.1.a (Disempower; mode 2 may only choose an Empowered unit);
 * 828.1.b.1 (dependent abilities switch off immediately → 7→5); 383.3 (the finalized trigger is an
 * independent chain item — NOT removed); 359.3.e.2 / 359.3.e.5 (on resolution the target must still
 * be legal: 6 vs 5 is no longer "less" → the kill is ignored); 390.5.a (Sanction's delayed re-Empower
 * finds Ambessa in the trash → nothing); 428.5 (ability kill in the 4-Might case); 466.7.a (Assault
 * only while attacking); 827.1.c.1 ([Empower] unusable while Empowered).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AMBESSA = "ven-136-166";
const SANCTION = "ven-035-166";
const MODE_DISEMPOWER = 1; // printed bullet index: 0 = Empower…, 1 = Disempower an [Empowered] unit…

function board(defenderMight: number, withSanction = true) {
  const b = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: defenderMight, name: "Warden" }, "warden")
    .unit(P1, "base", AMBESSA, "amb", { empowered: true })
    .resources(P2, { energy: 3, power: { calm: 1 } }); // exactly Sanction's 3 + [calm]
  if (withSanction) {
    b.hand(P2, SANCTION, "sanction");
  }
  return b;
}

/** Ambessa attacks bf1; P1 passes; P2 answers with Sanction mode 2 on Ambessa (nothing resolved yet). */
async function attackAndSanction(game: Game): Promise<void> {
  await game.p1.move("amb", "bf1");
  await game.p1.passPriority();
  await game.p2.cast("sanction", { mode: MODE_DISEMPOWER, targets: "amb" });
}

/** Pass priority around once so exactly the top chain item resolves. */
async function resolveTop(game: Game): Promise<void> {
  const n = game.chain().length;
  for (let i = 0; i < 4 && game.chain().length >= n; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ambessa, Respected and Feared × Sanction — Disempower in response strips Assault before her attack trigger resolves", () => {
  // ---- (a) the attack ------------------------------------------------------------------------

  test("(a) premise: Empowered Ambessa in base is 5 with a static Assault 2 grant (Assault counts only while attacking, 466.7.a)", async () => {
    const game = await board(6).build();
    expect(game.state("amb")).toMatchObject({ isEmpowered: true, isReady: true, might: 5 });
    expect(game.state("amb").grantedKeywords).toEqual([{ duration: "static", keyword: "Assault", value: 2 }]);
  });

  test("(a) moving in makes her a 7-Might attacker (5 + Assault 2, 807.1.c/828.1.c); 'When I attack' goes on the chain as a triggered item already naming the 6-Might Warden (6 < 7 is legal, 402.2); nothing dies yet", async () => {
    const game = await board(6).build();
    await game.p1.move("amb", "bf1");
    expect(game.state("amb")).toMatchObject({ combatRole: "attacker", might: 7, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "amb", controller: P1, targets: ["warden"], triggered: true })]);
    expect(game.zoneOf("warden")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) Closed state, P2 may react (406.4): after P1 passes, Sanction is a legal play for P2; mode 2 may choose the Empowered Ambessa but NOT the un-Empowered Warden (442.1.a)", async () => {
    const game = await board(6).build();
    await game.p1.move("amb", "bf1");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "sanction")).toBe(true);
    const illegal = await game.p2.try((p) => p.cast("sanction", { mode: MODE_DISEMPOWER, targets: "warden" }));
    expect(illegal.ok).toBe(false);
    expect(game.zoneOf("sanction")).toBe("hand");
    await game.p2.cast("sanction", { mode: MODE_DISEMPOWER, targets: "amb" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "amb", targets: ["warden"], triggered: true }),
      expect.objectContaining({ cardId: "sanction", controller: P2, mode: MODE_DISEMPOWER, targets: ["amb"], triggered: false }),
    ]);
  });

  // ---- (b) LIFO resolution -------------------------------------------------------------------

  test("(b) Sanction resolves FIRST (340.1): Ambessa is Disempowered → Assault 2 switches off at once (828.1.b.1) → she is a 5-Might attacker; the finalized attack trigger is STILL on the chain, still naming the Warden (383.3)", async () => {
    const game = await board(6).build();
    await attackAndSanction(game);
    await resolveTop(game); // Sanction
    expect(game.zoneOf("sanction")).toBe("trash");
    expect(game.state("amb")).toMatchObject({ combatRole: "attacker", isEmpowered: false, might: 5 });
    expect(game.state("amb").grantedKeywords).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "amb", targets: ["warden"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("(b) the trigger then resolves and re-checks 'less Might than me': Warden 6 vs Ambessa 5 is no longer legal → the kill is ignored (359.3.e.2/359.3.e.5); the Warden lives and the showdown continues", async () => {
    const game = await board(6).build();
    await attackAndSanction(game);
    await resolveTop(game); // Sanction
    await resolveTop(game); // attack trigger
    expect(game.chain()).toHaveLength(0);
    expect(game.zoneOf("warden")).toBe("battlefield-bf1");
    expect(game.state("warden").damage).toBe(0);
    expect(game.zoneOf("amb")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  // ---- (c) combat + end of turn --------------------------------------------------------------

  test("(c) combat: Ambessa (5) deals 5 to the Warden (6, survives, healed in cleanup); the Warden deals 6 → Ambessa is killed to P1's trash; bf1 stays P2's; nobody scores", async () => {
    const game = await board(6).build();
    await attackAndSanction(game);
    await game.settle();
    expect(game.zoneOf("amb")).toBe("trash");
    expect(game.state("amb").owner).toBe(P1);
    expect(game.zoneOf("warden")).toBe("battlefield-bf1");
    expect(game.state("warden").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) at end of turn Sanction's delayed 'Empower it' finds Ambessa in the trash → does nothing (390.5.a): she stays a plain card in the trash, the turn passes cleanly, no invariant violations", async () => {
    const game = await board(6).build();
    await attackAndSanction(game);
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("amb")).toBe("trash");
    expect(game.state("amb").isEmpowered).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // ---- (d) contrast: 4-Might defender ------------------------------------------------------------

  test("(d) 4-Might defender, same Sanction: after Disempower she is 5, and 4 < 5 is still legal → the trigger KILLS the Warden before any combat damage; no defenders remain → P1 conquers bf1 with an un-Empowered 5-Might Ambessa, unmarked", async () => {
    const game = await board(4).build();
    await attackAndSanction(game);
    await resolveTop(game); // Sanction
    expect(game.state("amb")).toMatchObject({ isEmpowered: false, might: 5 });
    await resolveTop(game); // trigger → kill
    expect(game.zoneOf("warden")).toBe("trash");
    await game.settle();
    expect(game.state("amb")).toMatchObject({ damage: 0, isEmpowered: false, might: 5, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("(d) while Disempowered mid-turn her own [Empower] is activatable again; at end of turn Sanction re-Empowers her on the board → Assault 2 grant is back, and on P1's next turn [Empower] is NOT usable while Empowered (827.1.c.1)", async () => {
    const game = await board(4).build();
    await attackAndSanction(game);
    await game.settle();
    expect(game.state("amb").isEmpowered).toBe(false);
    await game.p1.do("addResources", { energy: 1, power: { order: 2 } });
    expect(game.p1.can("activate", "amb")).toBe(true); // not Empowered right now → [Empower] is live
    await game.advanceTurn(); // P1's Ending Step: "Empower it at end of turn"
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("amb")).toMatchObject({ combatRole: null, isEmpowered: true, might: 5, zone: "battlefield-bf1" });
    expect(game.state("amb").grantedKeywords).toEqual([{ duration: "static", keyword: "Assault", value: 2 }]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("amb").isEmpowered).toBe(true); // the re-Empower is not itself temporary
    await game.p1.do("addResources", { energy: 1, power: { order: 2 } });
    expect(game.p1.can("activate", "amb")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // ---- (e) contrast: no Sanction ---------------------------------------------------------------

  test("(e) no Sanction vs the 6-Might Warden: the trigger resolves with 6 < 7 → Warden killed BEFORE damage; Ambessa conquers bf1 unmarked and reverts to 5 after combat (Assault only while attacking, 466.7.a), still Empowered", async () => {
    const game = await board(6, false).build();
    await game.p1.move("amb", "bf1");
    expect(game.state("amb").might).toBe(7);
    await resolveTop(game); // trigger
    expect(game.zoneOf("warden")).toBe("trash");
    await game.settle();
    expect(game.state("amb")).toMatchObject({ combatRole: null, damage: 0, isEmpowered: true, might: 5, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});

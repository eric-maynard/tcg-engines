/**
 * Interaction: does a live "kill on any damage" trigger change what counts as LETHAL for combat
 * damage assignment (and so loosen Backline)?
 *
 *   × Imperial Decree       (ogn-221-298, Spell, order, 5) "[Action] When any unit takes damage this
 *                            turn, kill it."
 *   × Enthusiastic Promoter (unl-043-219, Unit, calm, 2 Might) "[Backline] (I must be assigned combat
 *                            damage last.) When I hold, [Buff] all units here."
 *   × Vanguard Sergeant     (ogn-219-298, Unit, order, 4 Might, vanilla)
 *
 * Rules: 417.1.a / 465.2.c.1 / 465.2.c.1.a (assigning is not dealing; all assigned damage is dealt
 * simultaneously afterwards), 465.2.c.2 (lethal = non-zero damage ≥ Might), 465.2.c.3 (lethal in
 * full before moving on), 465.2.c.4 (no over-assignment while others remain), 465.2.c.5 (only
 * REPLACEMENT effects fold into assignment — a triggered kill does not), 826.3 / 826.4.b (Backline
 * units are invalid recipients until every non-Backline unit of that controller has lethal
 * assigned), 465.2.d (deal), 465.3 (no FEPR — straight to the Resolution Step), 466.1.a (Combat
 * Cleanup: kill lethally-damaged units, 3c heal all units), 466.2 (resolve chain items from combat
 * damage + the Cleanup BEFORE determining the result), 466.3.a (winner = sole player with units
 * left), 466.5 (establish/keep control, clear Contested), 383.3.d (simultaneous triggers of one
 * controller: that player orders them).
 *
 * Question. P1 resolves Imperial Decree, then attacks P2's bf1 with one vanilla 2-Might unit. P2
 * defends with Vanguard Sergeant (4) + Enthusiastic Promoter (2, Backline).
 *  (a) Is "1 damage" now lethal for assignment — may P1 split 1/1 or put 2 on the Promoter?
 *  (b) When does Decree trigger (assignment vs dealing), how many triggers, who controls them, and
 *      where in Step 3 do they resolve relative to the Cleanup heal and the combat result?
 *  (c) Contrast: Promoter replaced by a vanilla 2-Might unit — what does P1's Decision offer and how
 *      does the chosen defender die in each line?
 *
 * Expected. (a) No: lethal is defined against Might; Decree is a trigger, not a replacement, so it
 * is not folded into assignment. Sergeant needs 4, P1 has 2 → the only legal line is 2 → Sergeant,
 * 0 → Promoter; P2 puts 4+2 = 6 on the attacker. (b) Nothing triggers during assignment; at 465.2.d
 * Sergeant takes 2 and the attacker takes 6 → two Decree triggers, both P1's. 466.1 Cleanup kills
 * the attacker and heals Sergeant to 0; the triggers then resolve in the 466.2 window with both
 * players getting priority: the one on the dead attacker does nothing, the other kills Sergeant.
 * Only then 466.3: P2 (Promoter) alone remains → P2 keeps bf1, nobody scores. (c) Without Backline
 * P1 really chooses: 2 → the 2-drop is exact lethal (dies in the Cleanup), or 2 → Sergeant (survives
 * the Cleanup healed, then dies to Decree in 466.2). Either way one defender + the attacker die and
 * P2 keeps bf1.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const PROMOTER = "unl-043-219";
const SERGEANT = "ogn-219-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1 to act with Decree in hand; P2 holds bf1 with Sergeant + (Backline Promoter | vanilla 2-drop). */
function board(defender: "promoter" | "grunt" = "promoter") {
  const b = scenario()
    .resources(P1, { energy: 5, power: { order: 2, rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Attacker" }, "atk")
    .unit(P2, "bf1", SERGEANT, "sarge")
    .hand(P1, IMPERIAL_DECREE, "decree");
  return defender === "promoter"
    ? b.unit(P2, "bf1", PROMOTER, "promo")
    : b.unit(P2, "bf1", { might: 2, name: "Grunt" }, "grunt");
}

async function resolveDecree(game: Game): Promise<void> {
  await game.p1.cast("decree");
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
}

/** Decree resolved, attacker moved in, both players pass Focus → combat damage step runs. */
async function attackAndPassFocus(game: Game): Promise<void> {
  await resolveDecree(game);
  await game.p1.move("atk", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
}

describe("(a) Backline + Decree: lethal is still measured against Might — P1 has exactly one legal assignment", () => {
  test("setup: Decree resolves to the trash touching nothing; the lone 2-Might attacker opens a combat showdown at bf1 with P1 holding Focus and an EMPTY chain (no Decree item yet)", async () => {
    const game = await board().build();
    await resolveDecree(game);
    await game.p1.move("atk", "bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.state("sarge").damage).toBe(0);
    expect(game.state("promo").damage).toBe(0);
  });

  test("P1 is NOT asked to distribute: with Sergeant needing 4 (465.2.c.2/.3) and the Promoter an invalid recipient (826.4.b), the single line 2 → Sergeant / 0 → Promoter is forced — no `distribute` decision ever surfaces", async () => {
    const game = await board().build();
    await attackAndPassFocus(game);
    const d = game.decision();
    expect(d?.kind).not.toBe("distribute");
    // The damage step already ran: we are in the post-damage priority window.
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("promo").damage).toBe(0);
    expect(game.zoneOf("promo")).toBe("battlefield-bf1");
  });

  test("the numbers: Sergeant is the defender that took P1's 2 (it is the one Decree later kills), the Promoter took 0 (never dies), and P2's 4+2 = 6 was lethal to the 2-Might attacker", async () => {
    const game = await board().build();
    await attackAndPassFocus(game);
    expect(game.zoneOf("atk")).toBe("trash"); // 6 ≥ 2, killed in the Combat Cleanup
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("trash"); // took damage → Decree
    expect(game.zoneOf("promo")).toBe("battlefield-bf1"); // took none
    expect(game.state("promo").damage).toBe(0);
  });
});

describe("(b) assignment ≠ dealing: Decree triggers once per damaged unit at 465.2.d and resolves in the 466.2 window — after the Cleanup heal, before the result", () => {
  test("nothing triggers while damage is merely being assigned: through both Focus passes up to the deal, no Decree item appears until damage is actually dealt (417.1.a / 465.2.c.1)", async () => {
    const game = await board().build();
    await resolveDecree(game);
    await game.p1.move("atk", "bf1");
    await game.p1.passFocus();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.zoneOf("atk")).toBe("battlefield-bf1");
  });

  test("once damage is dealt simultaneously: exactly TWO Decree triggers are on the chain (Sergeant took 2, attacker took 6), both triggered abilities controlled by P1 — Decree's controller orders/owns them (383.3.d)", async () => {
    const game = await board().build();
    await attackAndPassFocus(game);
    const chain = game.chain();
    expect(chain).toHaveLength(2);
    for (const item of chain) {
      expect(item).toMatchObject({ cardId: "decree", controller: P1, triggered: true });
    }
  });

  test("466.1 Combat Cleanup has ALREADY happened when the triggers get priority: the attacker (lethal 6) is in the trash and Sergeant is healed back to 0 damage — yet still on bf1, because its Decree kill is a separate pending chain item", async () => {
    const game = await board().build();
    await attackAndPassFocus(game);
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.state("sarge").damage).toBe(0); // 3c heal does not undo the already-triggered Decree
    expect(game.state("promo").damage).toBe(0);
  });

  test("the combat result is NOT yet determined while the triggers wait (466.2 before 466.3): bf1 is still contested and P2 still controls it; both players get priority in turn (P1 first, then P2)", async () => {
    const game = await board().build();
    await attackAndPassFocus(game);
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("LIFO: the top trigger (aimed at the already-dead attacker) resolves and does nothing; the second one then kills the healed Sergeant", async () => {
    const game = await board().build();
    await attackAndPassFocus(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item resolves
    expect(game.chain()).toHaveLength(1);
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1"); // untouched by the first
    await game.p1.passPriority();
    await game.p2.passPriority(); // second item resolves
    expect(game.zoneOf("sarge")).toBe("trash");
  });

  test("final board (466.3 / 466.5): attacker and Sergeant in their trashes, Promoter alone and undamaged at bf1; P2 keeps bf1 uncontested; nobody scored; P1 back in an open main phase", async () => {
    const game = await board().build();
    await attackAndPassFocus(game);
    await game.settle();
    expect(game.p1.trash()).toContain("atk");
    expect(game.p2.trash()).toContain("sarge");
    expect(game.p2.units("bf1")).toEqual(["promo"]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.state("promo")).toMatchObject({ damage: 0, might: 2, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) contrast — vanilla 2-drop instead of the Backline Promoter: P1 gets a real choice of WHICH defender", () => {
  test("P1 IS asked to distribute 2: buckets Sergeant (lethal at 4, max 2) and Grunt (lethal at 2, max 2); Decree does not lower either threshold; a 1/1 split is refused (465.2.c.3)", async () => {
    const game = await board("grunt").build();
    await attackAndPassFocus(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 2 });
    const buckets = d?.kind === "distribute" ? d.buckets : [];
    expect(buckets.map((b) => b.key).sort()).toEqual(["grunt", "sarge"]);
    expect(buckets.find((b) => b.key === "sarge")).toMatchObject({ lethal: 4, max: 2, min: 0 });
    expect(buckets.find((b) => b.key === "grunt")).toMatchObject({ lethal: 2, max: 2, min: 0 });
    expect((await game.p1.try((p) => p.distribute({ grunt: 1, sarge: 1 }))).ok).toBe(false);
    expect(game.decision()?.kind).toBe("distribute"); // still asking
  });

  test("line 1 — 2 → Grunt is exact lethal: the Grunt dies to COMBAT damage in the 466.1 Cleanup (already in the trash while the two Decree triggers are still pending); Sergeant is never touched", async () => {
    const game = await board("grunt").build();
    await attackAndPassFocus(game);
    await game.p1.distribute({ grunt: 2 });
    expect(game.chain()).toHaveLength(2);
    expect(game.chain().every((c) => c.cardId === "decree" && c.controller === P1)).toBe(true);
    expect(game.zoneOf("grunt")).toBe("trash"); // died in the Cleanup, before any trigger resolved
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.state("sarge")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("line 2 — 2 → Sergeant is legal (start anywhere, run out before lethal): Sergeant SURVIVES the Cleanup healed to 0, then is killed by its Decree trigger in the 466.2 window; the Grunt lives and P2 keeps bf1", async () => {
    const game = await board("grunt").build();
    await attackAndPassFocus(game);
    await game.p1.distribute({ sarge: 2 });
    expect(game.chain()).toHaveLength(2);
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.state("sarge")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // alive after Cleanup
    expect(game.zoneOf("grunt")).toBe("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("trash"); // Decree, not combat damage
    expect(game.state("grunt")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points() + game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("either way exactly one defender and the attacker die and P2 keeps bf1 — the difference from (a) is only that Backline removed P1's choice", async () => {
    for (const pick of ["grunt", "sarge"] as const) {
      const game = await board("grunt").build();
      await attackAndPassFocus(game);
      await game.p1.distribute({ [pick]: 2 });
      await game.settle();
      const other = pick === "grunt" ? "sarge" : "grunt";
      expect(game.zoneOf(pick)).toBe("trash");
      expect(game.zoneOf(other)).toBe("battlefield-bf1");
      expect(game.zoneOf("atk")).toBe("trash");
      expect(game.p2.units("bf1")).toEqual([other]);
      expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    }
  });
});

/**
 * Ruling a169312f226955a1 — Master Yi, Tempered (UNL-113 → unl-113-219) · 4 Might × Gemhand Hunter (UNL-094 → unl-094-219) · 2
 *   × Stellacorn Herder (SFD-048 → sfd-048-221) · 3 Might "When I move, draw 1."  × Rune Prison (OGN-050) "Stun a unit."
 *
 * Q: My buffed Stellacorn attacks into Master Yi + Gemhand Hunter; I then stun Yi with a spell. Does the Stellacorn come back
 *    to base exhausted or ready?
 * A: In whatever state it was in — a recall does not ready or exhaust. The Standard Move that started the attack exhausted it,
 *    so when it is recalled (it survives but defenders remain) it returns to base still EXHAUSTED.
 * Rules: 453.1 (recalls don't change ready/exhausted; not a move), 140.3.a (standard move exhausts), 466.1.a.2 (attackers
 *        recalled if defenders remain), 740 (stunned units deal no combat damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASTER_YI = "unl-113-219";
const GEMHAND_HUNTER = "unl-094-219";
const STELLACORN = "sfd-048-221";
const RUNE_PRISON = "ogn-050-298";

/** P1's turn. P1: buffed Stellacorn (3+1) ready in base, Rune Prison + [2][calm]. P2 holds bf1 with Master Yi (4) and Gemhand Hunter (2). */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", MASTER_YI, "yi")
    .unit(P2, "bf1", GEMHAND_HUNTER, "gem")
    .unit(P1, "base", STELLACORN, "stella", { buffed: true })
    .hand(P1, RUNE_PRISON, "prison");
}

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);

/** Stellacorn attacks bf1 (its move trigger draws 1); P1 then Rune-Prisons Yi and the spell resolves. */
async function attackAndStunYi(): Promise<Game> {
  const game = await board().build();
  expect(game.state("stella")).toMatchObject({ isBuffed: true, isReady: true, might: 4 });
  await game.p1.move("stella", "bf1");
  expect(game.state("stella").isExhausted).toBe(true); // the Standard Move's cost
  // "When I move, draw 1" resolves first, then the combat showdown is open.
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  expect(game.p1.hand().length).toBe(2); // prison + 1 drawn
  expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("prison", { targets: "yi" });
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  expect(game.state("yi").isStunned).toBe(true);
  return game;
}

describe("Ruling a169312f226955a1 — a recalled attacker keeps its exhausted state", () => {
  test("mid-showdown: Stellacorn is at bf1 EXHAUSTED (it moved), buffed 4 Might; Yi is stunned", async () => {
    const game = await attackAndStunYi();
    expect(game.locationOf("stella")).toBe("bf1");
    expect(game.state("stella")).toMatchObject({ combatRole: "attacker", isBuffed: true, isExhausted: true, might: 4 });
    expect(game.state("yi")).toMatchObject({ combatRole: "defender", isStunned: true });
    expect(game.state("gem").combatRole).toBe("defender");
  });

  test("combat: stunned Yi deals nothing, Gemhand deals 2 → Stellacorn (4) survives; a defender remains → Stellacorn is RECALLED to base and arrives still EXHAUSTED (healed, still buffed)", async () => {
    const game = await attackAndStunYi();
    const handBefore = game.p1.hand().length;
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("stella")).toBe("base");
    expect(game.state("stella").isExhausted).toBe(true); // the ruling: not readied by the recall
    expect(game.state("stella").isReady).toBe(false);
    expect(game.state("stella")).toMatchObject({ damage: 0, isBuffed: true }); // combat cleanup healed the 2
    expect(game.p2.units("bf1").length).toBeGreaterThan(0); // a defender held
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.hand()).toHaveLength(handBefore); // the recall is not a move: no "When I move, draw 1"
    expect(game.violations()).toEqual([]);
  });

  test("control: a unit that reaches the battlefield WITHOUT exhausting (moved by a spell while ready) is recalled still READY — the recall preserves state either way", async () => {
    const RIDE_THE_WIND = "ogn-173-298";
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Wall A" }, "wa")
      .unit(P2, "bf1", { might: 6, name: "Wall B" }, "wb", { stunned: true }) // deals no combat damage
      .unit(P1, "base", { might: 3, name: "Lancer" }, "lancer")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.cast("rtw", { targets: "lancer" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf1");
    }
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.locationOf("lancer")).toBe("bf1");
    expect(game.state("lancer").isReady).toBe(true); // arrived ready
    await game.settle(); // Lancer takes 2 (survives); Wall B (6) survives → Lancer is recalled
    expect(game.zoneOf("wb")).toBe("battlefield-bf1");
    expect(game.zoneOf("lancer")).toBe("base");
    expect(game.state("lancer").isReady).toBe(true); // recalled in the state it had: ready
  });
});

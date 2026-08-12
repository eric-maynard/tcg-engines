/**
 * Interaction: Resonating Strike (ven-034-166)
 *     "[Hidden] [Reaction] Choose a battlefield you control and a unit you control at a different
 *      location. Move that unit to that battlefield and give it +2 [Might] this turn."
 *   × Watchful Sentry (ogn-096-298) "[Deathknell] — Draw 1."
 *   × Glorious Executioner (sfd-185-221) "When you win a combat, draw 1."
 *
 * Question — P2 controls bf1 with the Sentry and a Resonating Strike hidden there on an earlier
 * turn; P1's legend is the Executioner and P1 attacks with a vanilla 5-Might unit. The Sentry dies.
 * WHEN P2 flips the Strike for [0] decides everything, because the Resolution Step hands out three
 * priority windows: 466.2 (opened by the Deathknell), 466.4 (opened by the win trigger) and 466.6.
 *   (a) 466.2 flip — the reinforcement arrives BEFORE the result is read: both players have units
 *       here ⇒ No Result (466.3.d) ⇒ a Showdown and a Combat are staged (466.3.d.1) ⇒ 466.5 is
 *       skipped, no control change, no conquer, Contested stays. Combat 2 is 6 vs 5.
 *   (b) 466.4 flip — the result is already fixed: P1 WON (466.3.a) and the Executioner has drawn.
 *       The arrival still makes bf1 hold units of both players, so a Showdown + Combat are staged
 *       here and 466.5's "if no Showdown or Combat is staged at this location" guard fails: the
 *       whole step is skipped — no Establish Control, NO conquer or point, Contested not cleared,
 *       foreign hidden cards not removed. Winning a combat and scoring a battlefield differ.
 *   (c) no flip — P1 wins, Establishes Control, Conquers for +1, Contested is cleared and 466.5.c
 *       removes P2's facedown cards (they no longer share a controller with bf1) to their OWNER's
 *       trash. 466.4 was P2's last window to flip.
 *
 * Rules: 466.1.a.1 / 466.1.a.2 (Combat Cleanup steps 3c heal / 3d recall), 466.2 / 466.4 / 466.6
 * (the three outstanding-task priority windows), 466.3.a (a player wins), 466.3.d / 466.3.d.1 (No
 * Result and the restage), 466.5 / 466.5.a / 466.5.c / 466.5.d (Establish Control, clear Contested,
 * sweep foreign hidden cards, Conquer), 466.7.a / 466.7.c (designations removed, "this combat"
 * effects expire — a "this turn" buff does NOT), 464.2.c.1 / 464.2.c.3 (the attacker stays the
 * player who applied Contested; fresh designations in the new combat), 323.8 / 323.9 / 323.13
 * (staging and beginning a Showdown/Combat), 811.1.b / 811.6 (a facedown card is played for [0]),
 * 190.4.b (control is frozen while a Showdown/Combat is ongoing there), 469.1 (Conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RESONATING_STRIKE = "ven-034-166";
const SENTRY = "ogn-096-298";
const EXECUTIONER = "sfd-185-221";
const HIDDEN_BLADE = "ogn-213-298"; // only used as a second facedown card in the BUG repro below

/**
 * P1's turn. P2 holds bf1 with the 1-Might Sentry and the facedown Resonating Strike; P2's
 * reinforcement waits in base. `autoProcedures(false)` so the Resolution Step can be walked one
 * outstanding task at a time.
 */
function board(reserveDamage = 0) {
  return scenario()
    .legend(P1, EXECUTIONER, "exec")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SENTRY, "sentry")
    .unit(P2, "base", { might: 4, name: "Reserve" }, "reserve", reserveDamage > 0 ? { damage: reserveDamage } : undefined)
    .unit(P1, "base", { might: 5, name: "Phantom" }, "phantom")
    .facedown(P2, "bf1", RESONATING_STRIKE, "rs")
    .autoProcedures(false);
}

/** Attack bf1 and step to the 466.2 window: damage dealt, Sentry dead, its Deathknell on the chain. */
async function toWindow4662(game: Game): Promise<void> {
  await game.p1.move("phantom", "bf1");
  await game.settle(); // both pass Focus → the showdown closes and the combat is ready
  await game.p1.choose("resolveFullCombat:bf1");
}

/** …and on to the 466.4 window: the result is read (P1 won) and the win trigger is on the chain. */
async function toWindow4664(game: Game): Promise<void> {
  await toWindow4662(game);
  await game.settle(); // the Deathknell resolves
  await game.p1.choose("resolveFullCombat:bf1");
}

/** Run whatever combat steps remain until the turn player is back in an ordinary main phase. */
async function finish(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await game.settle();
    if (!game.p1.legal().some((o) => o.key === "resolveFullCombat:bf1")) {
      return;
    }
    await game.p1.choose("resolveFullCombat:bf1");
  }
}

describe("Resonating Strike flipped in the 466.2 / 466.4 window vs. not at all", () => {
  test("common ground: the Sentry dies, 3c heals the attacker and 3d recalls nothing, and in the 466.2 window P2 holds priority over a bf1 it still controls (190.4.b)", async () => {
    const game = await board().build();
    await toWindow4662(game);

    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.chain().map((c) => c.name)).toEqual(["Watchful Sentry"]);
    expect(game.state("phantom")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // 466.1.a.1
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // frozen while combat is ongoing
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.legal().map((o) => o.key)).toContain("revealHidden:rs");
  });

  test("(c) no flip: P1 wins, the Executioner draws, control is Established with a Conquer (+1), Contested clears and P2's facedown card goes to its owner's trash (466.5.c) — 466.4 was the last window to flip it", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    await toWindow4662(game);
    await finish(game);

    expect(game.p1.hand()).toHaveLength(p1Hand + 1); // 466.3.a win → the legend's draw
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false); // 466.5.a
    expect(game.p1.points()).toBe(1); // 466.5.d / 469.1
    expect(game.zoneOf("rs")).toBe("trash");
    expect(game.p2.trash()).toContain("rs"); // the OWNER's trash, not P1's
    expect(game.p2.legal().some((o) => o.key.startsWith("revealHidden"))).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(a) 466.2 flip: the Strike costs [0], pulls the Reserve onto bf1 at 6 as a DEFENDER (464.2.c.3.a) — and nothing recalls it, because Combat Cleanup step 3d already ran", async () => {
    // 466.1.a.1 inserts "3c. Heal all Units." — ALL units, not just the ones here, so the Reserve's
    // chip damage is already gone while it still sits in base; and 3d ("recall Attackers if
    // Defenders are still present") ran before it existed as a defender, so it stays put.
    const game = await board(1).build();
    await toWindow4662(game);
    const before = game.p2.resources();
    expect(game.state("reserve").damage).toBe(0);

    await game.p2.reveal("rs"); // 811.1.b / 811.6 — from facedown for [0]
    await game.settle();

    expect(game.p2.resources()).toEqual(before);
    expect(game.locationOf("reserve")).toBe("bf1");
    expect(game.state("reserve")).toMatchObject({ combatRole: "defender", damage: 0, might: 6 });
    expect(game.zoneOf("rs")).toBe("trash");
  });

  test("(a) 466.2 flip: both players have units here at 466.3 ⇒ No Result ⇒ a Showdown and a Combat are staged (466.3.d.1), so 466.5 never runs — control is unchanged, Contested stays and the Executioner never drew", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    await toWindow4662(game);
    await game.p2.reveal("rs");
    await game.settle();
    await game.p1.choose("resolveFullCombat:bf1"); // reads the result → No Result → restage

    expect(game.gameState.battlefields.bf1?.showdownComplete).toBe(false); // a NEW showdown is open
    expect(game.gameState.battlefields.bf1?.contested).toBe(true); // 466.5 skipped ⇒ never cleared
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toHaveLength(p1Hand); // no win ⇒ no Executioner draw
    // 464.2.c.1 / 464.2.c.3 — P1 applied Contested, so P1 attacks again with fresh designations.
    expect(game.state("phantom").combatRole).toBe("attacker");
    expect(game.state("reserve").combatRole).toBe("defender");
    expect(game.p1.legal().map((o) => o.key)).toContain("passShowdownFocus:-");
  });

  test("(a) combat 2 is 6 vs 5: the attacker dies, the Reserve survives, P2 keeps a battlefield it already controlled (no conquer) and its un-flipped facedown card stays", async () => {
    const game = await board().build();
    await toWindow4662(game);
    await game.p2.reveal("rs");
    await finish(game);

    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.locationOf("reserve")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0); // P2 already controlled bf1 — winning is not conquering
    expect(game.violations()).toEqual([]);
  });

  test("(a) 466.7.c expires 'this combat' effects only — the Strike's +2 is 'this turn', so the Reserve is still 6 after combat and 4 next turn", async () => {
    const game = await board().build();
    await toWindow4662(game);
    await game.p2.reveal("rs");
    await finish(game);

    expect(game.state("reserve").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("reserve").might).toBe(4);
  });

  test("(b) 466.4 flip: the result is already fixed — the Executioner's draw resolves in this very window — but the arrival still stages a Showdown, so 466.5 is skipped: no Establish Control, no conquer, no point", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    await toWindow4664(game);

    expect(game.chain().map((c) => c.name)).toEqual(["Glorious Executioner"]);
    await game.p1.passPriority(); // P1 holds priority first in its own window
    await game.p2.reveal("rs");
    await game.settle();

    expect(game.p1.hand()).toHaveLength(p1Hand + 1); // the win already happened and cannot be undone
    expect(game.locationOf("reserve")).toBe("bf1");
    await game.p1.choose("resolveFullCombat:bf1");
    expect(game.gameState.battlefields.bf1?.showdownComplete).toBe(false); // staged, so 466.5 is skipped
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("(b) 466.4 flip, end state: P1 won combat 1 and drew, yet scored nothing — bf1 is still P2's, P1's attacker died in combat 2 and P2's other facedown card survived", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    await toWindow4664(game);
    await game.p1.passPriority();
    await game.p2.reveal("rs");
    await finish(game);

    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.locationOf("reserve")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // A second facedown card at the SAME battlefield is not a legal board: rule 107.3.b gives every
  // Facedown Zone a maximum occupancy of one card, so a scenario that seeds two is trimmed by the
  // first Cleanup (107.3.b.2 / 421.4) — the zone's controller (P2, who controls bf1) picks which
  // card to trash and it leaves face UP. Nothing is being "resolved": the chain stays empty and
  // neither hidden card is played (811). The pick is labelled after the first card in the zone,
  // which reads as "Choose a target for Resonating Strike [rs]" — a harness label artifact, not a
  // resolution of the Strike.
  test("a second facedown card at bf1 is illegal (107.3.b) — the Cleanup makes P2 trash one; neither hidden card is played", async () => {
    const game = await board().facedown(P2, "bf1", HIDDEN_BLADE, "extra").build();
    await game.p1.move("phantom", "bf1");

    const trim = game.decision();
    expect(trim).toMatchObject({ kind: "pick", seat: P2, min: 1, max: 1 });
    expect(trim?.kind === "pick" ? trim.options.map((o) => o.key).sort() : []).toEqual(["extra", "rs"]);
    expect(game.chain()).toEqual([]); // 811 — a hidden card does nothing until it is played

    await game.p2.pick("extra");
    expect(game.zoneOf("extra")).toBe("trash"); // 421.4 — revealed as it leaves the Facedown Zone
    expect(game.zoneOf("rs")).toBe("facedown-bf1"); // the survivor is still hidden and still playable
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 }); // P1 holds Focus in the showdown
  });
});

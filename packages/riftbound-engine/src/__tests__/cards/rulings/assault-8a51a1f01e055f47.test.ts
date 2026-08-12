/**
 * Ruling 8a51a1f01e055f47 — (no specific card) when does [Assault] apply?
 *   Exercised with Laurent Duelist (SFD-156 → sfd-156-221) · 3 [Might] · "[Assault 2]" and an
 *   inline [Reaction] unit that can be played into an occupied battlefield ([Ambush]-style) to
 *   turn a running non-combat showdown into a combat.
 *
 * Q: When does [Assault] apply?
 * A: The instant the unit holds the Attacker designation, and for exactly as long as it holds it.
 *    It is a passive ability — it uses no chain and nobody can respond to it turning on or off.
 *    Walking onto an open battlefield gives no designation (a non-combat showdown is not combat),
 *    so no bonus; if that showdown later becomes a Combat, the designation is stamped then and the
 *    bonus switches on at that moment.
 * Rules: 807.1/807.1.c (Assault = "+X Might while I'm an attacker"), 807.1.d/807.1.d.1 (designation
 *        during Combat; it lasts as long as the designation), 464.2.c.3 (designations are stamped
 *        when the showdown IS a Combat), 344.2/323.14 (open battlefield ⇒ non-combat showdown,
 *        which converts when units of another player arrive), 466.7.a (the designation — and with
 *        it Assault — is removed only when combat ends, i.e. after the 466.5 Conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAURENT_DUELIST = "sfd-156-221"; // 3 Might · [Assault 2]

/** [Reaction] "Move a friendly unit to a battlefield." — the mid-showdown combat transition. */
const REDEPLOY = {
  abilities: [
    {
      effect: { target: { controller: "friendly", type: "unit" }, to: "choose", type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Redeploy",
  rulesText: "[Reaction] Move a friendly unit to a battlefield.",
  timing: "reaction",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 8a51a1f01e055f47 — [Assault] lives and dies with the Attacker designation", () => {
  test("off the board's combat entirely: no designation, no bonus", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", LAURENT_DUELIST, "duelist")
      .build();
    expect(game.state("duelist")).toMatchObject({ combatRole: null, keywords: ["Assault"], might: 3 });
  });

  test("attacking an occupied battlefield designates the unit Attacker and the +2 is live at once", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", LAURENT_DUELIST, "duelist")
      .build();
    await game.p1.move("duelist", "bf1");
    expect(game.state("duelist")).toMatchObject({ combatRole: "attacker", might: 5 });
    // it is passive: it did not go on the chain, so there was nothing to respond to
    expect(game.chain()).toEqual([]);
  });

  test("walking onto an OPEN battlefield opens a non-combat showdown: no designation, so no bonus", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", LAURENT_DUELIST, "duelist")
      .build();
    await game.p1.move("duelist", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, isCombatShowdown: false });
    expect(game.state("duelist")).toMatchObject({ combatRole: null, might: 3 }); // NOT 5
  });

  test("combat transition: an enemy unit arriving mid-showdown converts it, stamping the designation and switching [Assault] on", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .unit(P1, "base", LAURENT_DUELIST, "duelist")
      .unit(P2, "base", { might: 4, name: "Interloper" }, "interloper")
      .hand(P2, REDEPLOY, "redeploy")
      .build();
    await game.p1.move("duelist", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, isCombatShowdown: false });
    expect(game.state("duelist")).toMatchObject({ combatRole: null, might: 3 });
    await game.p1.passFocus();
    await game.p2.cast("redeploy", { answers: ["interloper", "bf1"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // the move resolves — units of two players are now here
    expect(showdown(game)).toMatchObject({ active: true, isCombatShowdown: true });
    expect(game.state("duelist")).toMatchObject({ combatRole: "attacker", might: 5 }); // ON now
    await game.settle();
    // 5 beats the 4-Might Interloper, so the Duelist takes the battlefield.
    expect(game.zoneOf("interloper")).toBe("trash");
    expect(game.zoneOf("duelist")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the bonus lasts as long as the designation — it is still counted when the combat resolves and the unit conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard") // 4 > the Duelist's printed 3
      .unit(P1, "base", LAURENT_DUELIST, "duelist")
      .build();
    await game.p1.move("duelist", "bf1");
    await game.settle();
    // 5 vs 4: only the [Assault] bonus makes this win.
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("…and it is gone again once combat is over and the designation is removed", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .unit(P1, "base", LAURENT_DUELIST, "duelist")
      .build();
    await game.p1.move("duelist", "bf1");
    await game.settle();
    expect(game.state("duelist")).toMatchObject({ combatRole: null, might: 3 });
  });
});

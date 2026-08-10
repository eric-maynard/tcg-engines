/**
 * Ruling dbface82eb74ca5a — Rengar, Trophy Hunter (UNL-120 → unl-120-219) · 6 Might · [5][body]
 *     "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.) I can be played to a battlefield
 *      where there are enemy units (even if you don't have units there)."
 *   × Fiora, Peerless (SFD-110 → sfd-110-221) · 3 Might · "When I attack or defend one on one, double my Might this combat."
 *
 * Q: I move Fiora into a battlefield (one on one / empty) and my opponent then plays Rengar, Trophy Hunter into it. Does
 *    Fiora's trigger still double her Might?
 * A: Yes. "When I attack … one on one" is a TRIGGERED ability: the one-on-one condition is checked at the moment she is
 *    designated attacker. Her trigger sits on the initial chain; Rengar arrives as a Reaction (Ambush) while the state is
 *    Closed; the trigger then resolves and doubles her Might regardless — it is not re-checked at resolution.
 * Rules: 383 (triggered abilities evaluate their condition when they trigger), 464 (attacker designation / initial chain),
 *        806 (Ambush), 344.1 (a non-combat showdown becomes a combat when an opposing unit arrives).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "unl-120-219";
const FIORA = "sfd-110-221";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling dbface82eb74ca5a — Rengar Ambushed in after Fiora's one-on-one attack trigger doesn't undo the doubling", () => {
  test("one on one vs a lone defender: Fiora's trigger is the initial chain; P2 Ambushes Rengar in response; the trigger still resolves and doubles her (3 → 6)", async () => {
    const game = await scenario()
      .resources(P2, { energy: 5, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Lone Defender" }, "def")
      .unit(P1, "base", FIORA, "fiora")
      .hand(P2, RENGAR, "rengar")
      .build();
    expect(game.state("fiora").might).toBe(3);

    // 1–2. Designation: Fiora attacks one on one → her trigger goes on the initial chain.
    await game.p1.move("fiora", "bf1");
    expect(game.state("fiora").combatRole).toBe("attacker");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });

    // 3. Closed state: P1 passes priority, P2 reacts by Ambushing Rengar into bf1 (enemy-occupied is fine for Rengar).
    await game.p1.passPriority();
    expect(game.p2.can("play", "rengar")).toBe(true);
    await game.p2.play("rengar", { to: "bf1" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.locationOf("rengar")).toBe("bf1");
    expect(game.state("rengar").combatRole).toBe("defender");
    // Fiora's trigger is still the (only) chain item; nothing has re-evaluated it away.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", triggered: true })]);
    expect(game.state("fiora").might).toBe(3); // not resolved yet

    // 4. The initial chain resolves: doubled even though it is now 1-vs-2.
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action") break;
      await game.seat(d.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.p2.units("bf1").sort()).toEqual(["def", "rengar"]);
    expect(game.state("fiora").might).toBe(6);
    expect(game.violations()).toEqual([]);
  });

  test("literal 'empty battlefield' variant: Fiora walks into an uncontrolled empty battlefield (non-combat showdown); P2 plays Rengar there → it becomes a combat, Fiora is designated the lone attacker vs Rengar and her trigger doubles her (both 6s trade)", async () => {
    const game = await scenario()
      .resources(P2, { energy: 5, power: { body: 1 } })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2, name: "Camper" }, "camper")
      .unit(P1, "base", FIORA, "fiora")
      .hand(P2, RENGAR, "rengar")
      .build();

    await game.p1.move("fiora", "bf1");
    // No opposing unit: a NON-combat showdown, no attacker designation, no trigger yet.
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false, focusPlayer: P1 });
    expect(game.state("fiora").combatRole).toBeNull();
    expect(game.chain()).toEqual([]);

    await game.p1.passFocus();
    expect(game.p2.can("play", "rengar")).toBe(true);
    await game.p2.play("rengar", { to: "bf1" });
    // Rengar's arrival makes it a combat: Fiora attacker (alone) vs Rengar defender → her trigger fires now.
    expect(game.state("fiora").combatRole).toBe("attacker");
    expect(game.state("rengar").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", controller: P1, triggered: true })]);

    await game.settle(); // trigger resolves (3 → 6), combat: 6 vs 6 — both die
    expect(game.zoneOf("fiora")).toBe("trash");
    expect(game.zoneOf("rengar")).toBe("trash"); // only a doubled (6-Might) Fiora kills the 6-Might Rengar
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});

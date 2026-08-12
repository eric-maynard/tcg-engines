/**
 * Ruling 8304137910b1f2ea — Promising Future (OGN-115 → ogn-115-298) · Spell · Mind · [5][mind]
 *   "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest.
 *    Starting with the next player, each player plays those cards, ignoring Energy costs."
 *
 * Q: If Promising Future would start a showdown, does the showdown start before or after the rest of the
 *    card resolves?
 * A: After. A showdown cannot begin while a chain exists: it is merely STAGED (the battlefield is Contested)
 *    and only opens at the first open state, once Promising Future — and every card it plays — is done.
 * Rules: 323.9 (Contested applied at once), 323.12/323.13 (a staged showdown begins only in a Neutral Open
 *        State), 337.1/354.3 (cards an effect plays are pending items resolved inside the same batch).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const RIDE_THE_WIND = "ogn-173-298";

/** Zero-cost spell used to fill both players' top five. */
const FILLER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  energyCost: 0,
  name: "Filler (inline: Draw 1)",
};

const activeShowdowns = (game: Game) =>
  (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).map((s) => s.battlefieldId);

/**
 * P1's turn. P2 holds bf1 with a Guard; P1 has a Striker at home and, on top of their deck, a Ride the Wind
 * that Promising Future will make them play — moving the Striker into bf1 and contesting it.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { chaos: 1, mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Striker" }, "striker")
    .deck(P1, [RIDE_THE_WIND, FILLER, FILLER, FILLER, FILLER], ["rtw", "f1", "f2", "f3", "f4"])
    .deck(P2, [FILLER, FILLER, FILLER, FILLER, FILLER])
    .hand(P1, PROMISING_FUTURE, "pf");
}

describe("Ruling 8304137910b1f2ea — Promising Future stages the showdown; it only opens once everything has resolved", () => {
  test("the Striker is moved into bf1 and Contested is applied at once — but no showdown is active while cards are still resolving", async () => {
    const game = await board().build();
    await game.p1.cast("pf");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Promising Future resolves: each player looks at 5 and banishes 1

    await game.p1.pick("rtw"); // P1 banishes Ride the Wind
    const p2Pick = game.decision();
    expect(p2Pick).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick(p2Pick?.kind === "pick" ? p2Pick.options[0]!.key : "");

    // The banished cards are played starting with the next player: P2's Filler first, then P1's Ride the Wind.
    for (let i = 0; i < 6 && !(game.locationOf("striker") === "bf1"); i++) {
      const d = game.decision();
      if (d?.kind === "action" && game.chain().length > 0) await game.acting().passPriority();
      else if (d?.kind === "pick") await game.seat(d.seat).pick(d.options.find((o) => (o.zone ?? o.card ?? o.key).includes("bf1"))?.key ?? d.options[0]!.key);
      else break;
    }

    expect(game.locationOf("striker")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.chain().length).toBeGreaterThan(0); // P2's played Filler is still on the chain
    expect(activeShowdowns(game)).toEqual([]); // …so the showdown is only STAGED
    expect(game.state("striker").combatRole).toBeNull();
    expect(game.state("guard").combatRole).toBeNull();
  });

  test("once the chain finally empties the staged showdown opens, with the designations handed out then", async () => {
    const game = await board().build();
    await game.p1.cast("pf");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("rtw");
    const p2Pick = game.decision();
    await game.p2.pick(p2Pick?.kind === "pick" ? p2Pick.options[0]!.key : "");
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (d?.kind === "action" && game.chain().length > 0) await game.acting().passPriority();
      else if (d?.kind === "pick") await game.seat(d.seat).pick(d.options.find((o) => (o.zone ?? o.card ?? o.key).includes("bf1"))?.key ?? d.options[0]!.key);
      else break;
    }
    expect(game.chain()).toEqual([]);
    expect(activeShowdowns(game)).toEqual(["bf1"]);
    expect(game.state("striker").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });

    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.violations()).toEqual([]);
  });
});

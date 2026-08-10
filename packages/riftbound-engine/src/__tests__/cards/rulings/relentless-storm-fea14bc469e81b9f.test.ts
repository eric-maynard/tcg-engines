/**
 * Ruling fea14bc469e81b9f — Relentless Storm (Volibear legend, OGN-249 → ogn-249-298) "When you play a [Mighty] unit, you
 *     may exhaust me to channel 1 rune exhausted."
 *   × Here to Help (SFD-111 → sfd-111-221) · [Hidden] [Action] · [2][body] "You may play a unit from hand to a battlefield you
 *     control, reducing its cost by [3]."
 *   × Towering Combatant (UNL-099 → unl-099-219) · [4] · 3 Might · "[Shield 2] (+2 [Might] while I'm a defender.) [Tank]"
 *
 * Q: While defending I use Here to Help to play Towering Combatant. Does Volibear's legend trigger?
 * A: No. Volibear checks the unit's Might as it is played: Towering Combatant is played as a 3. Its +2 only applies while it
 *    is a defender — a designation it picks up after entering — so it was not a Mighty unit when played, even though it
 *    ends up at 5 in that combat.
 * Rules: 730 (Mighty = 5+), 383 (trigger condition checked at the event), 726 (Shield: +N while defending), 464.2.c.3
 *        (a unit arriving mid-combat gains its side's designation at the following Cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELENTLESS_STORM = "ogn-249-298";
const HERE_TO_HELP = "sfd-111-221";
const TOWERING_COMBATANT = "unl-099-219";
/** Control: a printed-5 unit at the same [4] cost. */
const BIG = { cardType: "unit", energyCost: 4, might: 5, name: "Printed Five" } as const;

/**
 * P2's turn. P1 (Volibear legend) holds bf1 with a Warden (3); P1 has Here to Help + the unit under test in hand and exactly
 * [3] + [body] (2+body for the spell, 4−3 = 1 for the unit). P2's Raider (6) attacks from base.
 */
function board(unit: string | typeof BIG) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { body: 1 } })
    .legend(P1, RELENTLESS_STORM, "voli")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
    .hand(P1, HERE_TO_HELP, "h2h")
    .hand(P1, unit, "newcomer");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks; P2 passes Focus; P1 casts Here to Help and plays the newcomer through it to bf1. Reports the legend's behaviour (answers no). */
async function defendWithHereToHelp(game: Game): Promise<{ asked: boolean; sawTrigger: boolean }> {
  await game.p2.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, defendingPlayer: P1, isCombatShowdown: true });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "h2h")).toBe(true);
  await game.p1.cast("h2h");
  expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0 } });
  let asked = false;
  let sawTrigger = false;
  for (let i = 0; i < 12; i++) {
    sawTrigger ||= game.chain().some((c) => c.cardId === "voli");
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      const unit = d.options.find((o) => (o.card ?? o.key) === "newcomer");
      const dest = d.options.find((o) => o.key.includes("bf1"));
      await game.p1.pick((unit ?? dest ?? d.options[0])!.key);
    } else if (d.kind === "yes-no" && d.seat === P1) {
      if (d.source?.cardId === "voli") {
        asked = true;
        await game.p1.no();
      } else {
        await game.p1.yes(); // "you may play a unit"
      }
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  sawTrigger ||= game.chain().some((c) => c.cardId === "voli");
  return { asked, sawTrigger };
}

describe("Ruling fea14bc469e81b9f — Towering Combatant played (via Here to Help) while defending is not 'played Mighty' for Volibear", () => {
  test("Here to Help while defending: Towering Combatant comes down at bf1 for [1] (4 − 3), joins as a DEFENDER and shows 5 Might there (3 + Shield 2)", async () => {
    const game = await board(TOWERING_COMBATANT).build();
    await defendWithHereToHelp(game);
    expect(game.zoneOf("h2h")).toBe("trash");
    expect(game.zoneOf("newcomer")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("newcomer").combatRole).toBe("defender");
    expect(game.state("newcomer")).toMatchObject({ baseMight: 3, might: 5 });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
  });

  test("…but it was PLAYED as a 3: Volibear's legend never triggers — no 'exhaust me?' prompt, nothing from the legend on the chain, legend ready, no rune channeled", async () => {
    const game = await board(TOWERING_COMBATANT).build();
    const runesBefore = game.p1.runes().length;
    const r = await defendWithHereToHelp(game);
    expect(r.asked).toBe(false);
    expect(r.sawTrigger).toBe(false);
    expect(game.state("voli").isExhausted).toBe(false);
    expect(game.p1.runes()).toHaveLength(runesBefore);
    expect(game.violations()).toEqual([]);
  });

  test("control: a PRINTED 5-Might unit played the very same way IS a Mighty unit as played — Volibear asks (P1's yes/no from the legend)", async () => {
    const game = await board(BIG).build();
    const r = await defendWithHereToHelp(game);
    expect(game.zoneOf("newcomer")).toBe("battlefield-bf1");
    expect(r.asked || r.sawTrigger).toBe(true);
  });
});

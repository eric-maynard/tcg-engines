/**
 * Ruling 4d4207f571210272 — The Boss (OGN-269 → ogn-269-298, Sett legend)
 *     "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal it, exhaust it, and
 *      recall it instead."
 *   × Imperial Decree (OGN-221 → ogn-221-298) · Action · [5][order][order] "When any unit takes damage this turn, kill it."
 *
 * Q: Can the Sett legend save a unit that dies to Imperial Decree?
 * A: If the unit only dies from the Decree's trigger (non-lethal damage), Sett saves it and it lives. If the damage was LETHAL,
 *    Sett replaces that death (recall/heal/exhaust, buff spent) but the Decree trigger — referencing the unit that "was"
 *    damaged — still resolves afterwards and kills the now-unbuffed unit.
 * Rules: 371–373 (replacement applies to one death event; buff spent), 383 (delayed trigger finalized in the same cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_BOSS = "ogn-269-298";
const IMPERIAL_DECREE = "ogn-221-298";

const spell = (name: string, amount: number) => ({
  abilities: [{ effect: { amount, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name,
  timing: "action",
});
const STING = spell("Test Sting", 1); // non-lethal on the 3-Might buffed Bruiser
const BOLT = spell("Test Bolt", 3); // lethal

/**
 * P1's turn. P1 (The Boss, ready): BUFFED Bruiser (2+1 = 3) at P1's bf1; Imperial Decree, Sting and Bolt in hand;
 * [6] + 2 order (Decree + one 1-cost spell) + 1 body for the Boss's [rainbow].
 */
function board() {
  return scenario()
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { energy: 6, power: { body: 1, order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Bruiser" }, "bruiser", { buffed: true })
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, STING, "sting")
    .hand(P1, BOLT, "bolt");
}

async function decreeActive(): Promise<Game> {
  const game = await board().build();
  expect(game.state("bruiser")).toMatchObject({ isBuffed: true, might: 3 });
  await game.p1.cast("decree");
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

/** Pass priorities until P1 faces the Boss's yes/no (or the main phase). */
async function toBossPrompt(game: Game): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.kind === "yes-no" || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      return;
    }
  }
}

describe("Ruling 4d4207f571210272 — Sett saves a unit from Imperial Decree only when the Decree kill is the sole death", () => {
  test("NON-lethal damage (Sting, 1): the only death is the Decree's kill → the Boss is asked, YES saves the Bruiser for good (base, healed, exhausted, unbuffed), Boss exhausted, [rainbow] paid", async () => {
    const game = await decreeActive();
    await game.p1.cast("sting", { targets: "bruiser" });
    await toBossPrompt(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    await game.p1.yes();
    await toBossPrompt(game);
    expect(game.decision()?.kind).not.toBe("yes-no"); // no second death to answer for
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("base");
    expect(game.state("bruiser")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 2 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("LETHAL damage (Bolt, 3): the cleanup death is replaced by the Boss (Bruiser recalled to base, healed, exhausted, buff spent) while the Decree trigger is put on the chain…", async () => {
    const game = await decreeActive();
    await game.p1.cast("bolt", { targets: "bruiser" });
    await toBossPrompt(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    await game.p1.yes();
    // Right after the save: the Bruiser sits in base unbuffed, and Imperial Decree's kill is pending on the chain.
    expect(game.zoneOf("bruiser")).toBe("base");
    expect(game.state("bruiser")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.chain().length).toBeGreaterThanOrEqual(1);
  });

  test("…and when the Decree trigger resolves it kills the Bruiser anyway (unbuffed now — no second save is even offered): it ends in the trash", async () => {
    const game = await decreeActive();
    await game.p1.cast("bolt", { targets: "bruiser" });
    await toBossPrompt(game);
    await game.p1.yes();
    await toBossPrompt(game);
    expect(game.decision()?.kind).not.toBe("yes-no"); // buff already spent → the Boss cannot apply again
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

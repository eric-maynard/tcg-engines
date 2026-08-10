/**
 * Interaction: Switcheroo (sfd-145-221, Spell · Chaos · 2 + [chaos][chaos] · Action)
 *     "Swap the Might of two units at the same battlefield this turn."
 *   × Dragon Form (ven-116-166, Spell · Order · 3) "Choose a unit. Its base Might becomes 5 this turn."
 *   × Grand Duelist (sfd-205-221, Legend · Fiora) "When one of your units becomes [Mighty], you may exhaust me
 *     to channel 1 rune exhausted."
 *   with Daring Poro (ogn-210-298, 2 Might, P1, NOT attacking) and Leona, Zealot (ogn-079-298, 6 Might, P2) at bf1.
 *
 * Question:
 *   (a) t1: Switcheroo on the two units — both Mights, what kind of effects in which layer, does Grand Duelist trigger?
 *   (b) t2: Dragon Form on Leona afterwards, hoping to undo the swap — is she 5, or something else?
 *   (c) Contrast: Dragon Form on the swapped-up Poro — 5 or 9?
 *   (d) Contrast: Dragon Form on Leona resolves BEFORE Switcheroo — layer-1 / layer-3 breakdown; where timestamps matter.
 *
 * Rules: 433.1.a-b (Swap = difference of CURRENT values → +diff on the lower, −diff on the higher, two independent
 * effects for the duration), 477.3 / 480.1 (arithmetic layer; non-passive amounts are fixed when applied), 477.1.a.1
 * (Might ASSIGNMENT is layer 1 regardless of timestamp), 480 (timestamps order effects only WITHIN a layer),
 * 709 / 710 (a unit "becomes Mighty" only when crossing <5 → ≥5), 317 ("this turn" ends at Expiration).
 *
 * Expected: (a) diff 6−2 = 4 → Poro +4 = 6 (base still 2), Leona −4 = 2 (base still 6); Poro crossed → Grand Duelist
 * offers its "you may exhaust". (b) Leona: layer 1 base = 5, layer 3 −4 → 1 (not 5). (c) Poro: base 5, +4 → 9, no second
 * "becomes Mighty". (d) Form first: Leona 5; Switcheroo diff 5−2 = 3 → Poro 5 (becomes Mighty → Grand Duelist), Leona 2.
 * End of turn: Poro 2, Leona 6.
 *
 * Note: Dragon Form is standard-speed, so within a single turn only the turn player can sequence both spells; P1 casts
 * both here (it says "a unit" — enemy Leona is a legal choice). Who controls the effect is irrelevant to its layer.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const DRAGON_FORM = "ven-116-166";
const GRAND_DUELIST = "sfd-205-221";
const DARING_PORO = "ogn-210-298";
const LEONA_ZEALOT = "ogn-079-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2 + 3, power: { chaos: 2 } })
    .legend(P1, GRAND_DUELIST, "gd")
    .runes(P1, "order", 1)
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "bf1", DARING_PORO, "poro")
    .unit(P2, "bf1", LEONA_ZEALOT, "leona")
    .hand(P1, SWITCHEROO, "sw")
    .hand(P1, DRAGON_FORM, "form");
}

/** Cast Switcheroo on (poro, leona) and drain until either the open main phase or Grand Duelist's opt-in prompt. */
async function switcheroo(game: Game): Promise<void> {
  await game.p1.cast("sw", { targets: ["poro", "leona"] });
  await game.settle();
}

/** Is Grand Duelist's "you may exhaust me" being offered to P1 right now? If so, decline it and settle. */
async function grandDuelistOffered(game: Game): Promise<boolean> {
  const d = game.decision();
  const offered = d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "gd";
  if (offered) {
    await game.p1.no();
    await game.settle();
  }
  return offered;
}

async function dragonForm(game: Game, target: string): Promise<void> {
  await game.p1.cast("form", { targets: target });
  await game.settle();
}

describe("Switcheroo then Dragon Form — set (layer 1) vs add (layer 3)", () => {
  test("setup: Poro 2 (not attacking, no Assault bonus), Leona 6, Grand Duelist ready", async () => {
    const game = await board().build();
    expect(game.state("poro")).toMatchObject({ baseMight: 2, might: 2, mightModifier: 0 });
    expect(game.state("leona")).toMatchObject({ baseMight: 6, might: 6, mightModifier: 0 });
    expect(game.state("gd").isReady).toBe(true);
  });

  test("(a) Switcheroo: diff 4 → two arithmetic modifiers, +4 on the Poro (2 → 6) and −4 on Leona (6 → 2); printed bases untouched (433.1.a-b, 477.3)", async () => {
    const game = await board().build();
    await switcheroo(game);
    await grandDuelistOffered(game);
    expect(game.state("poro")).toMatchObject({ baseMight: 2, might: 6, mightModifier: 4 });
    expect(game.state("leona")).toMatchObject({ baseMight: 6, might: 2, mightModifier: -4 });
    expect(game.zoneOf("sw")).toBe("trash");
  });

  test("(a) the Poro crossed <5 → ≥5, so it 'became Mighty': Grand Duelist's optional exhaust is offered to P1 (709/710); accepting exhausts the legend and channels 1 rune exhausted", async () => {
    const game = await board().build();
    const runesBefore = game.p1.runes().length;
    await switcheroo(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "gd" } });
    await game.p1.yes();
    expect(game.state("gd").isExhausted).toBe(true);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(b) Dragon Form on Leona AFTER the swap does not undo it: layer 1 base = 5, layer 3 keeps the remembered −4 → Leona is 1, not 5 (477.1.a.1, 480)", async () => {
    const game = await board().build();
    await switcheroo(game);
    await grandDuelistOffered(game);
    await dragonForm(game, "leona");
    expect(game.state("leona").might).toBe(1);
    expect(game.state("leona").mightModifier).toBe(-4);
    expect(game.state("poro").might).toBe(6); // the Poro's half is independent (433.1.a)
    expect(game.zoneOf("leona")).toBe("battlefield-bf1"); // undamaged: smaller, not dead
    expect(game.zoneOf("form")).toBe("trash");
    expect(await grandDuelistOffered(game)).toBe(false); // nobody of P1's became Mighty
  });

  test("(c) Dragon Form on the swapped-up Poro: base 5 + 4 = 9 — and no second 'becomes Mighty' (it already was), so Grand Duelist is NOT offered again", async () => {
    const game = await board().build();
    await switcheroo(game);
    expect(await grandDuelistOffered(game)).toBe(true); // declined → legend still ready, so a second trigger WOULD be visible
    expect(game.state("gd").isReady).toBe(true);
    await dragonForm(game, "poro");
    expect(await grandDuelistOffered(game)).toBe(false);
    expect(game.state("poro").might).toBe(9);
    expect(game.state("poro").mightModifier).toBe(4);
    expect(game.state("leona").might).toBe(2);
  });

  test("(d) order matters for the AMOUNT: Dragon Form on Leona first (→ 5), then Switcheroo measures 5 − 2 = 3 → Poro 2 + 3 = 5, Leona 5 − 3 = 2", async () => {
    const game = await board().build();
    await dragonForm(game, "leona");
    expect(game.state("leona").might).toBe(5);
    expect(await grandDuelistOffered(game)).toBe(false); // Leona is P2's unit — not "one of your units"
    await switcheroo(game);
    // Poro 2 → 5 is a crossing → Grand Duelist offered.
    expect(await grandDuelistOffered(game)).toBe(true);
    expect(game.state("poro")).toMatchObject({ baseMight: 2, might: 5, mightModifier: 3 });
    expect(game.state("leona")).toMatchObject({ might: 2, mightModifier: -3 });
  });

  test("everything is 'this turn': after the turn ends the Poro is 2 and Leona 6 again, in either ordering (317)", async () => {
    const swapFirst = await board().build();
    await switcheroo(swapFirst);
    await grandDuelistOffered(swapFirst);
    await dragonForm(swapFirst, "leona");
    await swapFirst.advanceTurn();
    expect(swapFirst.turnPlayer()).toBe(P2);
    expect(swapFirst.state("poro")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(swapFirst.state("leona")).toMatchObject({ might: 6, mightModifier: 0 });

    const formFirst = await board().build();
    await dragonForm(formFirst, "leona");
    await switcheroo(formFirst);
    await grandDuelistOffered(formFirst);
    await formFirst.advanceTurn();
    expect(formFirst.state("poro").might).toBe(2);
    expect(formFirst.state("leona").might).toBe(6);
    expect(formFirst.violations()).toEqual([]);
  });
});

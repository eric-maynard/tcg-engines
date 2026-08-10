/**
 * Ruling d04623892609c111 — Svellsongur (sfd-059-221) × Aphelios, Exalted (sfd-049-221)
 *   Svellsongur — Equipment · [Equip][1][calm]: "As this is attached to a unit, copy that unit's text to this Equipment's
 *   effect text for as long as this is attached to it."
 *   Aphelios — Unit · 4 Might: "When you attach an Equipment to me, choose one that hasn't been chosen this turn — Ready 2
 *   runes. / Channel 1 rune exhausted. / Buff a friendly unit."
 *
 * Q: With Svellsongur on Aphelios, is the "each mode only once per turn" limit bypassed — can each mode be used twice?
 * A: Effectively yes: Aphelios now has TWO instances of the ability (printed + Svellsongur's copy). They are separate
 *    abilities that trigger independently, and each tracks its own "hasn't been chosen this turn" — so the same mode
 *    can be picked once from each (e.g. channel 2 runes in a turn). Not a bypass; two abilities, two restrictions.
 *    Note: ruling 41492fa40ce64fb4 fixes that Svellsongur's OWN attach yields a single trigger (the copy is made as part of
 *    that event and does not look back), so the two-instance behaviour is exercised on the NEXT Equipment attached.
 * Rules: 370.1.b (as-attached copy), 383.2.c (trigger evaluation), 355.3 / choose-one bookkeeping per ability.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const SVELLSONGUR = "sfd-059-221";
const APHELIOS = "sfd-049-221";
/** Inline second Equipment: [Equip][1], +1 Might. */
const BLADE = { abilities: [{ cost: { energy: 1 }, keyword: "Equip", type: "keyword" }], cardType: "equipment", energyCost: 1, mightBonus: 1, name: "Test Blade" } as const;

type Pick = Extract<Decision, { kind: "pick" }>;

/** P1's turn: Aphelios + Bystander in base, Svellsongur and the Blade in base (unattached), [2] + 1 calm, three EXHAUSTED calm runes. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .unit(P1, "base", APHELIOS, "aph")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "ally")
    .gear(P1, SVELLSONGUR, "svell")
    .gear(P1, BLADE, "blade")
    .runes(P1, "calm", 3, { exhausted: true });
}

const aphTriggers = (game: Game) => game.chain().filter((c) => c.cardId === "aph" && c.triggered);
const modeLabels = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.label) : []);

/** Pay [Equip] to attach `equipment` to Aphelios and let the Equip item resolve (both pass) so the attach happens. */
async function attach(game: Game, equipment: string): Promise<void> {
  await game.p1.do("equipCard", { equipmentId: equipment, unitId: "aph" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.state(equipment).attachedTo).toBe("aph");
}

/** Svellsongur goes on first; its single trigger picks "Channel 1 rune exhausted" and resolves. */
async function svellOnChoosingChannel(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.runes()).toHaveLength(3);
  await attach(game, "svell");
  expect(aphTriggers(game)).toHaveLength(1); // 41492fa40ce64fb4 — one trigger on Svellsongur's own attach
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "aph", pendingChoiceType: "choose-mode" } });
  expect(modeLabels(d)).toEqual(["Ready 2 runes", "Channel 1 rune exhausted", "Buff a friendly unit"]);
  await game.p1.pick((d as Pick).options.find((o) => o.label === "Channel 1 rune exhausted")!.key);
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.p1.runes()).toHaveLength(4); // channeled 1 (exhausted)
  return game;
}

describe("Ruling d04623892609c111 — Svellsongur gives Aphelios a second, independent copy of his attach trigger", () => {
  test("once attached, Svellsongur carries a copy of Aphelios's text (two instances of the ability now exist on him)", async () => {
    const game = await svellOnChoosingChannel();
    expect(game.state("aph").attachments).toEqual(["svell"]);
    expect(game.state("svell").meta.copiedFromCardId).toBe("aph");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0 } }); // paid [1][calm]
  });

  test("attaching ANOTHER Equipment to Aphelios now fires BOTH instances: two separate Aphelios triggers go on the chain, each asking P1 for its own mode", async () => {
    const game = await svellOnChoosingChannel();
    await attach(game, "blade");
    expect(aphTriggers(game)).toHaveLength(2);
    const first = game.decision();
    expect(first).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "aph", pendingChoiceType: "choose-mode" } });
    await game.p1.pick((first as Pick).options.find((o) => o.label === "Ready 2 runes")!.key);
    const second = game.decision();
    expect(second).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "aph", pendingChoiceType: "choose-mode" } });
    expect((second as Pick).source?.chainItemId).not.toBe((first as Pick).source?.chainItemId);
  });

  // Expected: the COPIED instance has never chosen anything this turn, so on the Blade attach at least one of the two
  // triggers still offers "Channel 1 rune exhausted" (only the printed instance used it on Svellsongur's attach); taking it
  // channels a second rune this turn (4 → 5). Actual: the engine keeps ONE "chosen this turn" set per Aphelios shared by
  // both instances — neither trigger offers Channel again (both list only Ready 2 runes / Buff a friendly unit).
  test("ruling d04623892609c111 — each instance tracks its own once-per-turn modes, so 'Channel 1 rune exhausted' can be chosen again from the copy (engine shares one chosen-set across both instances)", async () => {
    const game = await svellOnChoosingChannel();
    await attach(game, "blade");
    expect(aphTriggers(game)).toHaveLength(2);
    const offers: string[][] = [];
    let channeledAgain = false;
    for (let i = 0; i < 2; i++) {
      const d = game.decision();
      if (d?.kind !== "pick" || d.source?.pendingChoiceType !== "choose-mode") {
        break;
      }
      offers.push(modeLabels(d));
      const channel = d.options.find((o) => o.label === "Channel 1 rune exhausted");
      if (channel && !channeledAgain) {
        channeledAgain = true;
        await game.p1.pick(channel.key);
      } else {
        await game.p1.pick(d.options.find((o) => o.label === "Ready 2 runes")?.key ?? d.options[0]!.key);
      }
    }
    expect(offers).toHaveLength(2);
    expect(offers.some((labels) => labels.includes("Channel 1 rune exhausted"))).toBe(true); // the copy's own menu is untouched
    expect(offers.some((labels) => !labels.includes("Channel 1 rune exhausted"))).toBe(true); // the printed one already used it
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.runes()).toHaveLength(5); // Channel chosen twice this turn — once per instance
  });

  test("contrast — WITHOUT Svellsongur a lone Aphelios has one instance: the second attach this turn triggers once and 'Channel 1 rune exhausted' (already chosen) is no longer offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", APHELIOS, "aph")
      .unit(P1, "base", { might: 2, name: "Bystander" }, "ally")
      .gear(P1, BLADE, "blade")
      .gear(P1, { ...BLADE, name: "Test Blade Two" }, "blade2")
      .runes(P1, "calm", 3, { exhausted: true })
      .build();
    await attach(game, "blade");
    expect(aphTriggers(game)).toHaveLength(1);
    let d = game.decision();
    expect(modeLabels(d)).toContain("Channel 1 rune exhausted");
    await game.p1.pick((d as Pick).options.find((o) => o.label === "Channel 1 rune exhausted")!.key);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(4);
    await attach(game, "blade2");
    expect(aphTriggers(game)).toHaveLength(1);
    d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "aph", pendingChoiceType: "choose-mode" } });
    expect(modeLabels(d)).toEqual(["Ready 2 runes", "Buff a friendly unit"]);
    await game.p1.pick((d as Pick).options.find((o) => o.label === "Ready 2 runes")!.key);
    await game.settle({ policy: "first" });
    expect(game.p1.runes()).toHaveLength(4); // no second channel
    expect(game.p1.runes({ ready: true })).toHaveLength(2); // "Ready 2 runes"
    expect(game.violations()).toEqual([]);
  });
});

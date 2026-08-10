/**
 * Ruling d7c19302b3e75136 — Aphelios, Exalted (SFD-049 → sfd-049-221) · 4 Might "When you attach an Equipment to me, choose one
 *   that hasn't been chosen this turn — Ready 2 runes. Channel 1 rune exhausted. Buff a friendly unit."
 *   × Svellsongur (SFD-059 → sfd-059-221, Equipment, [Equip] [1][calm]) "As this is attached to a unit, copy that unit's text to this
 *     Equipment's effect text for as long as this is attached to it."   (+ Doran's Blade sfd-095-221 as a plain second Equipment)
 *
 * Q: Attaching Svellsongur to Aphelios — does the copied second instance of his ability exist in time to trigger too? Must the two
 *    instances pick different options?
 * A: Yes, the copy is there in time and it triggers as well. "Hasn't been chosen this turn" is tracked per INSTANCE, so both may
 *    pick the same option; each copy tracks its own used options.
 * Rules: 401–402 (copying text), 383.2 (trigger evaluation), 355.3 / modal "not chosen this turn" bookkeeping per ability instance.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const APHELIOS = "sfd-049-221";
const SVELLSONGUR = "sfd-059-221";
const DORANS_BLADE = "sfd-095-221";
const MODES = ["Ready 2 runes", "Channel 1 rune exhausted", "Buff a friendly unit"];

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { body: 1, calm: 1 } }) // Svellsongur [1][calm] + Doran's Blade [body]
    .unit(P1, "base", APHELIOS, "aph")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "ally")
    .gear(P1, SVELLSONGUR, "svell")
    .gear(P1, DORANS_BLADE, "dorans")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker");
}

const aphTriggers = (game: Game) => game.chain().filter((c) => c.cardId === "aph" && c.triggered);

/** Activate Svellsongur's Equip onto Aphelios and let the Equip item resolve (the attach happens on resolution). */
async function attachSvell(game: Game): Promise<void> {
  await game.p1.do("equipCard", { equipmentId: "svell", unitId: "aph" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.state("svell").attachedTo).toBe("aph");
  expect(game.state("svell").meta.copiedFromCardId).toBe("aph"); // Svellsongur now carries Aphelios's text
}

describe("Ruling d7c19302b3e75136 — Aphelios × Svellsongur: two ability instances, each with its own 'not chosen this turn' memory", () => {
  test("premise: attaching Svellsongur copies Aphelios's text onto it and Aphelios's trigger asks P1 for one of the three modes", async () => {
    const game = await board().build();
    await attachSvell(game);
    expect(aphTriggers(game).length).toBeGreaterThanOrEqual(1);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.label) : []).toEqual(MODES);
  });

  // RULING-CONFLICT: riftjudge 41492fa40ce64fb4 (same two cards) says Aphelios triggers exactly ONCE off Svellsongur — the copy is
  // added by a replacement to the one attachment event and copied text does not look back — and the engine follows that ruling.
  // Expected here (d7c19302b3e75136): the copied instance exists in time and ALSO triggers → two Aphelios items on the chain.
  // Actual: one.
  test.failing("BUG: ruling d7c19302b3e75136 — engine puts only ONE Aphelios trigger on the chain when Svellsongur is attached (the copied instance does not trigger off its own attachment)", async () => {
    const game = await board().build();
    await attachSvell(game);
    // Answer finalization prompts (mode → target) for however many instances exist, then count the items.
    for (let i = 0; i < 6; i++) {
      const d: Decision | null = game.decision();
      if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => o.label === "Buff a friendly unit")) {
        await game.p1.chooseMode(2); // both instances may pick the SAME option
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.some((o) => o.key === "ally") ? "ally" : d.options[0]!.key);
      } else if (d?.kind === "order") {
        break;
      } else {
        break;
      }
    }
    expect(aphTriggers(game)).toHaveLength(2);
    await game.settle({ policy: "first" });
    expect(["aph", "ally"].filter((id) => game.state(id).isBuffed)).toHaveLength(2); // two Buffs from two instances
  });

  test("per-instance memory (engine-reachable via a SECOND Equipment): after Aphelios's own instance chose Buff for Svellsongur, attaching Doran's Blade triggers BOTH instances — his own no longer offers Buff, the Svellsongur copy still offers all three (so Buff can be picked again), and P1 orders the two simultaneous triggers", async () => {
    const game = await board().build();
    await attachSvell(game);
    // Instance A (Aphelios himself): choose Buff → Bystander.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.chooseMode(2);
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
    }
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });

    // Second Equipment this turn → both instances trigger.
    await game.p1.do("equipCard", { equipmentId: "dorans", unitId: "aph" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("dorans").attachedTo).toBe("aph");
    expect(aphTriggers(game)).toHaveLength(2);
    const offers: string[][] = [];
    let sawOrder = false;
    for (let i = 0; i < 8; i++) {
      const d: Decision | null = game.decision();
      if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => MODES.includes(o.label))) {
        const labels = d.options.map((o) => o.label);
        offers.push(labels);
        // Pick Buff where offered (the copy), else Channel.
        await game.p1.chooseMode(labels.includes("Buff a friendly unit") ? 2 : 1);
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.some((o) => o.key === "aph") ? "aph" : d.options[0]!.key);
      } else if (d?.kind === "order") {
        expect(d.seat).toBe(P1);
        sawOrder = true;
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(offers).toHaveLength(2);
    const sorted = [...offers].sort((a, b) => a.length - b.length);
    expect(sorted[0]).toEqual(["Ready 2 runes", "Channel 1 rune exhausted"]); // Aphelios's own instance: Buff already used this turn
    expect(sorted[1]).toEqual(MODES); // Svellsongur's copied instance: nothing chosen yet — Buff is available AGAIN
    expect(sawOrder).toBe(true);
    await game.settle({ policy: "first" });
    expect(game.chain()).toEqual([]);
    expect(game.state("aph").isBuffed).toBe(true); // the copy's Buff landed on Aphelios: same option chosen by both instances this turn
    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling c30802de9d73ce11 — Stand United (OGN-053 → ogn-053-298) · Spell · Calm · 3 · [Hidden] [Action]
 *     "Buff a friendly unit. Buffs give an additional +1 Might to friendly units this turn."
 *   × Mystic Reversal (OGN-080 → ogn-080-298) · Spell · Calm · 4+[calm]×3 · Reaction
 *     "Gain control of a spell. You may make new choices for it."
 *
 * Q: A plays Stand United from hidden at battlefield A on their unit; B Mystic Reversals it. (1) Does it keep the "here"
 *    (battlefield A) targeting restriction? (2) If B controls no units at A, how does it resolve?
 * A: (1) Yes — the new controller may only re-choose among THEIR units at battlefield A. (2) With none there B cannot
 *    re-choose; the original target is not friendly to B so the buff fails, but B still gets the non-targeted rider
 *    ("buffs give +1 Might to friendly units this turn"). The spell is not replayed; it was already finalized.
 * Rules: 811.1.d.2 (hidden: chosen objects must be here), 751–755 (new choices for a controlled spell), 359.3.f
 *        (illegal target → that instruction fails; independent effects still apply).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAND_UNITED = "ogn-053-298";
const MYSTIC_REVERSAL = "ogn-080-298";

const isNewChoices = (d: Decision | null) => d?.kind === "pick" && d.seat === P2 && d.newChoices !== undefined;

/** Drive the chain: pass priority; hand back at the first non-priority prompt (or when the chain is empty). */
async function passUntilPrompt(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain" && game.chain().length > 0) {
      await game.seat(d.seat).passPriority();
    } else {
      return d;
    }
  }
  return game.decision();
}

describe("Ruling c30802de9d73ce11 (1) — a Reversed hidden Stand United keeps its 'here' restriction", () => {
  test("B's turn, B's Raider is attacking battlefield A: after Mystic Reversal resolves, B's new-choices dialog for the target offers ONLY B's unit at A (the Raider) — never B's unit at battlefield B or in base", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 4, power: { calm: 3 } })
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P2 })
      .unit(P1, "bfA", { might: 2, name: "Mine" }, "mine")
      .unit(P1, "bfA", { might: 2, name: "Mine Too" }, "mine2")
      .unit(P2, "bfB", { might: 2, name: "Theirs at B" }, "theirsB")
      .unit(P2, "base", { might: 2, name: "Theirs Home" }, "theirsHome")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .facedown(P1, "bfA", STAND_UNITED, "su")
      .hand(P2, MYSTIC_REVERSAL, "mr")
      .build();
    await game.p2.move("raider", "bfA");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.reveal("su", { answers: ["mine"] });
    if (game.decision()?.kind === "pick" && game.actingSeat() === P1) {
      await game.p1.pick("mine");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "su", controller: P1, targets: ["mine"] })]);
    await game.p1.passPriority();
    await game.p2.cast("mr", { targets: "su" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    const d = await passUntilPrompt(game); // Mystic Reversal resolves → B controls Stand United → new choices
    expect(game.zoneOf("mr")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "su", controller: P2 })]);
    expect(isNewChoices(d)).toBe(true);
    const offered = d?.kind === "pick" ? d.options.filter((o) => !o.current).map((o) => o.card ?? o.key) : [];
    expect(offered).toEqual(["raider"]); // here (bfA) and friendly to B — nothing from bfB or B's base
    expect(offered).not.toContain("theirsB");
    expect(offered).not.toContain("theirsHome");
    await game.p2.pick("raider");
    await passUntilPrompt(game);
    expect(game.zoneOf("su")).toBe("trash");
    expect(game.state("raider")).toMatchObject({ isBuffed: true, might: 5 }); // 3 + buff 1 + rider 1
    expect(game.state("mine").isBuffed).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling c30802de9d73ce11 (2) — B controls no unit at A: no re-choice, the buff fails, B still gets the rider", () => {
  /** A's turn: Mine (2) at A's bfA with Stand United hidden there; A also has an already-buffed unit in base. B: units at bfB / base only (one already buffed), Mystic Reversal with exactly 4+[calm]×3. */
  function board() {
    return scenario()
      .turn(3)
      .resources(P2, { energy: 4, power: { calm: 3 } })
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P2 })
      .unit(P1, "bfA", { might: 2, name: "Mine" }, "mine")
      .unit(P1, "base", { might: 2, name: "My Buffed" }, "myBuffed", { buffed: true })
      .unit(P2, "bfB", { might: 2, name: "Theirs at B" }, "theirsB")
      .unit(P2, "base", { might: 2, name: "Their Buffed" }, "theirBuffed", { buffed: true })
      .facedown(P1, "bfA", STAND_UNITED, "su")
      .hand(P2, MYSTIC_REVERSAL, "mr");
  }

  async function reversed(): Promise<Game> {
    const game = await board().build();
    expect(game.state("myBuffed").might).toBe(3);
    expect(game.state("theirBuffed").might).toBe(3);
    await game.p1.reveal("su"); // Mine is the only friendly unit here → locked without asking
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "su", controller: P1, targets: ["mine"] })]);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "mr")).toBe(true);
    await game.p2.cast("mr", { targets: "su" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["su", "mr"]);
    return game;
  }

  test("Mystic Reversal resolves: B now controls the SAME Stand United item (still targeting Mine — not replayed), and B is offered no new target because B has no unit at battlefield A", async () => {
    const game = await reversed();
    let sawNewChoiceWithOptions = false;
    for (let i = 0; i < 12 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (isNewChoices(d)) {
        const fresh = d?.kind === "pick" ? d.options.filter((o) => !o.current) : [];
        if (fresh.length > 0) {
          sawNewChoiceWithOptions = true;
        }
        await game.p2.keepChoices();
      } else if (d?.kind === "action" && d.context === "chain") {
        if (game.zoneOf("mr") === "trash") {
          expect(game.chain()).toEqual([expect.objectContaining({ cardId: "su", controller: P2, targets: ["mine"] })]);
        }
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(sawNewChoiceWithOptions).toBe(false);
    expect(game.state("theirsB").isBuffed).toBe(false); // never choosable: not at A
  });

  test("on resolution for B: the buff on Mine FAILS (not friendly to B), but B's rider applies — B's already-buffed unit goes 3 → 4 this turn while A's buffed unit stays 3; Stand United ends in its OWNER's (A's) trash", async () => {
    const game = await reversed();
    for (let i = 0; i < 12 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (isNewChoices(d)) {
        await game.p2.keepChoices();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("mine")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.state("theirBuffed")).toMatchObject({ isBuffed: true, might: 4 }); // B's rider: +1 per buff on B's units
    expect(game.state("theirsB")).toMatchObject({ isBuffed: false, might: 2 }); // unbuffed → rider gives nothing
    expect(game.state("myBuffed")).toMatchObject({ isBuffed: true, might: 3 }); // A does NOT get the rider
    expect(game.zoneOf("su")).toBe("trash");
    expect(game.state("su").owner).toBe(P1);
    expect(game.p1.trash()).toContain("su");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
    // "this turn"
    await game.advanceTurn();
    expect(game.state("theirBuffed").might).toBe(3);
  });
});

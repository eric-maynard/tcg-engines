/**
 * Ruling 1dad7f3532488bcd — Deathgrip (SFD-163 → sfd-163-221) · Reaction [2] order
 *     "Kill a friendly unit. If you do, give +[Might] equal to its Might to another friendly unit this turn. Draw 1."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment +1 · "If I would die, kill Guardian Angel instead. Heal me,
 *     exhaust me, and recall me."
 *
 * Q: If I Deathgrip my own unit wearing Guardian Angel, can I still give its Might to another unit?
 * A: No. Guardian Angel replaces the death (heal/exhaust/recall, GA dies instead), so the unit was not killed and
 *    the "If you do" bonus is not met — no Might is given. The unlinked "Draw 1" still happens.
 * Rules: 366/369–373 (replacement effects), 359.3.e.14.b ("If you do" checks the action happened), 359.3.e.5.
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const DEATHGRIP = "sfd-163-221";
const GUARDIAN_ANGEL = "sfd-051-221";

/**
 * P1's turn, [2] + order. Victim (base 3) stands at P1's bf1; two possible recipients (2 and 1 Might) in base;
 * Deathgrip in hand. With `withGA`, the Victim wears Guardian Angel (3 + 1 = 4).
 */
function board(withGA: boolean) {
  let s = scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", { might: 2, name: "Recipient" }, "rec")
    .unit(P1, "base", { might: 1, name: "Other Ally" }, "other")
    .hand(P1, DEATHGRIP, "grip");
  s = withGA
    ? s
        .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim", { equippedWith: ["ga"] })
        .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "victim" }, owner: P1, zone: "bf1" })
    : s.unit(P1, "bf1", { might: 3, name: "Victim" }, "victim");
  return s;
}

describe("Ruling 1dad7f3532488bcd — Guardian Angel saving the Deathgrip victim turns off the 'If you do' Might bonus", () => {
  test("control (no Guardian Angel): the Victim dies, P1 is asked WHICH other friendly unit gets +3, the pick gets it this turn, and P1 draws 1", async () => {
    const game = await board(false).build();
    const handBefore = game.p1.hand().length; // includes Deathgrip
    await game.p1.cast("grip", { targets: "victim" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["other", "rec"]);
    await game.p1.pick("rec");
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("rec").might).toBe(5); // 2 + the Victim's 3
    expect(game.state("rec").mightModifier).toBe(3);
    expect(game.state("other").might).toBe(1);
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1); // −Deathgrip, +Draw 1
    expect(game.zoneOf("grip")).toBe("trash");
  });

  test("with Guardian Angel: the death is replaced — GA is killed instead, the Victim is healed, exhausted and recalled to base (now 3 Might without GA's +1)", async () => {
    const game = await board(true).build();
    expect(game.state("victim")).toMatchObject({ attachments: ["ga"], might: 4 });
    await game.p1.cast("grip", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ damage: 0, isExhausted: true, might: 3 });
    expect(game.p1.trash()).not.toContain("victim");
  });

  test("…so 'If you do' fails: P1 is never asked for a recipient and NO unit gains Might — but the unlinked 'Draw 1' still happens", async () => {
    const game = await board(true).build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("grip", { targets: "victim" });
    const prompts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d) {
        break;
      }
      prompts.push(`${d.kind}:${d.prompt}`);
      if (d.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]!.key); // would wrongly hand out the bonus
      } else {
        break;
      }
    }
    expect(prompts).toEqual([]); // no recipient choice was ever offered
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("rec")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.state("other")).toMatchObject({ might: 1, mightModifier: 0 });
    expect(game.state("victim").mightModifier).toBe(0);
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1); // Draw 1 is not contingent on the kill
    expect(game.zoneOf("grip")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
    expect(game.violations()).toEqual([]);
  });
});

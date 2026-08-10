/**
 * Ruling 4db92f8346cc15c0 — Grand Duelist (SFD-205 → sfd-205-221, Fiora legend) · Body/Order
 *   "When one of your units becomes [Mighty], you may exhaust me to channel 1 rune exhausted. (A unit is Mighty
 *    while it has 5+ [Might].)"
 *   × Yone, Blademaster (SFD-116 → sfd-116-221) · Unit · [5][body] · 5 Might · [Weaponmaster] …
 *
 * Q: If I play a 5-Might unit like Yone from hand, does Grand Duelist trigger?
 * A: No. A unit "becomes Mighty" only when its Might changes from below 5 to 5+. Yone enters the board already at
 *    5 — no transition happened — so nothing that triggers on "becomes Mighty" fires.
 * Rules: 709 (definition of "becomes Mighty"), 383 (trigger conditions).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRAND_DUELIST = "sfd-205-221";
const YONE_BLADEMASTER = "sfd-116-221";
const DISCIPLINE = "ogn-058-298";

/** P1's turn with Grand Duelist; [7][body] covers Yone (5+body) and Discipline (2). A 4-Might Four waits in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { body: 1 } })
    .legend(P1, GRAND_DUELIST, "gd")
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Four" }, "four")
    .hand(P1, YONE_BLADEMASTER, "yone")
    .hand(P1, DISCIPLINE, "disc")
    .script(P1, [], { strict: true }); // an unexpected "exhaust Grand Duelist?" prompt would throw in settle()
}

describe("Ruling 4db92f8346cc15c0 — entering the board at 5 Might is not 'becoming Mighty'", () => {
  test("playing Yone (5 Might) from hand: he is Mighty on arrival but Grand Duelist never triggers — no opt-in prompt, legend stays ready, no rune channeled", async () => {
    const game = await board().build();
    const runesBefore = game.p1.runes().length;
    await game.p1.play("yone");
    await game.settle(); // strict P1 script: any yes/no to P1 here would throw
    expect(game.zoneOf("yone")).toBe("base");
    expect(game.state("yone").might).toBe(5);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.state("gd").isExhausted).toBe(false);
    expect(game.p1.runes()).toHaveLength(runesBefore);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("contrast — a real transition does trigger it: Discipline takes Four from 4 to 6, Grand Duelist asks P1 (yes/no), and accepting exhausts the legend and channels 1 rune exhausted", async () => {
    const game = await board().build();
    game.clearScript(P1);
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("disc", { targets: "four" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Discipline resolves: 4 → 6, Four BECOMES Mighty
    expect(game.state("four").might).toBe(6);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.source?.cardId).toBe("gd");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gd", controller: P1, triggered: true })]);
    await game.p1.yes();
    await game.settle();
    expect(game.state("gd").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1); // channeled exhausted
    expect(game.violations()).toEqual([]);
  });

  test("contrast — already-Mighty Yone getting +2 (5 → 7) is not a transition either: no trigger", async () => {
    const game = await board().build();
    await game.p1.play("yone");
    await game.settle();
    await game.p1.cast("disc", { targets: "yone" });
    await game.settle(); // strict: would throw on a Grand Duelist prompt
    expect(game.state("yone").might).toBe(7);
    expect(game.state("gd").isExhausted).toBe(false);
    expect(game.chain()).toEqual([]);
  });
});

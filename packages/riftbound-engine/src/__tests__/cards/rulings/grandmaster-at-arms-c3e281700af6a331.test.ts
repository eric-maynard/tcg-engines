/**
 * Ruling c3e281700af6a331 — Grandmaster at Arms (Jax legend, SFD-193 → sfd-193-221)
 *     "[1], [Exhaust]: Attach a detached Equipment you control to a unit you control.
 *      [Exhaust]: Attach an attached Equipment you control to a unit you control."
 *   × Brutalizer (SFD-042 → sfd-042-221) · Equipment · +1 "[Equip] [calm] … If this was attached to me this turn, I have an
 *     additional +2 Might."
 *
 * Q: Can I use Jax's legend ability to re-equip Brutalizer onto a unit again (and get the +2 again)?
 * A: Yes. Re-attaching it to another unit detaches it (old holder loses +1/+2) and the new holder gets +1 and, since it
 *    was attached this turn, +2 more = +3. The ability has no Action/Reaction tag, so it is only usable on your turn in
 *    an Open state (empty chain, no showdown).
 * Rules: 434.1.d/f (attach anew = detach then attach; "attached this turn"), 718.4, 808/813 vs plain activated timing
 *        (336–343: non-keyworded abilities need an Open state on your turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GRANDMASTER_AT_ARMS = "sfd-193-221";
const BRUTALIZER = "sfd-042-221";
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 — only used to open a chain for the timing check

/**
 * Turn 3, P1's turn, Jax legend ready, [3] energy. Veteran (2) in base has worn Brutalizer since an EARLIER turn (2 + 1 = 3;
 * the "+2 this turn" has lapsed). Squire (2) in base is the new host. P2 holds bf1 with a Watcher.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3 })
    .legend(P1, GRANDMASTER_AT_ARMS, "jax")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Watcher" }, "watcher")
    .unit(P1, "base", { might: 2, name: "Veteran" }, "veteran", { equippedWith: ["brut"] } as Record<string, unknown>)
    .card("brut", { def: BRUTALIZER, meta: { attachedTo: "veteran" } as Record<string, unknown>, owner: P1, zone: "base" })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .hand(P1, DISCIPLINE, "disc");
}

/** Activate Jax's second ability ([Exhaust]: attach an ATTACHED Equipment) naming Brutalizer → Squire; resolve it. */
async function jaxMovesBrutalizerToSquire(game: Game): Promise<void> {
  expect(game.p1.can("activateAbility:jax#1")).toBe(true);
  await game.p1.activate("jax", 1);
  for (let i = 0; i < 8; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick") {
      break;
    }
    expect(d.seat).toBe(P1);
    const hit = d.options.find((o) => (o.card ?? o.key) === "brut") ?? d.options.find((o) => (o.card ?? o.key) === "squire");
    expect(hit).toBeDefined();
    await game.p1.pick((hit as { key: string }).key);
  }
  await game.settle();
}

describe("Ruling c3e281700af6a331 — Jax re-equips Brutalizer onto another unit for a fresh +3", () => {
  test("premise: Brutalizer attached on an earlier turn gives the Veteran only +1 (2 → 3)", async () => {
    const game = await board().build();
    expect(game.state("brut").attachedTo).toBe("veteran");
    expect(game.state("veteran")).toMatchObject({ attachments: ["brut"], might: 3 });
    expect(game.state("squire").might).toBe(2);
  });

  test("Jax's [Exhaust] ability moves it: Brutalizer detaches from the Veteran (back to a bare 2) and attaches to the Squire, who gets +1 and — attached THIS turn — +2 more: 2 + 3 = 5; Jax is exhausted, no energy spent", async () => {
    const game = await board().build();
    await jaxMovesBrutalizerToSquire(game);
    expect(game.state("jax").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(3); // the attached-Equipment mode costs only [Exhaust]
    expect(game.state("brut").attachedTo).toBe("squire");
    expect(game.state("squire")).toMatchObject({ attachments: ["brut"], might: 5 });
    expect(game.state("veteran")).toMatchObject({ attachments: [], might: 2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
    // The +2 is "this turn": next time it is P1's turn the Squire is just 2 + 1.
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.state("squire").might).toBe(3);
  });

  test("timing: the ability has no Action/Reaction tag — not usable while a chain is open (P1's own Discipline pending) nor during a showdown, and not on the opponent's turn", async () => {
    // (a) closed state: a spell on the chain
    const closed = await board().build();
    await closed.p1.cast("disc", { targets: "veteran" });
    expect(closed.chain().length).toBeGreaterThan(0);
    expect(closed.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(closed.p1.can("activateAbility:jax#1")).toBe(false);
    expect(closed.p1.can("activate", "jax")).toBe(false);

    // (b) showdown: Squire walks into P2's bf1
    const fight = await board().build();
    await fight.p1.move("squire", "bf1");
    expect(fight.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(fight.p1.can("activateAbility:jax#1")).toBe(false);
    expect(fight.p1.can("activate", "jax")).toBe(false);

    // (c) opponent's turn
    const theirs = await board().active(P2).build();
    expect(theirs.p1.can("activate", "jax")).toBe(false);
    expect(theirs.p1.legal().some((o) => o.key.startsWith("activateAbility:jax"))).toBe(false);
  });
});

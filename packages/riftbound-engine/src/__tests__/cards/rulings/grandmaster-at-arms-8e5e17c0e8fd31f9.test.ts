/**
 * Ruling 8e5e17c0e8fd31f9 — Grandmaster at Arms (SFD-193 → sfd-193-221, Jax legend)
 *     "[1], [Exhaust]: Attach a detached Equipment you control to a unit you control.
 *      [Exhaust]: Attach an attached Equipment you control to a unit you control."
 *   × Brutalizer (SFD-042 → sfd-042-221, Equipment +1) "If this was attached to me this turn, I have an additional +2 [Might]."
 *   × Aphelios, Exalted (SFD-049 → sfd-049-221, 4 Might) "When you attach an Equipment to me, choose one that hasn't been chosen
 *     this turn — Ready 2 runes. / Channel 1 rune exhausted. / Buff a friendly unit."
 *
 * Q: Can Jax's legend "re-attach" an Equipment to the SAME unit it is already on — to refresh Brutalizer's +2, or to re-trigger
 *    Aphelios?
 * A: No. Attaching a card to the unit it is already attached to has no effect (434.1): no new "attached this turn" for
 *    Brutalizer, no "when you attach an Equipment to me" for Aphelios. It must go to a DIFFERENT unit to do anything.
 * Rules: 434.1 (attach to current host = no effect), 434.1.d/f, 718.4.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GRANDMASTER_AT_ARMS = "sfd-193-221";
const BRUTALIZER = "sfd-042-221";
const APHELIOS = "sfd-049-221";

/**
 * Turn 3, P1's turn. Jax legend ready. Aphelios (4) in base has worn Brutalizer since an EARLIER turn (so just +1 ⇒ 5, the
 * "+2 this turn" lapsed). Squire (2) in base is the alternative host. Two exhausted calm runes make Aphelios's modes meaningful.
 */
function board() {
  return scenario()
    .turn(3)
    .legend(P1, GRANDMASTER_AT_ARMS, "jax")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Watcher" }, "watcher")
    .unit(P1, "base", APHELIOS, "aphelios", { equippedWith: ["brut"] } as Record<string, unknown>)
    .card("brut", { def: BRUTALIZER, meta: { attachedTo: "aphelios" } as Record<string, unknown>, owner: P1, zone: "base" })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .runes(P1, "calm", 2, { exhausted: true });
}

const isAphPrompt = (d: Decision | null): boolean =>
  d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "aphelios";

/** Activate Jax #1 ([Exhaust]: attach an ATTACHED Equipment) and name Brutalizer → `host`. Stops at the first prompt that is not part of the activation. */
async function reattachTo(game: Game, host: "aphelios" | "squire"): Promise<void> {
  expect(game.p1.can("activateAbility:jax#1")).toBe(true);
  await game.p1.activate("jax", 1);
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick" || isAphPrompt(d)) {
      break;
    }
    expect(d.seat).toBe(P1);
    const byCard = (c: string) => d.options.find((o) => (o.card ?? o.key) === c);
    const hit = byCard("brut") ?? byCard(host);
    expect(hit).toBeDefined();
    await game.p1.pick((hit as { key: string }).key);
  }
  expect(game.state("jax").isExhausted).toBe(true);
}

describe("Ruling 8e5e17c0e8fd31f9 — Jax's legend cannot 're-attach' an Equipment to the unit already wearing it for value", () => {
  test("premise: Brutalizer was attached on an earlier turn — Aphelios is 4 + 1 = 5 (no lingering +2)", async () => {
    const game = await board().build();
    expect(game.state("aphelios")).toMatchObject({ attachments: ["brut"], might: 5 });
    expect(game.state("brut").attachedTo).toBe("aphelios");
  });

  test("control: moving Brutalizer to a DIFFERENT unit works — Squire becomes 2 + 1 + 2 = 5 (attached this turn), Aphelios drops to 4, and Aphelios does not trigger", async () => {
    const game = await board().build();
    await reattachTo(game, "squire");
    expect(isAphPrompt(game.decision())).toBe(false);
    await game.settle();
    expect(game.state("brut").attachedTo).toBe("squire");
    expect(game.state("squire")).toMatchObject({ attachments: ["brut"], might: 5 });
    expect(game.state("aphelios")).toMatchObject({ attachments: [], might: 4 });
    expect(game.violations()).toEqual([]);
  });

  // rule 434.1 — naming Aphelios, Brutalizer's current host, does nothing: no fresh "attached this turn", Aphelios stays 5.
  test("ruling 8e5e17c0e8fd31f9 — re-attaching Brutalizer to its own host has no effect: Aphelios stays 5, never 7 (434.1)", async () => {
    const game = await board().build();
    await reattachTo(game, "aphelios");
    // whatever else is pending, the Might must not have moved
    expect(game.state("brut").attachedTo).toBe("aphelios");
    expect(game.state("aphelios").might).toBe(5);
    await game.settle({ policy: "first" });
    expect(game.state("aphelios")).toMatchObject({ attachments: ["brut"], might: 5 });
  });

  // rule 434.1 — no attach happened, so Aphelios's "When you attach an Equipment to me" does not trigger — no mode prompt,
  // nothing on the chain, runes stay exhausted, nobody buffed.
  test("ruling 8e5e17c0e8fd31f9 — re-attaching to the same unit does not trigger Aphelios's mode choice at all (434.1)", async () => {
    const game = await board().build();
    await reattachTo(game, "aphelios");
    expect(isAphPrompt(game.decision())).toBe(false);
    expect(game.chain().some((c) => c.cardId === "aphelios")).toBe(false);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.state("aphelios").isBuffed).toBe(false);
    expect(game.state("squire").isBuffed).toBe(false);
  });
});

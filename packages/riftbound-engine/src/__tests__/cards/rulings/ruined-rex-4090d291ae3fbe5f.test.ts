/**
 * Ruling 4090d291ae3fbe5f — Ruined Rex (UNL-067 → unl-067-219) · Unit · Mind · [6][mind] · 6 Might
 *     "[Deathknell] — Deal 4 to an enemy unit."
 *   × Baited Hook (OGN-242 → ogn-242-298) · Gear · "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5
 *     cards of your Main Deck. You may banish a unit … Might up to 1 more than the killed unit and play it, ignoring
 *     its cost. Then recycle the rest."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) · 3 Might · "Your [Deathknell] effects trigger an additional time."
 *
 * Q: I Baited-Hook my Ruined Rex and play Karthus, Eternal off the Hook. Is Rex's Deathknell doubled?
 * A: No. Rex dies (Deathknell trigger created, pending) while the Hook is still resolving; Karthus is found and played
 *    afterwards. Karthus must be on the board when the Deathknell trigger is CREATED — he wasn't, so only the single
 *    base trigger happens.
 * Rules: 808.1.d.2 (Deathknell), 383 / 359.3 (triggers created mid-resolution pend until the ability finishes, then
 *        finalize in creation order), 365 (a passive applies only while its source is on the board).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";
const BAITED_HOOK = "ogn-242-298";
const KARTHUS = "ogn-236-298";
const FILLER_SPELL = { cardType: "spell", energyCost: 1, name: "Junk" } as const;

type PickD = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn with exactly [1][order]. P1: Baited Hook ready, Ruined Rex (6) in base. P2: a 9-Might Brute (survives 4,
 * even 8) at P2's bf1 — the only enemy unit. P1's deck top→: Karthus, then four Junk spells, then Sixth.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Brute" }, "brute")
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", RUINED_REX, "rex")
    .deck(P1, [KARTHUS, FILLER_SPELL, FILLER_SPELL, FILLER_SPELL, FILLER_SPELL, "ogn-175-298"], ["karthus", "j1", "j2", "j3", "j4", "sixth"]);
}

/** Same, but Karthus is ALREADY on the board (and the deck has a 3-Might Skulker on top instead). */
function boardKarthusOut() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Brute" }, "brute")
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", RUINED_REX, "rex")
    .unit(P1, "base", KARTHUS, "karthus")
    .deck(P1, ["ogn-175-298", FILLER_SPELL, FILLER_SPELL, FILLER_SPELL, FILLER_SPELL, "ogn-175-298"], ["skulker", "j1", "j2", "j3", "j4", "sixth"]);
}

/**
 * Activate the Hook on Rex and drive everything: pass priorities, take `fromDeck` at the look-at-5, aim any Deathknell
 * target prompt at the Brute, take defaults elsewhere. Returns how many separate Rex damage packets hit the Brute.
 */
async function hookRexAndPlay(game: Game, fromDeck: string): Promise<void> {
  await game.p1.activate("hook", 0, { targets: "rex" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  for (let i = 0; i < 24; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d.kind === "pick" && d.seat === P1) {
      const keys = (d as PickD).options.map((o) => o.card ?? o.key);
      if (keys.includes(fromDeck)) {
        await game.p1.pick((d as PickD).options.find((o) => (o.card ?? o.key) === fromDeck)?.key as string);
      } else if (keys.includes("brute")) {
        await game.p1.pick((d as PickD).options.find((o) => (o.card ?? o.key) === "brute")?.key as string);
      } else if ((d as PickD).allowDecline) {
        await game.p1.decline();
      } else {
        await game.p1.pick((d as PickD).options[0]?.key as string);
      }
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else {
      const r = await game.settle({ maxSteps: 1, policy: "first" });
      if (r.reason === "open") {
        break;
      }
    }
  }
}

const rexHits = (game: Game) => (game.gameState.damageLog ?? []).filter((r) => r.target === "brute" && !r.combat);

describe("Ruling 4090d291ae3fbe5f — Karthus played off the Baited Hook that killed Ruined Rex does NOT double Rex's Deathknell", () => {
  test("Hook kills Rex (6) → Karthus (3 ≤ 7) is offered from the top 5 and played for free; Rex's Deathknell resolves ONCE: the Brute takes exactly 4", async () => {
    const game = await board().build();
    await hookRexAndPlay(game, "karthus");
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("karthus")).toBe("base"); // played off the Hook, ignoring cost
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.state("brute").damage).toBe(4); // one Deathknell, not two
    expect(rexHits(game).map((r) => r.amount)).toEqual([4]);
    expect(game.p1.deck()[0]).toBe("sixth"); // the four Junk were recycled
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("sequencing: right after Rex dies, its Deathknell is pending/created while Karthus is still in the DECK (not on the board) — that is the moment that counts", async () => {
    const game = await board().build();
    await game.p1.activate("hook", 0, { targets: "rex" });
    // Pass priority until the look-at-5 offer appears (Rex is killed first, as the Hook starts resolving).
    for (let i = 0; i < 6 && !(game.decision()?.kind === "pick" && (game.decision() as PickD).options.some((o) => (o.card ?? o.key) === "karthus")); i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else if (d?.kind === "pick" && d.seat === P1 && (d as PickD).options.some((o) => (o.card ?? o.key) === "brute")) {
        await game.p1.pick("brute"); // (if the engine asks Rex's target this early)
      } else {
        break;
      }
    }
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect((d as PickD).options.map((o) => o.card ?? o.key)).toContain("karthus");
    expect(game.zoneOf("rex")).toBe("trash"); // already dead → its Deathknell already exists
    expect(game.zoneOf("karthus")).toBe("mainDeck"); // …and Karthus is nowhere near the board yet
  });

  test("contrast — Karthus ALREADY on the board when the Hook kills Rex: the Deathknell triggers an additional time → the Brute takes 4 + 4 = 8", async () => {
    const game = await boardKarthusOut().build();
    await hookRexAndPlay(game, "skulker");
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("karthus")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.state("brute").damage).toBe(8);
    expect(rexHits(game).map((r) => r.amount)).toEqual([4, 4]);
    expect(game.zoneOf("brute")).toBe("battlefield-bf1"); // 9 Might survives
  });
});

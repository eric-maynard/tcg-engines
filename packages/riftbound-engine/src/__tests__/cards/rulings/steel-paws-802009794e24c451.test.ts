/**
 * Ruling 802009794e24c451 — Steel Paws (VEN-043 → ven-043-166) · Unit · Calm · 1 · 0 Might
 *   "[Deflect] [Empower] [7] ([7]: Empower me. Use only if not Empowered.) [Empowered] I have +7 [Might]."
 *   × Curator of the Sands (ven-192-166, the Nasus legend) "When you play a unit, gear, or activated ability with Energy
 *     cost [7] or more, you may exhaust me to ready up to 2 runes."
 *   (+ an inline [Reaction] "Whisk Away — Return a unit to its owner's hand." as the opponent's response.)
 *
 * Q: I Empower Steel Paws for [7]; my opponent responds by returning Steel Paws to my hand. Does Nasus still trigger?
 * A: Yes. The Empower ability was activated (cost paid, on the chain) and it RESOLVES — doing nothing, since its source
 *    left — and "play an activated ability" is satisfied by that resolution, so you may exhaust Nasus to ready 2 runes.
 * Rules: 419.4.a + Patch Notes 2026-07-17 ("play" in a trigger condition = the card/ability has resolved), 359.3.e
 *        (an ability resolves independently of its source; missing source ⇒ that instruction does nothing), 809 (Deflect).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STEEL_PAWS = "ven-043-166";
const CURATOR_OF_THE_SANDS = "ven-192-166";

const WHISK_AWAY = {
  abilities: [{ effect: { target: { type: "unit" }, type: "return-to-hand" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  energyCost: 0,
  name: "Whisk Away",
  rulesText: "[Reaction] Return a unit to its owner's hand.",
  timing: "reaction",
};

/** P1's turn: 7 calm runes (tapped for the [7]), Nasus legend, Steel Paws in base. P2 holds Whisk Away + 1 power for Deflect. */
async function board(): Promise<Game> {
  const game = await scenario()
    .runes(P1, "calm", 7)
    .resources(P2, { power: { rainbow: 1 } })
    .legend(P1, CURATOR_OF_THE_SANDS, "nasus")
    .unit(P1, "base", STEEL_PAWS, "paws")
    .hand(P2, WHISK_AWAY, "whisk")
    .build();
  await game.p1.tapRunes(7);
  expect(game.p1.energy()).toBe(7);
  expect(game.p1.runes({ ready: true })).toHaveLength(0);
  return game;
}

/** If the Curator's "you may exhaust me" is being asked, accept it. */
async function acceptNasusIfAsked(game: Game): Promise<boolean> {
  const d = game.decision();
  if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "nasus") {
    await game.p1.yes();
    return true;
  }
  return false;
}

/**
 * Full line: P1 activates Empower; (Nasus accepted whenever the engine asks); P2 answers with Whisk Away on Steel Paws;
 * everything resolves — the Curator's rune pick takes 2 runes.
 */
async function empowerBouncedLine(): Promise<{ game: Game; readied: number }> {
  const game = await board();
  await game.p1.activate("paws");
  await acceptNasusIfAsked(game);
  let bounced = false;
  let readied = 0;
  for (let i = 0; i < 24; i++) {
    if (await acceptNasusIfAsked(game)) {
      continue;
    }
    const d: Decision | null = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action" && d.context === "chain" && d.seat === P2 && !bounced && game.p2.can("cast", "whisk")) {
      await game.p2.cast("whisk", { targets: "paws" });
      bounced = true;
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick" && d.seat === P1) {
      const keys = d.options.slice(0, Math.min(2, d.max)).map((o) => o.key);
      readied = keys.length;
      await game.p1.pick(...keys);
    } else {
      break;
    }
  }
  expect(bounced).toBe(true);
  return { game, readied };
}

describe("Ruling 802009794e24c451 — Empower [7] bounced in response still 'plays' the ability: Nasus triggers", () => {
  test("activating Empower [7]: the 7 energy is paid and the ability is an item on the chain (Steel Paws not yet Empowered)", async () => {
    const game = await board();
    expect(game.p1.can("activate", "paws")).toBe(true);
    await game.p1.activate("paws");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "paws", controller: P1 }));
    expect(game.state("paws").isEmpowered).toBe(false);
  });

  // Expected (419.4.a as clarified 2026-07-17, and the ruling's sequence): "when you play an activated ability" is met
  // when that ability RESOLVES — so right after activation only the Empower item exists; the Curator triggers at step 3,
  // after the opponent's bounce has resolved. Actual: the engine fires the Curator's trigger at ACTIVATION — its item
  // (and its FIN "exhaust me?" prompt) appears immediately, before P2 can even respond.
  test.failing("BUG: ruling 802009794e24c451 — Curator of the Sands triggers when Empower is ACTIVATED; it should trigger when the ability RESOLVES", async () => {
    const game = await board();
    await game.p1.activate("paws");
    expect(game.chain().map((c) => c.cardId)).toEqual(["paws"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("nasus").isExhausted).toBe(false);
    // …P2 bounces, all resolve up to Empower; only THEN is P1 asked about Nasus.
    await game.p1.passPriority();
    await game.p2.cast("whisk", { targets: "paws" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Whisk Away resolves
    expect(game.zoneOf("paws")).toBe("hand");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Empower resolves (does nothing) → Curator triggers now
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "nasus" } });
  });

  test("P2 CAN respond: Whisk Away (a Reaction, paying Steel Paws' [Deflect] surcharge of 1 power) goes on the chain above Empower and resolves first — Steel Paws is back in P1's hand", async () => {
    const { game } = await empowerBouncedLine();
    expect(game.zoneOf("whisk")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("paws")).toBe("hand");
  });

  test("Empower then resolves with its source gone — it does nothing (Steel Paws sits un-Empowered in hand, the [7] stays spent) — but it DID resolve, and the Curator's trigger is honoured: Nasus exhausted, 2 of the 7 tapped runes readied", async () => {
    const { game, readied } = await empowerBouncedLine();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("paws")).toBe("hand");
    expect(game.state("paws").isEmpowered).toBe(false);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("nasus").isExhausted).toBe(true);
    expect(readied).toBe(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling fdad251fdb6a675c — Jax, Unmatched (SFD-054 → sfd-054-221) · 5 Might · [Deflect] "Your Equipment everywhere have [Quick-Draw]."
 *     (Quick-Draw: each gains [Reaction]; "When you play it, attach it to a unit you control.")
 *   × Last Rites (SFD-150 → sfd-150-221) · Equipment · [3] · +2 "[Equip] — [chaos], Recycle 2 cards from your trash …"
 *   (+ B.F. Sword sfd-161-221 · [4] · +3 "[Equip] [order]" as the plain-Equip case)
 *
 * Q: When my Equipment has Quick-Draw from Jax, do I still need to pay (recycle / the Equip cost) to equip it?
 * A: You still pay the card's PLAY cost (energy/power in the corner). You do NOT pay the Equip cost for the initial attach —
 *    Quick-Draw's "when you play it, attach it" attaches it for free; nothing is recycled unless the play cost itself says so.
 * Rules: 819 (Quick-Draw), 821/435 (Equip is a separate paid ability), 355.1 (play cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const JAX = "sfd-054-221";
const LAST_RITES = "sfd-150-221";
const BF_SWORD = "sfd-161-221";
const FILLER = "ogn-175-298";

/** P1's turn. Jax in base; Last Rites + B.F. Sword in hand; exactly 7 energy and NO power at all; two cards in trash (would-be recycle fodder). */
function board() {
  return scenario()
    .resources(P1, { energy: 7 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", JAX, "jax")
    .hand(P1, LAST_RITES, "rites")
    .hand(P1, BF_SWORD, "bfs")
    .trash(P1, FILLER, "junk1")
    .trash(P1, FILLER, "junk2");
}

describe("Ruling fdad251fdb6a675c — Quick-Draw from Jax: pay the play cost, skip the Equip cost", () => {
  test("premise: with Jax out, the Equipment in hand carry Quick-Draw", async () => {
    const game = await board().build();
    expect(game.state("rites").keywords).toContain("Quick-Draw");
    expect(game.state("bfs").keywords).toContain("Quick-Draw");
  });

  test("Last Rites: playing it costs its [3] play cost; the Quick-Draw attach asks which unit and attaches to Jax WITHOUT the [chaos] and WITHOUT recycling the 2 trash cards", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "rites")).toBe(true); // affordable with energy only — no chaos needed
    await game.p1.play("rites");
    expect(game.p1.energy()).toBe(4); // 7 − 3
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("jax");
      await game.p1.pick("jax");
    }
    await game.settle();
    expect(game.state("rites").attachedTo).toBe("jax");
    expect(game.state("jax")).toMatchObject({ attachments: ["rites"], might: 7 }); // 5 + 2
    expect(game.p1.resources()).toEqual({ energy: 4, power: {} });
    expect(game.p1.trash().sort()).toEqual(["junk1", "junk2"]); // nothing recycled
    expect(game.violations()).toEqual([]);
  });

  test("B.F. Sword: [4] play cost paid, attached to Jax for free — the [order] Equip pip is never demanded (P1 has no power at all)", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "bfs")).toBe(true);
    await game.p1.play("bfs");
    expect(game.p1.energy()).toBe(3); // 7 − 4
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("jax");
    }
    await game.settle();
    expect(game.state("bfs").attachedTo).toBe("jax");
    expect(game.state("jax").might).toBe(8); // 5 + 3
    expect(game.p1.resources()).toEqual({ energy: 3, power: {} });
  });

  test("contrast — the play cost is NOT waived: with only 2 energy Last Rites ([3]) can't be played even though its attach would be free", async () => {
    const game = await board().resources(P1, { energy: 2 }).build();
    expect(game.p1.can("play", "rites")).toBe(false);
  });
});

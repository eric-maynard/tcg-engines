/**
 * Ruling 367ff569d5f08244 — Gust (OGN-169 → ogn-169-298) · Reaction [1]
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Rek'Sai, Breacher (SFD-029 → sfd-029-221) · 3 Might · "[Accelerate] [Assault] …"
 *
 * Q: Can I Gust Rek'Sai as he enters my battlefield, before his Assault bonus applies?
 * A: No. Assault is a passive: the moment he is designated attacker he already has the bonus, before any window to
 *    play Gust — so at 3+Assault he is above 3 Might and not a legal Gust target. If instead he moves to an EMPTY
 *    battlefield he is no attacker, stays at 3, and Gust can bounce him.
 * Rules: 807 (Assault: +X while attacker, passive), 364.3 (passives don't use the chain), 620/623 (attacker
 *        designation precedes the showdown's action window).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const REKSAI_BREACHER = "sfd-029-221";

function board() {
  return scenario()
    .battlefield("held", { controller: P2 })
    .battlefield("open", { controller: null })
    .unit(P2, "held", { might: 2, name: "Defender" }, "def")
    .unit(P1, "base", REKSAI_BREACHER, "reksai")
    .hand(P2, GUST, "gust")
    .resources(P2, { energy: 1 });
}

describe("Ruling 367ff569d5f08244 — Assault is on before anyone can react: Gust can't catch an attacking Rek'Sai", () => {
  test("premise: at rest Rek'Sai is 3 Might with printed Assault", async () => {
    const game = await board().build();
    expect(game.state("reksai")).toMatchObject({ baseMight: 3, might: 3 });
    expect(game.state("reksai").keywords).toContain("Assault");
  });

  test("attacking an occupied enemy battlefield: he is an attacker at 4 Might the instant the showdown opens; when P2 gets Focus, Gust is NOT legal on him", async () => {
    const game = await board().build();
    await game.p1.move("reksai", "held");
    // First observable moment after the move: already designated and already buffed — no window in between.
    expect(game.state("reksai")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.chain()).toEqual([]); // Assault never used the chain
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    const targets = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).not.toContain("reksai");
    expect(targets).toContain("def"); // Gust itself is castable (P2's own 2-Might Defender is at a battlefield)
    const r = await game.p2.try((p) => p.cast("gust", { targets: "reksai" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("reksai")).toBe("battlefield-held");
    expect(game.zoneOf("gust")).toBe("hand");
    expect(game.p2.energy()).toBe(1);
  });

  test("contrast — moving to an EMPTY battlefield: no attacker designation, still 3 Might, and P2 can Gust him back to hand", async () => {
    const game = await board().build();
    await game.p1.move("reksai", "open");
    expect(game.state("reksai").combatRole).not.toBe("attacker");
    expect(game.state("reksai").might).toBe(3);
    // A (non-combat) showdown opens at the uncontrolled battlefield; once P2 has Focus, Gust is legal on him.
    if (game.actingSeat() === P1) {
      await game.p1.passFocus();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "reksai" });
    await game.settle();
    expect(game.zoneOf("reksai")).toBe("hand");
    expect(game.p1.hand()).toContain("reksai");
    expect(game.violations()).toEqual([]);
  });
});

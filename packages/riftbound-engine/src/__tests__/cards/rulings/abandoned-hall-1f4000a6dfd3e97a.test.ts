/**
 * Ruling 1f4000a6dfd3e97a — Abandoned Hall (UNL-205 → unl-205-219) · Battlefield "When a player plays a spell, they
 *   may give a unit they control here +1 [Might] this turn."
 *   × Irelia, Fervent (SFD-057 → sfd-057-221) · 4 Might "[Deflect] When you choose or ready me, give me +1 [Might] this turn."
 *   × En Garde (OGN-046 → ogn-046-298) · Reaction [1] "Give a friendly unit +1 [Might] this turn, then an additional
 *     +1 [Might] this turn if it is the only unit you control there."
 *
 * Q: My sole Irelia attacks Abandoned Hall; I En Garde her, then use the Hall's trigger on her. Total?
 * A: 9. En Garde choosing her triggers +1 (→5, resolves first, LIFO), En Garde +2 (→7). After En Garde resolves the
 *    Hall triggers; choosing her with it triggers her again: +1 (→8), then Hall +1 (→9).
 * Rules: 383 (triggered abilities), 336/337 (LIFO), 419.4.a (play-a-spell triggers after resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ABANDONED_HALL = "unl-205-219";
const IRELIA_FERVENT = "sfd-057-221";
const EN_GARDE = "ogn-046-298";

/** P1's turn. P2 holds Abandoned Hall (live text) with a 2-Might Defender. P1: Irelia (4) in base, En Garde in hand, [1]. */
function board() {
  return scenario()
    .battlefield("hall", { controller: P2, def: ABANDONED_HALL, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P2, "hall", { might: 2, name: "Defender" }, "def")
    .unit(P1, "base", IRELIA_FERVENT, "irelia")
    .hand(P1, EN_GARDE, "engarde")
    .resources(P1, { energy: 1 });
}

/** 1–2. Irelia attacks the Hall alone; in the showdown P1 casts En Garde choosing her. */
async function attackAndEnGarde(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("irelia", "hall");
  expect(game.state("irelia")).toMatchObject({ combatRole: "attacker", might: 4 });
  expect(game.p1.units("hall")).toEqual(["irelia"]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("engarde", { targets: "irelia" });
  return game;
}

/** Both players pass priority once (resolving the top chain item). */
async function bothPass(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Ruling 1f4000a6dfd3e97a — Irelia + En Garde at Abandoned Hall ends on 9 Might (4 +1 +2 +1 +1)", () => {
  test("2. choosing Irelia with En Garde triggers her ability, which sits ABOVE En Garde on the chain", async () => {
    const game = await attackAndEnGarde();
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde", "irelia"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    expect(game.state("irelia").might).toBe(4); // nothing resolved yet
    // No Hall trigger yet — En Garde has not resolved (419.4.a).
    expect(game.chain().some((c) => c.cardId === "hall")).toBe(false);
  });

  test("3. Irelia's ability resolves first (+1 → 5), then En Garde (+1, +1 for being alone → 7)", async () => {
    const game = await attackAndEnGarde();
    await bothPass(game); // Irelia's trigger
    expect(game.state("irelia").might).toBe(5);
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde"]);
    await bothPass(game); // En Garde
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.state("irelia").might).toBe(7);
  });

  test("4. after En Garde resolves the Hall triggers for P1 ('they may'): P1 is asked, accepts, and choosing Irelia triggers her AGAIN above the Hall item", async () => {
    const game = await attackAndEnGarde();
    await bothPass(game);
    await bothPass(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hall", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "hall" } });
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.seat).toBe(P1);
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["irelia"]); // only units P1 controls HERE
      await game.p1.pick("irelia");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["hall", "irelia"]);
    expect(game.chain()[0]?.targets).toEqual(["irelia"]);
    expect(game.state("irelia").might).toBe(7);
  });

  test("5. Irelia's second trigger resolves (+1 → 8), then the Hall's +1 (→ 9): final 9 Might, chain empty, showdown continues", async () => {
    const game = await attackAndEnGarde();
    await bothPass(game);
    await bothPass(game);
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("irelia");
    }
    await bothPass(game); // Irelia's trigger
    expect(game.state("irelia").might).toBe(8);
    expect(game.chain().map((c) => c.cardId)).toEqual(["hall"]);
    await bothPass(game); // Hall
    expect(game.chain()).toEqual([]);
    expect(game.state("irelia").might).toBe(9);
    expect(game.state("irelia").mightModifier).toBe(5); // +5 total on a printed 4 — not "+5 = 5"
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });

  test("epilogue: she wins the combat at 9 vs 2 and conquers the Hall; the +5 wears off at end of turn (back to 4)", async () => {
    const game = await attackAndEnGarde();
    game.script(P1, ["yes", "irelia"]);
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("irelia")).toBe("battlefield-hall");
    expect(game.gameState.battlefields.hall?.controller).toBe(P1);
    expect(game.state("irelia").might).toBe(9);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("irelia").might).toBe(4);
  });
});

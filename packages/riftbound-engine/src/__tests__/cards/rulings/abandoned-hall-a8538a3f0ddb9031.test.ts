/**
 * Ruling a8538a3f0ddb9031 — Abandoned Hall (unl-205-219, Battlefield)
 *   "When a player plays a spell, they may give a unit they control here +1 [Might] this turn."
 *
 * Q: Does Abandoned Hall's ability trigger if the spell is countered?
 * A: No. A card is only "played" once its play completes with its resolution (350.1, 419.4.a);
 *    a countered spell never resolves, is cleared to trash and is not considered played, so
 *    play-a-card triggers do not fire (419.4.a.1, 425.1.b).
 *
 * Setup: P1 controls Abandoned Hall with a 2-Might unit there and casts Dredge Up ("Draw 1").
 * P2 holds Wind Wall ("Counter a spell."). Note Wind Wall is itself a spell that P2 plays (and it
 * does resolve), so exactly ONE Hall trigger is expected in the countered line — Wind Wall's, owned
 * by P2, who controls no unit at the Hall.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ABANDONED_HALL = "unl-205-219";
const DREDGE_UP = "ven-049-166"; // Spell · 2 · "Draw 1. [Flow] [2]"
const WIND_WALL = "ogn-064-298"; // Reaction · 3 + [calm][calm] · "Counter a spell."

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .battlefield("hall", { controller: P1, def: ABANDONED_HALL, inert: false })
    .unit(P1, "hall", { might: 2, name: "Hall Guard" }, "guard")
    .hand(P1, DREDGE_UP, "dredge")
    .hand(P2, WIND_WALL, "windWall");
}

/**
 * P1 casts Dredge Up, P2 answers with Wind Wall; then pass priority one step at a time, recording the
 * chain after every step until a non-priority decision (or the open main phase) is reached.
 */
async function counteredLine(game: Game): Promise<string[][]> {
  await game.p1.cast("dredge");
  await game.p1.passPriority();
  await game.p2.cast("windWall", { targets: "dredge" });
  const snapshots: string[][] = [game.chain().map((c) => c.cardId)];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain" || !d.passKey) {
      break;
    }
    await game.seat(d.seat).pass();
    snapshots.push(game.chain().map((c) => c.cardId));
  }
  return snapshots;
}

describe("Ruling a8538a3f0ddb9031 — Abandoned Hall does not trigger off a countered spell", () => {
  test("control: an uncountered spell resolves ⇒ it was 'played' ⇒ Hall offers P1 the +1 Might, which lands on the unit there", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.cast("dredge");
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge"]);
    // Nothing has triggered yet: the spell is merely on the chain (419.4.a).
    expect(game.state("guard").might).toBe(2);
    await game.settle();
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // cast one, drew one
    // Hall's "may" trigger is P1's decision.
    const d = game.decision();
    expect(d).not.toBeNull();
    expect(d?.seat).toBe(P1);
    expect(["yes-no", "pick"]).toContain(d?.kind as string);
    if (d?.kind === "yes-no") {
      await game.p1.yes();
      await game.settle();
      if (game.decision()?.kind === "pick") {
        await game.p1.pick("guard");
      }
    } else {
      await game.p1.pick("guard");
    }
    await game.settle();
    expect(game.state("guard").might).toBe(3);
  });

  test("countered by Wind Wall: Dredge Up is cleared to trash undrawn and produces NO Hall trigger — the only Hall trigger seen is Wind Wall's own, appearing after Wind Wall resolves (419.4.a.1, 425.1.b)", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    const snapshots = await counteredLine(game);
    expect(snapshots[0]).toEqual(["dredge", "windWall"]);
    // Dredge Up never co-exists with a Hall trigger and never sits alone on the chain (it never got to resolve).
    for (const s of snapshots) {
      if (s.includes("dredge")) {
        expect(s).toEqual(["dredge", "windWall"]);
      }
    }
    // Across the whole line the Hall triggers at most once (Wind Wall's play), never a second time for Dredge Up.
    const hallAppearances = snapshots.filter((s, i) => s.includes("hall") && !(snapshots[i - 1] ?? []).includes("hall")).length;
    expect(hallAppearances).toBeLessThanOrEqual(1);
    // Countered: cleared to trash, did nothing, no refund (425.1.a/.c).
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.zoneOf("windWall")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("guard").might).toBe(2);
  });

  test("ruling a8538a3f0ddb9031 — after the counter, nobody can buff the Hall unit: Dredge Up wasn't played, and Wind Wall's trigger belongs to P2 ('they'), who controls no unit here; engine instead asks P1 to use the Hall", async () => {
    // Expected: no prompt for P1 at all; the line ends in P1's open main phase with guard at 2 Might.
    // Actual: the engine routes Wind Wall's Hall trigger to P1 (the Hall's controller) as a yes/no opt-in.
    const game = await board().build();
    await counteredLine(game);
    const d = game.decision();
    expect(d?.seat === P1 && d.kind !== "action").toBe(false);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("guard").might).toBe(2);
    expect(game.state("guard").mightModifier).toBe(0);
  });
});

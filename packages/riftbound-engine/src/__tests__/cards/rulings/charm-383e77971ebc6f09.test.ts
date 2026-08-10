/**
 * Ruling 383e77971ebc6f09 — Charm (OGN-043 → ogn-043-298) 1+[calm] "Move an enemy unit."
 *   × Thrill of the Hunt (UNL-184 → unl-184-219) [Reaction] 2+[rainbow] "Banish a friendly unit, then its owner plays it
 *     to any battlefield, ignoring its cost."
 *
 * Q: On my turn I Charm the opponent's only unit off battlefield A (which they control) to battlefield B and let it
 *    resolve. They then Thrill of the Hunt it back to A. Do they score a point?
 * A: Yes — provided they win the resulting showdown at A and haven't scored A this turn. Once Charm resolved, A was
 *    left empty and they lost control of it; the unit arriving back makes A contested, and winning that showdown is a
 *    Conquer worth 1 point (even on my turn).
 * Rules: 323.6 (lose control of an empty battlefield in an Open State), 187.4 / 466.5 (establish control after a
 *        showdown), 464.1 / 469.1 (Conquer scores if not yet scored this turn), 465 (once per battlefield per turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const THRILL_OF_THE_HUNT = "unl-184-219";

/** P1's turn. P2 holds bfA with its only unit X (3); bfB is empty and uncontrolled. P1: Charm + 1+[calm]. P2: Thrill + 2+[rainbow]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .resources(P2, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: null })
    .unit(P2, "bfA", { might: 3, name: "Unit X" }, "X")
    .unit(P1, "base", { might: 2, name: "Idle" }, "idle")
    .hand(P1, CHARM, "charm")
    .hand(P2, THRILL_OF_THE_HUNT, "thrill");
}

/** P1 Charms X to bfB and it resolves (P2 declines to respond). Returns in the showdown that X's arrival at bfB opened. */
async function charmResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { targets: "X" });
  // The destination is P1's (the mover's) choice, made as Charm is played.
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bfB"]);
  await game.p1.pick("battlefield-bfB");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.passPriority(); // P2 lets Charm resolve
  expect(game.zoneOf("charm")).toBe("trash");
  expect(game.zoneOf("X")).toBe("battlefield-bfB");
  return game;
}

describe("Ruling 383e77971ebc6f09 — Thrill of the Hunt back onto the battlefield Charm emptied re-conquers it for a point", () => {
  test("after Charm resolves: X sits at bfB, P2 has LOST control of the now-empty bfA, and X's arrival made bfB contested — a showdown is open there", async () => {
    const game = await charmResolved();
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, controller: null });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.p2.points()).toBe(0);
  });

  test("P2 plays Thrill of the Hunt (with Focus in that showdown): X is banished, then P2 — its owner — chooses a battlefield and plays it back to bfA for free; bfA becomes contested by P2", async () => {
    const game = await charmResolved();
    if (game.actingSeat() === P1) {
      await game.p1.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "thrill")).toBe(true);
    await game.p2.cast("thrill", { targets: "X" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Thrill resolves
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 }); // "its owner plays it to any battlefield"
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(dests).toContain("battlefield-bfA");
    expect(dests).not.toContain("base");
    await game.p2.pick("battlefield-bfA");
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.state("X")).toMatchObject({ controller: P2, zone: "battlefield-bfA" });
    expect(game.p2.banishment()).toEqual([]);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(game.p2.points()).toBe(0); // not yet — the showdown at bfA must be won first
  });

  test("both players pass through the showdowns: P2 (unopposed at bfA) establishes control = a Conquer on P1's turn → P2 scores 1; bfB ends up empty and uncontrolled", async () => {
    const game = await charmResolved();
    if (game.actingSeat() === P1) {
      await game.p1.passFocus();
    }
    await game.p2.cast("thrill", { targets: "X" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.pick("battlefield-bfA");
    // bfB's showdown closes; each Cleanup-begun showdown is handed back once by settle() — pass through them all.
    for (let i = 0; i < 4; i++) {
      const stop = await game.settle();
      const cur = game.decision();
      if (!(stop.reason === "open" && cur?.kind === "action" && cur.context === "showdown")) {
        break;
      }
    }
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: null });
    expect(game.state("X").zone).toBe("battlefield-bfA");
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

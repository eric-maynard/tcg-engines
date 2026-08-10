/**
 * Ruling aafb3ba6a1365738 — Charm (OGN-043 → ogn-043-298) · [1][calm] · "Move an enemy unit."
 *   × Hwei, Brooding Painter (UNL-080 → unl-080-219) · 5 Might · "When I move, draw 1, then discard 1. Then … Unit — Give me +3 [Might]…"
 *   × Tideturner (OGN-199 → ogn-199-298) · "[Hidden] When you play me, you may choose a unit you control at another location. Move me
 *     to its location and it to my original location."   (Alpha Strike / Flash cited only as targeting precedent.)
 *
 * Q: I Charm the opponent's Hwei (in their base) to battlefield X; they respond with a hidden Tideturner at battlefield Y (theirs),
 *    swapping it with Hwei. What happens?
 * A: LIFO: Tideturner's ability resolves first — Tideturner to base, Hwei to Y. Charm still targets the same object (it stayed on the
 *    board), so it then resolves and moves Hwei from Y to X. End state: Tideturner in base, Hwei at X.
 * Rules: 331 (LIFO), 359.3.e.3 (a target that merely changed location on the board is still legal), 811.1.d.2 (Tideturner's
 *        partner may be anywhere), Charm's destination chosen by the caster at play time.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const HWEI = "unl-080-219";
const TIDETURNER = "ogn-199-298";

/**
 * Turn 3, P1's turn with [1][calm] and Charm. bfX: empty, uncontrolled. bfY: P2's, with a Holder and Tideturner facedown.
 * P2: Hwei in base, empty hand, known deck (units) for Hwei's move triggers.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bfX", { controller: null })
    .battlefield("bfY", { controller: P2 })
    .unit(P2, "bfY", { might: 2, name: "Holder" }, "holder")
    .facedown(P2, "bfY", TIDETURNER, "tt")
    .unit(P2, "base", HWEI, "hwei")
    .hand(P1, CHARM, "charm")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** P1 Charms Hwei → bfX; P2 responds by revealing Tideturner at bfY and swapping with Hwei. Chain = [charm, tt]. */
async function charmThenTideturner(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { targets: "hwei" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // Charm's destination, chosen as it is played
  await game.p1.pick("battlefield-bfX");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", targets: ["hwei"] })]);
  await game.p1.passPriority();
  expect(game.p2.can("reveal", "tt")).toBe(true);
  await game.p2.reveal("tt");
  expect(game.zoneOf("tt")).toBe("battlefield-bfY");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "tt" } });
  await game.p2.yes();
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("hwei");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "tt"]);
  return game;
}

/** Pass priority around / take Hwei's forced discard until only `stopAt` (or nothing) is left on the chain. */
async function resolveUntil(game: Game, stopAt: string | null): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const ids = game.chain().map((c) => c.cardId);
    if (stopAt === null ? ids.length === 0 : ids.length === 1 && ids[0] === stopAt) {
      return;
    }
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick(d.options[0]?.key as string); // Hwei: discard the card just drawn
    } else if (d?.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      return;
    }
  }
}

describe("Ruling aafb3ba6a1365738 — Tideturner swaps the Charmed Hwei away; Charm still moves Hwei to X", () => {
  test("Tideturner's ability resolves first: Tideturner → P2's base, Hwei → bfY; Charm is still on the chain targeting Hwei", async () => {
    const game = await charmThenTideturner();
    await resolveUntil(game, "charm");
    expect(game.state("tt")).toMatchObject({ location: "base", zone: "base" });
    expect(game.zoneOf("hwei")).toBe("battlefield-bfY");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", targets: ["hwei"] })]);
  });

  test("ruling: Charm then resolves on the SAME Hwei (still on the board) and moves him from bfY to bfX — final: Tideturner in base, Hwei at X, Holder still at Y", async () => {
    const game = await charmThenTideturner();
    await resolveUntil(game, null);
    // Hwei's second move trigger (from Charm) may still need its discard; finish everything.
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered") {
        break;
      }
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick(d.options[0]?.key as string);
      } else {
        break;
      }
    }
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.zoneOf("hwei")).toBe("battlefield-bfX");
    expect(game.zoneOf("tt")).toBe("base");
    expect(game.zoneOf("holder")).toBe("battlefield-bfY");
    expect(game.gameState.battlefields.bfY?.controller).toBe(P2);
    // Hwei moved twice (swap, then Charm) — his move trigger fired both times: two cards drawn-and-discarded.
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["d1", "d2"]));
    expect(game.violations()).toEqual([]);
  });
});

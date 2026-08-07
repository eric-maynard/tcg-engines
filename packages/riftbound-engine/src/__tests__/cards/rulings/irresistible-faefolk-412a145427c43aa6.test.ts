/**
 * Ruling 412a145427c43aa6 — Irresistible Faefolk (unl-112-219) · Unit · Body · 2 · 1 Might
 *   "When I move to a battlefield, you may move an enemy unit to that battlefield."
 *
 * Q: If I play Irresistible Faefolk directly to a battlefield, does its ability trigger?
 * A: No. A move is a permanent changing position from one board location to another (446.1). Playing a
 *    card brings it onto the board from a non-board zone — a zone change, not a move (446.2) — so
 *    "When I move to a battlefield" is not satisfied. (Contrast: a Standard Move base → battlefield is.)
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FAEFOLK = "unl-112-219";

/** P1 controls bf1 (empty); P2 has an enemy at bf2 and one in base — the would-be victims of the trigger. */
function board(faefolkIn: "hand" | "base") {
  const s = scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Enemy Scout" }, "scout")
    .unit(P2, "base", { might: 2, name: "Enemy Reserve" }, "reserve");
  return faefolkIn === "hand" ? s.hand(P1, FAEFOLK, "fae") : s.unit(P1, "base", FAEFOLK, "fae");
}

describe("Ruling 412a145427c43aa6 — playing Faefolk to a battlefield is not a 'move'", () => {
  test("played from hand directly to bf1: it arrives there for 2 energy and NO trigger fires — no prompt, no chain item, enemy units unmoved (446.1, 446.2)", async () => {
    const game = await board("hand").build();
    expect(game.p1.option("play", "fae")?.fields.find((f) => f.arg === "to")?.options).toContain("battlefield-bf1");
    await game.p1.play("fae", { to: "bf1" });
    expect(game.zoneOf("fae")).toBe("battlefield-bf1");
    expect(game.p1.energy()).toBe(0);
    // Nothing triggered: no chain item from Faefolk, no yes/no or pick for P1.
    expect(game.chain().filter((c) => c.cardId === "fae")).toEqual([]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("scout")).toBe("battlefield-bf2");
    expect(game.zoneOf("reserve")).toBe("base");
    expect(game.cardsAt("bf1")).toEqual(["fae"]);
    // Playing is not a move for turn bookkeeping either.
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
  });

  test("played from hand to base: likewise no trigger (and base is not a battlefield anyway)", async () => {
    const game = await board("hand").build();
    await game.p1.play("fae", { to: "base" });
    expect(game.zoneOf("fae")).toBe("base");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("battlefield-bf2");
    expect(game.zoneOf("reserve")).toBe("base");
  });

  // Expected (contrast the ruling relies on): a Standard Move base → bf1 IS a move to a battlefield, so the
  // trigger fires: P1 may pick an ENEMY unit (scout or reserve) and it is moved to bf1. Actual: the
  // engine fires nothing on the move — no prompt appears and the enemy units stay where they are.
  test("ruling 412a145427c43aa6 (contrast) — a Standard Move of Faefolk from base to bf1 DOES trigger: P1 may drag an enemy unit to bf1", async () => {
    const game = await board("base").build();
    await game.p1.move("fae", "bf1");
    expect(game.zoneOf("fae")).toBe("battlefield-bf1");
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(1);
    // Drive the optional trigger: pass priority, say yes, pick the scout.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context !== "chain")) {
        break;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d.kind === "pick" && d.seat === P1) {
        const keys = d.options.map((o) => o.card ?? o.key);
        expect(keys).toContain("scout");
        expect(keys).toContain("reserve");
        expect(keys).not.toContain("fae"); // enemy units only
        await game.p1.pick("scout");
      } else {
        break;
      }
    }
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.zoneOf("reserve")).toBe("base");
  });
});

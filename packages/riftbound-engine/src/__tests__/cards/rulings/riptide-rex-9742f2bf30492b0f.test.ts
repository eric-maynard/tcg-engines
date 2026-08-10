/**
 * Ruling 9742f2bf30492b0f — Riptide Rex (OGN-092 → ogn-092-298) × [Deflect] (Vex, Apathetic UNL-150 → unl-150-219)
 *
 *   Riptide Rex — Unit · Mind · 6+[mind][mind] · 6 Might: "When you play me, deal 6 to an enemy unit at a battlefield."
 *   Vex, Apathetic — Unit · 4 · 4 Might: "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *     When an opponent plays a unit while I'm at a battlefield, [Stun] it. …"
 *
 * Q: Does Riptide Rex bypass Deflect?
 * A: No. Rex's trigger CHOOSES an enemy unit, so Deflect adds a mandatory [rainbow] to it (809.1.c). Being a triggered
 *    ability, its controller may decline to pay: then the ability fails to finalize and is removed without dealing
 *    damage. If paid, it resolves and deals 6 as normal. (Contrast: Vex/Whirlwind-style effects don't choose.)
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIPTIDE_REX = "ogn-092-298";
const VEX = "unl-150-219";

/** P1's turn: Rex in hand with 6 + [mind][mind] (+ `rainbow`). P2's Vex (Deflect, 4) alone at P2's bf1 — Rex's only legal victim. */
function board(rainbow: number) {
  return scenario()
    .resources(P1, { energy: 6, power: { mind: 2, rainbow } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VEX, "vex")
    .hand(P1, RIPTIDE_REX, "rex");
}

/** Play Rex and advance to the Deflect payment prompt for its play trigger. */
async function playRexToDeflectPrompt(game: Game): Promise<void> {
  await game.p1.play("rex");
  expect(game.p1.energy()).toBe(0);
  expect(game.p1.power("mind")).toBe(0);
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      return;
    }
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("vex");
    } else if (d?.kind === "order") {
      await game.acceptTriggerOrder();
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
}

describe("Ruling 9742f2bf30492b0f — Riptide Rex's play trigger must pay Deflect (or be dropped)", () => {
  test("Rex enters; choosing the Deflect unit surfaces a 'pay [rainbow]' decision for P1 (the trigger chooses, so Deflect applies)", async () => {
    const game = await board(1).build();
    await playRexToDeflectPrompt(game);
    expect(game.zoneOf("rex")).toBe("base");
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "rex" } });
    expect(d?.prompt ?? "").toMatch(/deflect/i);
    expect(game.state("vex").damage).toBe(0);
  });

  test("paying the [rainbow]: the trigger finalizes onto Vex and resolves for 6 — Vex (4) dies; P1's rainbow is spent", async () => {
    const game = await board(1).build();
    await playRexToDeflectPrompt(game);
    await game.p1.yes();
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.chain().find((c) => c.cardId === "rex" && c.triggered)?.targets).toEqual(["vex"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("vex")).toBe("trash");
    expect(game.zoneOf("rex")).toBe("base");
  });

  test("declining to pay: the triggered ability is removed without effect — Vex undamaged, rainbow kept, Rex still in play", async () => {
    const game = await board(1).build();
    await playRexToDeflectPrompt(game);
    await game.p1.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("vex")).toBe("battlefield-bf1");
    expect(game.state("vex").damage).toBe(0);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("with no Power to pay Deflect at all, 'yes' is not acceptable and the trigger simply does nothing", async () => {
    const game = await board(0).build();
    await playRexToDeflectPrompt(game);
    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect(d).toMatchObject({ canAccept: false, seat: P1 });
      await game.p1.no();
    }
    await game.settle();
    expect(game.zoneOf("vex")).toBe("battlefield-bf1");
    expect(game.state("vex").damage).toBe(0);
    expect(game.zoneOf("rex")).toBe("base");
  });
});

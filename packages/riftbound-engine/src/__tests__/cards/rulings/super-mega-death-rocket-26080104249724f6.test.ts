/**
 * Ruling 26080104249724f6 — Super Mega Death Rocket! (OGN-252 → ogn-252-298) · [4] fury/chaos Action
 *     "Deal 5 to a unit. When you conquer, you may discard 1 to return this from your trash to your hand."
 *   (Immortal Phoenix ogn-037-298 is cited only as the contrasting "checks after the spell resolves" case.)
 *
 * Q: Can SMDR's conquer trigger be added to the chain if it is discarded to the trash by ANOTHER conquer trigger during
 *    the same conquer event?
 * A: No. All conquer triggers are evaluated at the moment of the conquer; SMDR must already be in the trash then. One
 *    that reaches the trash while other conquer triggers resolve is not retroactively added.
 * Rules: 383.2 (trigger conditions are evaluated when the event happens), 385.2 (zone the ability functions from).
 *
 * Reconstruction: the "other conquer trigger" is a first SMDR already in the trash — paying its "discard 1" discards the
 * second SMDR from hand during resolution.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMDR = "ogn-252-298";

/** P1's turn. P1's Attacker (3) will conquer P2's bf1 (1-Might Speedbump). */
function base() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Attacker" }, "att")
    .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "def");
}

async function conquer(game: Game): Promise<void> {
  await game.p1.move("att", "bf1");
  const r = await game.settle();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  expect(r.reason).toBe("unanswered");
}

describe("Ruling 26080104249724f6 — an SMDR discarded by another conquer trigger does not trigger off that same conquer", () => {
  test("at the conquer only the SMDR already IN THE TRASH triggers (one chain item, one prompt); the copy in hand does not", async () => {
    const game = await base().trash(P1, SMDR, "smdrTrash").hand(P1, SMDR, "smdrHand").build();
    await conquer(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["smdrTrash"]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "smdrTrash" } });
  });

  test("paying 'discard 1' discards the hand copy (P1's only card) → it lands in the trash mid-resolution, the first SMDR returns to hand — and NO second trigger/prompt appears: the discarded copy stays in the trash", async () => {
    const game = await base().trash(P1, SMDR, "smdrTrash").hand(P1, SMDR, "smdrHand").build();
    await conquer(game);
    await game.p1.yes();
    const prompts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d) {
        break;
      }
      prompts.push(`${d.kind}:${d.source?.cardId ?? "?"}`);
      if (d.kind === "yes-no") {
        await game.p1.yes(); // would (wrongly) return the second copy too
      } else if (d.kind === "pick") {
        await game.p1.pick(d.options[0]!.key);
      } else {
        break;
      }
    }
    expect(prompts.filter((p) => p.includes("smdrHand"))).toEqual([]); // never asked about the discarded copy
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["smdrTrash"]);
    expect(game.p1.trash()).toEqual(["smdrHand"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: when BOTH copies are already in the trash at the moment of conquer, both trigger — two prompts, and with two cards to discard both come back to hand", async () => {
    const game = await base()
      .trash(P1, SMDR, "smdrA")
      .trash(P1, SMDR, "smdrB")
      .hand(P1, { might: 1, name: "Fodder A" }, "fa")
      .hand(P1, { might: 1, name: "Fodder B" }, "fb")
      .build();
    await conquer(game);
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["smdrA", "smdrB"]);
    let asked = 0;
    for (let i = 0; i < 8; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d) {
        break;
      }
      if (d.kind === "yes-no") {
        asked++;
        await game.p1.yes();
      } else if (d.kind === "pick") {
        await game.p1.pick(d.options[0]!.key); // which fodder to discard
      } else if (d.kind === "order") {
        await game.p1.order(d.items.map((it) => it.key));
      } else {
        break;
      }
    }
    expect(asked).toBe(2);
    expect(game.p1.hand().sort()).toEqual(["smdrA", "smdrB"]);
    expect(game.p1.trash().sort()).toEqual(["fa", "fb"]);
  });
});

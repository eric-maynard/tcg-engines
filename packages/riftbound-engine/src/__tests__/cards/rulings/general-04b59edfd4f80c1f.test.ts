/**
 * Ruling 04b59edfd4f80c1f — (general Equipment question) illustrated with B.F. Sword (sfd-161-221 · Equipment · +3 · "[Equip] [order]")
 *   and Lucian, Merciless (sfd-113-221 · "[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for
 *   [rainbow] less, even if it's already attached.)").
 *
 * Q: Can you pay the Equip cost to move an Equipment from one unit to another?
 * A: No. While attached, the Equipment's own text box (its [Equip] ability) is inactive, so there is nothing to activate. Only
 *    specific effects (Weaponmaster, cards that unequip/reattach) can move it.
 * Rules: 435.1.c (printed [Equip] is active only while unattached), 718/719 (attached Equipment confers text to the wearer),
 *        821 (Weaponmaster explicitly allows an already-attached Equipment).
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BF_SWORD = "sfd-161-221";
const LUCIAN = "sfd-113-221";

/** P1's turn with [order]×2 + 3 energy. Knight (2) wears the Sword in base; Squire (1) is bare. Lucian in hand for the contrast. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Knight" }, "knight", { equippedWith: ["bfs"] })
    .card("bfs", { def: BF_SWORD, meta: { attachedTo: "knight" }, owner: P1, zone: "base" })
    .unit(P1, "base", { might: 1, name: "Squire" }, "squire")
    .hand(P1, LUCIAN, "lucian");
}

describe("Ruling 04b59edfd4f80c1f — an attached Equipment's [Equip] can't be paid again to move it", () => {
  test("premise: the Sword is attached to the Knight (2 + 3 = 5)", async () => {
    const game = await board().build();
    expect(game.state("bfs").attachedTo).toBe("knight");
    expect(game.state("knight")).toMatchObject({ attachments: ["bfs"], might: 5 });
  });

  test("with [order] floating and a bare Squire available, there is NO Equip action for the attached Sword — its [Equip] ability is inactive while attached (435.1.c)", async () => {
    const game = await board().build();
    expect(game.p1.legal().some((o) => o.moveId === "equipCard" && (o.card === "bfs" || JSON.stringify(o.variants).includes('"bfs"')))).toBe(false);
    expect(game.p1.can("equip", "bfs")).toBe(false);
    const r = await game.p1.try((p) => p.do("equipCard", { equipmentId: "bfs", unitId: "squire" }));
    expect(r.ok).toBe(false);
    expect(game.state("bfs").attachedTo).toBe("knight");
    expect(game.state("squire").might).toBe(1);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { order: 2 } });
  });

  test("control — the same Sword UNATTACHED in base does offer its [Equip] [order] (to Knight or Squire), and paying it attaches", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { order: 1 } })
      .unit(P1, "base", { might: 2, name: "Knight" }, "knight")
      .unit(P1, "base", { might: 1, name: "Squire" }, "squire")
      .gear(P1, BF_SWORD, "bfs")
      .build();
    expect(game.p1.legal().some((o) => o.moveId === "equipCard")).toBe(true);
    await game.p1.do("equipCard", { equipmentId: "bfs", unitId: "squire" });
    await game.settle();
    expect(game.state("bfs").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(4);
    expect(game.p1.power("order")).toBe(0);
  });

  test("nuance — a specific effect CAN move it: Lucian's Weaponmaster offers the already-attached Sword and re-equips it onto Lucian (Knight drops back to 2)", async () => {
    const game = await board().build();
    await game.p1.play("lucian");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "equip" });
    expect((d as PickDecision).options.map((o) => o.card)).toContain("bfs");
    await game.p1.pick("bfs");
    await game.settle();
    expect(game.state("bfs").attachedTo).toBe("lucian");
    expect(game.state("lucian").might).toBe(6);
    expect(game.state("knight")).toMatchObject({ attachments: [], might: 2 });
    expect(game.violations()).toEqual([]);
  });
});

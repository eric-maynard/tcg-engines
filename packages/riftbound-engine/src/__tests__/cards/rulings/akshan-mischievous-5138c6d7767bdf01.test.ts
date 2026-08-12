/**
 * Ruling 5138c6d7767bdf01 — Akshan, Mischievous (SFD-109 → sfd-109-221) · Unit/Champion · Body · [4] · 4 Might
 *   "[Weaponmaster] You may pay [body][body] as an additional cost to play me.
 *    When you play me, if you paid the additional cost, move an enemy gear to your base.
 *    You control it until I leave the board. If it's an Equipment, attach it to me."
 *   × Jax, Unrelenting (SFD-119 → sfd-119-221) — [Weaponmaster], re-attaches an Equipment to himself.
 *   × B.F. Sword (SFD-161 → sfd-161-221) — Equipment, [Equip] [order], +3 [Might].
 *
 * Q: Akshan steals my Equipment and then it is attached to another unit with Jax. When Akshan dies, do I get
 *    control of the Equipment back?
 * A: Yes. The control-change is tied to Akshan; when he leaves the board it stops applying and control reverts
 *    to the owner. It does NOT detach or bounce — it stays attached to whatever unit it is on. And you still
 *    cannot use its own [Equip] ability while it is attached: attached gear has inactive rules text.
 * Rules: 390.4/477.1.a (a control-change effect lasts only while its source is on the board),
 *        127.1 (owner), 434.1/457.1 (attachment survives independently of control), 718.2 (attached gear's
 *        own rules text is inactive).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const JAX = "sfd-119-221";
const B_F_SWORD = "sfd-161-221";

/** P1 plays Akshan paying [body][body] and steals P2's B.F. Sword, which attaches to Akshan. */
async function stealTheSword(): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 10, power: { body: 3, order: 2, rainbow: 2 } })
    .gear(P2, B_F_SWORD, "sword")
    .hand(P1, AKSHAN, "akshan")
    .hand(P1, JAX, "jax")
    .build();
  expect(game.state("sword")).toMatchObject({ cardType: "equipment", controller: P2, owner: P2 });

  await game.p1.play("akshan", { payOptional: true, to: "base" });
  const settled = await game.settle();
  if (settled.reason === "unanswered" && game.decision()?.seat === P1) {
    await game.p1.pick("sword");
    await game.settle();
  }
  expect(game.state("sword")).toMatchObject({ attachedTo: "akshan", controller: P1, owner: P2 });
  return game;
}

/** P1 plays Jax and uses [Weaponmaster] to move the stolen Sword onto Jax. */
async function moveSwordToJax(game: Game): Promise<void> {
  await game.p1.play("jax");
  expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
  await game.p1.pick("sword");
  await game.settle();
  const pay = game.decision();
  if (pay?.kind === "yes-no") {
    await game.p1.no(); // Jax's own optional "pay [1] to draw 1" — irrelevant here
    await game.settle();
  }
  expect(game.state("sword")).toMatchObject({ attachedTo: "jax", controller: P1 });
}

describe("Ruling 5138c6d7767bdf01 — when Akshan leaves, control of the stolen Equipment reverts; the attachment does not", () => {
  test("Akshan dies while the Sword is worn by Jax: control goes back to P2, the Sword stays on Jax", async () => {
    const game = await stealTheSword();
    await moveSwordToJax(game);

    await game.p1.do("killUnit", { cardId: game.card("akshan") });
    await game.settle();

    expect(game.zoneOf("akshan")).toBe("trash");
    expect(game.state("sword")).toMatchObject({ attachedTo: "jax", controller: P2, owner: P2, zone: "base" });
    expect(game.state("jax").might).toBe(6); // 3 + the Sword's +3 — it keeps working where it sits
    expect(game.violations()).toEqual([]);
  });

  test("while Akshan is still on the board, P1 controls the Sword even though it now sits on Jax", async () => {
    const game = await stealTheSword();
    await moveSwordToJax(game);

    expect(game.state("sword").controller).toBe(P1);
    expect(game.zoneOf("akshan")).toBe("base");
  });

  test("P2 cannot use the Sword's own [Equip] ability to take it back — attached gear has inactive rules text", async () => {
    const game = await stealTheSword();
    await moveSwordToJax(game);
    await game.p1.do("killUnit", { cardId: game.card("akshan") });
    await game.settle();

    expect(game.state("sword").controller).toBe(P2);
    expect(game.p2.can("equip", "sword")).toBe(false);
    expect(game.p2.legal().some((o) => o.card === "sword")).toBe(false);
  });
});

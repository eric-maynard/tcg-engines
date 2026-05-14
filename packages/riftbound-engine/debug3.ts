import { RuleEngine } from "@tcg/core";
import { riftboundDefinition } from "./src/game-definition/definition";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "./src/types";

const P1 = "player-1";
const P2 = "player-2";

const engine = new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
  riftboundDefinition,
  [{ id: P1, name: "P1" }, { id: P2, name: "P2" }],
  { seed: "debug" },
);
for (const pid of [P1, P2]) {
  engine.executeMove("initializeMainDeck", {
    params: { cardIds: Array.from({ length: 40 }, (_, i) => `${pid}-card-${i}`), playerId: pid },
    playerId: pid as any,
  });
  engine.executeMove("initializeRuneDeck", {
    params: { playerId: pid, runeIds: Array.from({ length: 12 }, (_, i) => `${pid}-rune-${i}`) },
    playerId: pid as any,
  });
  engine.executeMove("drawInitialHand", {
    params: { playerId: pid },
    playerId: pid as any,
  });
}
engine.executeMove("placeBattlefields", {
  params: { battlefieldIds: ["bf-1", "bf-2"] },
  playerId: P1 as any,
});

console.log("Before transitionToPlay: phase=", (engine.getState() as any).turn.phase);
const fm = engine.getFlowManager()!;
console.log("FM segment=", fm.getCurrentGameSegment(), "phase=", fm.getCurrentPhase());

engine.executeMove("transitionToPlay", {
  params: {},
  playerId: P1 as any,
});

console.log("After transitionToPlay: phase=", (engine.getState() as any).turn.phase);
console.log("FM segment=", fm.getCurrentGameSegment(), "phase=", fm.getCurrentPhase());

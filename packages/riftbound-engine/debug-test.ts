import { RuleEngine } from "@tcg/core";
import { riftboundDefinition } from "./src/game-definition/definition";
import type {
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "./src/types";

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
engine.executeMove("transitionToPlay", {
  params: {},
  playerId: P1 as any,
});

let state = engine.getState();
console.log("After setup: phase=", state.turn.phase, "player=", state.turn.activePlayer);

engine.executeMove("addResources", {
  params: { energy: 5, playerId: P1, power: { fury: 2 } },
  playerId: P1 as any,
});
state = engine.getState();
console.log("After addResources: phase=", state.turn.phase, "energy=", state.runePools[P1].energy, "fury=", state.runePools[P1].power.fury);

engine.executeMove("spendResources", {
  params: { energy: 3, playerId: P1, power: { fury: 1 } },
  playerId: P1 as any,
});
state = engine.getState();
console.log("After spendResources: phase=", state.turn.phase, "energy=", state.runePools[P1].energy, "fury=", state.runePools[P1].power.fury);

import { World, Player } from "hytopia";
import type { Lake } from "../Lake";
import type { BaseAgent } from "../BaseAgent";
import type { GamePhase, GameWorld } from "../types/GameState";

export class UIService {

    static sendLakeStatusUpdate(world: World, lake: Lake) {
        const lakeState = lake.getState();
        console.log('Sending lake update:', lakeState); // Debug log
        const playerEntities = world.entityManager.getAllPlayerEntities();
        
        playerEntities.forEach((playerEntity) => {
            // Access player through the playerEntity's properties
            if (playerEntity && playerEntity.player && playerEntity.player.ui) {
                console.log('Sending update to player:', playerEntity.name); // Use playerEntity.name instead
                playerEntity.player.ui.sendData({
                    type: 'lakeUpdate',
                    stock: lakeState.currentStock,
                    capacity: lakeState.maxCapacity,
                    isCollapsed: lakeState.isCollapsed
                });
            }
        });
    }

    static sendPhaseUpdate(world: GameWorld) {
        console.log(`UI Update: Phase changed to ${world.currentPhase}`);
        const playerEntities = world.entityManager.getAllPlayerEntities();
        
        playerEntities.forEach((playerEntity) => {
            if (playerEntity?.player?.ui) {
                playerEntity.player.ui.sendData({
                    type: 'phaseUpdate',
                    phase: world.currentPhase  // This will be either 'TOWNHALL' or 'HARVEST' matching the UI expectations
                });
            }
        });
    }

    static sendAgentThoughts(player: Player, agents: BaseAgent[]) {
        player.ui.sendData({
            type: "agentThoughts",
            agents: agents.map((agent) => {
                return {
                    name: agent.name,
                    lastThought: agent.getLastMonologue() || "Idle",
                    inventory: Array.from(agent.inventory.values())
                };
            }),
        });
    }

}
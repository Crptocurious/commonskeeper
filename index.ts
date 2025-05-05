import {
    startServer,
    Audio,
    ChatEvent,
    Player,
    PlayerEntity,
    PlayerEvent,
    Vector3,
    EntityEvent,
    World
} from "hytopia";

import { Lake } from "./src/Lake";
import { SIMULATION_CONFIG, AGENT_CONFIGS, TIME_CONFIG, DERIVED_TIME_CONFIG } from "./src/config/constants";
import worldMap from "./assets/map.json";
import { BaseAgent } from "./src/BaseAgent";
import { UIService } from "./src/services/UIService";
import { PlayerHandlers } from "./src/handlers/PlayerHandler";
import type { GameWorld } from "./src/types/GameState";

// Define the agent configurations

startServer((world: World) => {
    const gameWorld = world as GameWorld;
    gameWorld.currentTick = 0;
    gameWorld.currentPhase = 'TOWNHALL';

    // Set up the global tick interval
	setInterval(() => {
        gameWorld.currentTick++;

        // Calculate which phase we should be in based on current tick
        const totalCycleTicks = DERIVED_TIME_CONFIG.totalCycleTicks;
        
        // Reset tick counter when it reaches the total cycle length
        if (gameWorld.currentTick >= totalCycleTicks) {
            gameWorld.currentTick = 0;
        }
        
        const ticksInCurrentCycle = gameWorld.currentTick;

        // This ensures that first phase is always townhall
        const newPhase = ticksInCurrentCycle < DERIVED_TIME_CONFIG.townhallDurationTicks ? 'TOWNHALL' : 'HARVEST';
        
        // If phase changed, update UI and handle phase transition
        if (newPhase !== gameWorld.currentPhase) {
            gameWorld.currentPhase = newPhase;
            UIService.sendPhaseUpdate(gameWorld);
            
            // If transitioning to HARVEST, the lake stock doubles (regeneration)
            if (newPhase === 'HARVEST') {
                lake.regenerate(0); // Force immediate regeneration
                UIService.sendLakeStatusUpdate(gameWorld, lake);
            }
        }
	}, 1000 / TIME_CONFIG.TICKS_PER_SECOND); // Use the configured TPS from constants
    
    const agents: BaseAgent[] = [];
    const lake = new Lake(SIMULATION_CONFIG.LAKE_CAPACITY, SIMULATION_CONFIG.LAKE_INITIAL_STOCK, 1, 0);

    const gameContext = { lake }; // Used to provide context needed by the agents behavior
    
    // Initialize world & agents
    gameWorld.loadMap(worldMap);

    // Initialize agents
    AGENT_CONFIGS.forEach(config => {
        const agent = new BaseAgent({
            name: config.name,
            systemPrompt: config.systemPrompt,
        });
        
        config.behaviorConfigs.forEach(behaviorConfig => {
            const behavior = new behaviorConfig.type(...(behaviorConfig.args || []));
            agent.addBehavior(behavior);
        });
        
        agent.spawn(gameWorld, config.spawnLocation);
        agents.push(agent);
    });

    // Listen for lake updates and update UI
    lake.on('lakeUpdated', (gameWorld, lake) => {
        UIService.sendLakeStatusUpdate(gameWorld, lake);
    });

    // Handle player events
    gameWorld.on(PlayerEvent.JOINED_WORLD, (event) => {
        if (event.player) {
            PlayerHandlers.handlePlayerJoin(gameWorld, event.player, agents, lake);
            
            UIService.sendPhaseUpdate(gameWorld); // Send initial phase update
            UIService.sendLakeStatusUpdate(gameWorld, lake);
            UIService.sendAgentThoughts(event.player, agents);

            // Play ambient music
            new Audio({
                uri: "audio/music/hytopia-main.mp3",
                loop: true,
                volume: 0.1,
            }).play(gameWorld);
                        
        }
    });

    gameWorld.on(PlayerEvent.LEFT_WORLD, (event) => {
        if (event.player) {
            PlayerHandlers.handlePlayerLeave(gameWorld, event.player);
        }
    });

    // Add tick handler for lake regeneration
    gameWorld.on(EntityEvent.TICK, (payload: any) => {
        const { deltaTimeMs } = payload as { deltaTimeMs: number };
        lake.regenerate(deltaTimeMs);
    });
});
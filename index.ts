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
import { MetricsTracker } from "./src/MetricsTracker";
import { EVENT_COLLAPSE } from "./src/Lake";

// Define the agent configurations

// --- Simulation Duration --- TODO: Make this configurable
const CYCLES_TO_RUN = 10;
const TOTAL_SIMULATION_TICKS = DERIVED_TIME_CONFIG.totalCycleTicks * CYCLES_TO_RUN;

startServer((world: World) => {
    const gameWorld = world as GameWorld;
    gameWorld.currentTick = 0;
    gameWorld.currentPhase = 'TOWNHALL';
    gameWorld.agents = []; // Initialize agents array on gameWorld
    let totalElapsedTicks = 0; // Track total ticks for simulation end

    // --- Initialize Lake ---
    const lake = new Lake(
        SIMULATION_CONFIG.LAKE_CAPACITY,
        SIMULATION_CONFIG.LAKE_INITIAL_STOCK,
        1, // Assuming regenRate parameter is not used by doubling logic anymore
        gameWorld.currentTick
    );
    gameWorld.lake = lake; // Assign lake to gameWorld

    // --- Initialize Metrics Tracker ---
    const metricsTracker = new MetricsTracker("sim", TOTAL_SIMULATION_TICKS);
    metricsTracker.simulationStarted(gameWorld.currentTick, lake.getCurrentStock());
    gameWorld.metricsTracker = metricsTracker; // Assign to gameWorld

    // --- Setup Lake Collapse Listener ---
    lake.on(EVENT_COLLAPSE, () => {
        console.log("EVENT LISTENER: Lake collapse detected!");
        metricsTracker.lakeCollapsed(totalElapsedTicks, lake.getCurrentStock());
        // Optionally stop the simulation on collapse
        // clearInterval(simulationInterval);
        // metricsTracker.simulationEnded(totalElapsedTicks, lake); 
    });

    // Set up the global tick interval
	const simulationInterval = setInterval(() => {
        // Check for simulation end condition (time limit or collapse)
        if (totalElapsedTicks >= TOTAL_SIMULATION_TICKS || lake.isCollapsed()) {
            clearInterval(simulationInterval);
            if (!metricsTracker.isReportGenerated()) { // Ensure report is generated only once
                 metricsTracker.simulationEnded(totalElapsedTicks, lake);
            }
            console.log(`Simulation ended. Reason: ${lake.isCollapsed() ? 'Lake Collapsed' : 'Time Limit Reached'} at tick ${totalElapsedTicks}`);
            return; // Stop further processing
        }

        // Increment ticks
        totalElapsedTicks++;
        gameWorld.currentTick++;

        // Calculate which phase we should be in based on current tick within the cycle
        const totalCycleTicks = DERIVED_TIME_CONFIG.totalCycleTicks;
        
        if (gameWorld.currentTick >= totalCycleTicks) {
            metricsTracker.cycleEnded(totalElapsedTicks); // Log end of cycle metrics *before* resetting tick
            gameWorld.currentTick = 0; // Reset tick counter for the new cycle
        }
        
        const ticksInCurrentCycle = gameWorld.currentTick;

        // This ensures that first phase is always townhall
        const newPhase = ticksInCurrentCycle < DERIVED_TIME_CONFIG.townhallDurationTicks ? 'TOWNHALL' : 'HARVEST';
        
        // If phase changed, update UI and handle phase transition
        if (newPhase !== gameWorld.currentPhase) {
            const oldPhase = gameWorld.currentPhase;
            gameWorld.currentPhase = newPhase;
            UIService.sendPhaseUpdate(gameWorld);

            // Record fish stock at the end of each phase
            metricsTracker.recordFishStock(totalElapsedTicks, lake.getCurrentStock());
            
            // If transitioning TO HARVEST (meaning Townhall just ended), lake regenerates
            if (newPhase === 'HARVEST') {
                const regeneratedAmount = lake.regenerate(totalElapsedTicks, gameWorld); 
                metricsTracker.recordLakeRegeneration(regeneratedAmount);
                UIService.sendLakeStatusUpdate(gameWorld, lake); // Update UI after regeneration
                console.log(`--- Cycle ${metricsTracker.getCurrentCycleNumber()}, Phase Change: TOWNHALL -> HARVEST. Lake regenerated: ${regeneratedAmount.toFixed(2)} ---`);
            }
            if (newPhase === 'TOWNHALL') {
                 console.log(`--- Cycle ${metricsTracker.getCurrentCycleNumber()}, Phase Change: HARVEST -> TOWNHALL ---`);
            }
        }
	}, 1000 / TIME_CONFIG.TICKS_PER_SECOND);
    
    // Assign agents to gameWorld.agents
    const agents: BaseAgent[] = [];

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
    gameWorld.agents = agents; // Make agents accessible on gameWorld

    // Listen for lake updates and update UI
    lake.on('lakeUpdated', (gameWorld, lake) => {
        UIService.sendLakeStatusUpdate(gameWorld, lake);
    });

    // Handle player events
    gameWorld.on(PlayerEvent.JOINED_WORLD, (event) => {
        if (event.player) {
            // Pass metricsTracker to handlers if needed, or handle metrics calls directly in behaviors
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
});
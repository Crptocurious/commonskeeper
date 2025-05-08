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
import type { GamePhase } from "./src/types/GameState";

// Define the agent configurations

// --- Simulation Duration --- TODO: Make this configurable
const CYCLES_TO_RUN = 10;
const TOTAL_SIMULATION_TICKS = DERIVED_TIME_CONFIG.totalCycleTicks * CYCLES_TO_RUN;

startServer((world: World) => {
    const gameWorld = world as GameWorld;
    gameWorld.currentTick = 0;
    gameWorld.currentPhase = 'PLANNING';
    gameWorld.currentCycle = 0; // Initialize cycle number
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
        
        // Stop the simulation immediately
        clearInterval(simulationInterval);
        
        // Ensure final metrics are recorded
        if (!metricsTracker.isReportGenerated()) {
            metricsTracker.simulationEnded(totalElapsedTicks, lake);
        }
        
        console.log(`Simulation ended due to lake collapse at tick ${totalElapsedTicks}`);
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

        // Determine current phase based on ticks within the cycle
        const totalCycleTicks = DERIVED_TIME_CONFIG.totalCycleTicks;
        let newPhase: GamePhase;
        const ticksInCurrentCycle = gameWorld.currentTick % totalCycleTicks; // Use modulo for current position in cycle

        if (ticksInCurrentCycle < DERIVED_TIME_CONFIG.planningDurationTicks) {
            newPhase = 'PLANNING';
        } else if (ticksInCurrentCycle < DERIVED_TIME_CONFIG.planningDurationTicks + DERIVED_TIME_CONFIG.harvestingDurationTicks) {
            newPhase = 'HARVESTING';
        } else {
            newPhase = 'DISCUSSION';
        }

        // Detect cycle end (transition from Discussion back to Planning)
        const justCompletedCycle = gameWorld.currentTick > 0 && gameWorld.currentTick % totalCycleTicks === 0;
        if (justCompletedCycle) {
            // Log end of cycle metrics *before* potential phase change / regeneration
            metricsTracker.cycleEnded(totalElapsedTicks);
            gameWorld.currentCycle++; // Increment cycle number
            gameWorld.currentTick = 0; // Reset tick counter for new cycle
            console.log(`--- Starting Cycle ${gameWorld.currentCycle} ---`);
        }

        // Phase Change Logic
        if (newPhase !== gameWorld.currentPhase) {
            const oldPhase = gameWorld.currentPhase;
            gameWorld.currentPhase = newPhase;
            UIService.sendPhaseUpdate(gameWorld);
            console.log(`--- Cycle ${metricsTracker.getCurrentCycleNumber()}, Tick ${totalElapsedTicks}: Phase Change: ${oldPhase} -> ${newPhase} ---`);

            // Record fish stock at the end of HARVESTING and DISCUSSION phases
            if (oldPhase === 'HARVESTING' || oldPhase === 'DISCUSSION') {
                 metricsTracker.recordFishStock(totalElapsedTicks, lake.getCurrentStock());
            }

            // Lake Regenerates at the START of the PLANNING phase (end of Discussion)
            if (newPhase === 'PLANNING') {
                const regeneratedAmount = lake.regenerate(totalElapsedTicks, gameWorld);
                metricsTracker.recordLakeRegeneration(regeneratedAmount); 
                UIService.sendLakeStatusUpdate(gameWorld, lake); // Update UI after regeneration
                console.log(`--- Lake Regenerated: ${regeneratedAmount.toFixed(2)} ---`);
            }
        }

        // Note: We no longer reset gameWorld.currentTick to 0 within the loop.
        // totalElapsedTicks tracks total time, and (gameWorld.currentTick % totalCycleTicks) determines phase.
        // Simulation end condition handles stopping.

	}, 1000 / TIME_CONFIG.TICKS_PER_SECOND);
    
    // Assign agents to gameWorld.agents
    const agents: BaseAgent[] = [];

    // const gameContext = { lake }; // Used to provide context needed by the agents behavior
    
    // Initialize world & agents
    gameWorld.loadMap(worldMap);

    // Initialize agents
    AGENT_CONFIGS.forEach(config => {
        const agent = new BaseAgent({
            name: config.name,
            systemPrompt: config.systemPrompt,
        });
        
        config.behaviorConfigs.forEach(behaviorConfig => {
            // Map string arguments to actual instances
            const resolvedArgs = (behaviorConfig.args || []).map(arg => {
                if (arg === 'lake') return lake;
                return arg;
            });
            const behavior = new behaviorConfig.type(...resolvedArgs);
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
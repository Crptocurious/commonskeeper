/**
 * HYTOPIA SDK Boilerplate
 *
 * This is a simple boilerplate to get started on your project.
 * It implements the bare minimum to be able to run and connect
 * to your game server and run around as the basic player entity.
 *
 * From here you can begin to implement your own game logic
 * or do whatever you want!
 *
 * You can find documentation here: https://github.com/hytopiagg/sdk/blob/main/docs/server.md
 *
 * For more in-depth examples, check out the examples folder in the SDK, or you
 * can find it directly on GitHub: https://github.com/hytopiagg/sdk/tree/main/examples/payload-game
 *
 * You can officially report bugs or request features here: https://github.com/hytopiagg/sdk/issues
 *
 * To get help, have found a bug, or want to chat with
 * other HYTOPIA devs, join our Discord server:
 * https://discord.gg/DXCXJbHSJX
 *
 * Official SDK Github repo: https://github.com/hytopiagg/sdk
 * Official SDK NPM Package: https://www.npmjs.com/package/hytopia
 */

import {
	startServer,
	Audio,
	ChatEvent,
	Player,
	PlayerEntity,
	PlayerEvent,
	Vector3,
	// EntityEvent, // No longer needed for lake regeneration
	World,
} from "hytopia";

import worldMap from "./assets/map.json";

// Agent and Behavior Imports (adjust paths if needed)
import { BaseAgent } from "./src/BaseAgent";
import { FollowBehavior } from "./src/behaviors/FollowBehavior";
import { PathfindingBehavior } from "./src/behaviors/PathfindingBehavior";
import { SpeakBehavior } from "./src/behaviors/SpeakBehavior";
import { TradeBehavior } from "./src/behaviors/TradeBehavior";
import { FishingBehavior } from "./src/behaviors/FishingBehavior";
// import { AgentUpdateContext } from "./src/BaseAgent"; // Import the context interface
import type { AgentUpdateContext } from "./src/BaseAgent"; // Corrected: Use type-only import

import { Lake } from "./src/Lake";
import { logEvent } from "./src/logger";

// --- Global Variables ---
const agents: BaseAgent[] = []; // Global array to track spawned agents
const CHAT_RANGE = 10;
const LAKE_CAPACITY = 100; // INCREASED: Match Lake instance capacity
const LAKE_COLLAPSE_THRESHOLD = LAKE_CAPACITY * 0.10; // UPDATED: 10% of new capacity (10 fish)
const lake = new Lake(LAKE_CAPACITY, LAKE_CAPACITY, 1); // UPDATED: Lake instance (Capacity 100, Initial 100)

const LOCATIONS = {
	pier: new Vector3(31.5, 3, 59.5)
};

// --- Added Turn-Based Fishing Tracking ---
let currentFishingTurnIndex = 0;
// --- End Added Turn-Based Fishing Tracking ---

// --- Time and Phase Configuration (Moved Before Prompts) ---
const TICKS_PER_HOUR = 60 * 60; // Assuming 60 ticks per second, 60 seconds per minute
const TICKS_PER_DAY = TICKS_PER_HOUR * 24;
const HARVEST_WINDOW_DURATION_MINUTES = 10;
const TOWNHALL_DURATION_MINUTES = 50;

const ticksPerMinute = TICKS_PER_HOUR / 60;
const harvestWindowTicks = HARVEST_WINDOW_DURATION_MINUTES * ticksPerMinute;
const townhallDurationTicks = TOWNHALL_DURATION_MINUTES * ticksPerMinute;
const totalCycleTicks = harvestWindowTicks + townhallDurationTicks;

// --- Reusable Fisherman Behaviors Config & Context ---
interface BehaviorConfig {
    type: new (...args: any[]) => any;
    args?: (keyof GameContext)[];
}

interface GameContext {
    lake: Lake;
}

const gameContext: GameContext = { lake };

const fishermanBehaviorConfigs: BehaviorConfig[] = [
    { type: FollowBehavior },
    { type: PathfindingBehavior },
    { type: SpeakBehavior },
    { type: TradeBehavior },
    { type: FishingBehavior, args: ['lake'] }
];

// --- Specific Agent Config Structure ---
interface SpecificAgentConfig {
    name: string;
    systemPrompt: string;
    behaviorConfigs: BehaviorConfig[];
    spawnLocation: Vector3;
}

// --- Revised Agent Prompts (Reflecting Current Logic) ---

const commonAgentInstructions_CurrentLogic = `
You are a fisherman fishing in a shared lake with 2 others (3 total). Your survival depends on managing energy by fishing.

**Lake Rules (CRITICAL):**
*   Capacity: ${LAKE_CAPACITY} tons.
*   Collapse: If stock drops to ${LAKE_COLLAPSE_THRESHOLD} ton or less after harvest, the lake collapses PERMANENTLY. No more fishing possible, ever.
*   Regeneration: At the start of each HARVEST phase (every hour), current stock DOUBLES, up to ${LAKE_CAPACITY} tons max. No regeneration if collapsed.

**Simulation Context (Check your 'state'):**
*   Current Time: state.currentTimeTicks
*   Current Phase: state.currentPhase ('HARVEST' or 'TOWNHALL')
*   Your Energy: state.energy / 1000
*   Your Inventory: state.inventory fish
*   Lake Status: state.lakeStock (current fish)
*   Townhall Reports: state.lastHarvestReports (dictionary of {agentName: fishCaught})

**Schedule (1-hour cycle):**
*   HARVEST phase: First ${HARVEST_WINDOW_DURATION_MINUTES} minutes (${harvestWindowTicks} ticks). ONLY time to fish. Fish one agent per tick (turn-based).
*   TOWNHALL phase: Next ${TOWNHALL_DURATION_MINUTES} minutes (${townhallDurationTicks} ticks). Discuss previous harvest.

**Your Goal:** Survive long-term. Decide how much fish (suggested range: 0-5 tons, consider capacity ${LAKE_CAPACITY}) to attempt harvesting in the upcoming HARVEST window. Catching too much risks PERMANENT COLLAPSE.

**Decision/Action Required:**
1.  Harvest Plan (During TOWNHALL/Before HARVEST): Output: <plan harvest=N />. Reason in <monologue>. Base decision on lake stock, energy (1 fish = ~10 energy), others' reports, and **avoiding permanent collapse**.
2.  Harvest Action (During HARVEST, when it's your turn): Output: <action type="cast_rod"></action> to attempt fishing. You can only do this once per turn.
3.  Townhall Report (During TOWNHALL): Output: <report harvest=X /> (X = actual fish caught last harvest).
4.  Townhall Speak (During TOWNHALL): Output: <action type="townhall_speak">{"message": "Your public message here."}</action> to broadcast to everyone.
5.  Nearby Speak (Any Time): Output: <action type="speak">{"message": "Your nearby message here."}</action> for local chat.
6.  Movement/Other (Optional): Output: <action type="pathfindTo">...</action> to move to pier (coords: ${LOCATIONS.pier.x},${LOCATIONS.pier.y},${LOCATIONS.pier.z}).

Remember: Collapse is PERMANENT. Be careful.
`;

const johnPrompt_CurrentLogic = `You are John, a cautious fisherman.
${commonAgentInstructions_CurrentLogic}
*Townhall Reports:* Last reports were Kate: [Kate's last report], Jack: [Jack's last report].
*Your Strategy:* Prioritize long-term lake health. Be conservative, especially if others seem greedy or stock is low. Avoid collapse at all costs.`;

const katePrompt_CurrentLogic = `You are Kate, an opportunistic fisherwoman.
${commonAgentInstructions_CurrentLogic}
*Townhall Reports:* Last reports were John: [John's last report], Jack: [Jack's last report].
*Your Strategy:* Ensure your own survival first. You might risk taking more if the lake seems plentiful, but understand permanent collapse is disastrous.`;

const jackPrompt_CurrentLogic = `You are Jack, a pragmatic fisherman.
${commonAgentInstructions_CurrentLogic}
*Townhall Reports:* Last reports were John: [John's last report], Kate: [Kate's last report].
*Your Strategy:* Balance your needs with the lake's health. Observe others and adjust your harvest based on the overall situation and stock levels.`;

// --- Define the 3 Specific Agents --- (Using Revised Prompts)
const specificAgentConfigs: SpecificAgentConfig[] = [
    {
        name: "John",
        systemPrompt: johnPrompt_CurrentLogic,
        behaviorConfigs: fishermanBehaviorConfigs,
        spawnLocation: new Vector3(30, 3, 55) // Location 1 (Adjust if needed)
    },
    {
        name: "Kate",
        systemPrompt: katePrompt_CurrentLogic,
        behaviorConfigs: fishermanBehaviorConfigs,
        spawnLocation: new Vector3(33, 3, 56) // Location 2
    },
    {
        name: "Jack",
        systemPrompt: jackPrompt_CurrentLogic,
        behaviorConfigs: fishermanBehaviorConfigs,
        spawnLocation: new Vector3(28, 3, 57) // Location 3
    }
];

// --- Spawning Function for Specific Agents ---
function spawnSpecificAgents(world: World, configs: SpecificAgentConfig[], context: GameContext): BaseAgent[] {
    const spawnedAgents: BaseAgent[] = [];

    configs.forEach(config => {
        console.log(`Spawning agent: ${config.name}`);
        const agent = new BaseAgent({
            name: config.name,
            // NOTE: Prompt placeholders like [Kate's last report] need to be handled by the agent's internal state/context building
            systemPrompt: config.systemPrompt
        });

        // Add behaviors
        config.behaviorConfigs.forEach(bhConfig => {
            try {
                 const constructorArgs = bhConfig.args ? bhConfig.args.map(argName => {
                     if (!(argName in context)) {
                         throw new Error(`Context missing required argument '${String(argName)}' for behavior ${bhConfig.type.name}`);
                     }
                     return context[argName];
                 }) : [];
                agent.addBehavior(new bhConfig.type(...constructorArgs));
             } catch (error) {
                 console.error(`Failed to add behavior ${bhConfig.type.name} to agent ${config.name}:`, error);
             }
        });

        // Spawn the agent
        try {
            agent.spawn(world, config.spawnLocation);
            spawnedAgents.push(agent);
            console.log(`Successfully spawned ${config.name} at ${config.spawnLocation.toString()}`);
        } catch(error) {
            console.error(`Failed to spawn agent ${config.name} at ${config.spawnLocation.toString()}:`, error);
        }
    });

    return spawnedAgents;
}

// --- Game World Setup ---
type GamePhase = 'HARVEST' | 'TOWNHALL';

interface GameWorld extends World {
	currentTimeTicks: number;
	ticksPerHour: number;
	ticksPerDay: number;
    currentPhase: GamePhase;
    // Add a way to store last harvest reports for prompts if needed
    lastHarvestReports?: { [agentName: string]: number };
}

// --- UI Update Helpers ---
function sendLakeStatusUpdate(world: World, lakeInstance: Lake) {
	const { stock, capacity } = lakeInstance.getState();
    const isCollapsed = lakeInstance.isCollapsed();
	const playerEntities = world.entityManager.getAllPlayerEntities();
	playerEntities.forEach((playerEntity: any) => {
		const player = playerEntity?.player; // Optional chaining for safety
		if (player && player.ui) {
			player.ui.sendData({
				type: 'lakeUpdate',
				stock: stock,
				capacity: capacity,
                isCollapsed: isCollapsed
			});
		}
	});
}

function sendPhaseUpdate(world: World, phase: GamePhase) {
    console.log(`UI Update: Phase changed to ${phase}`);
    const playerEntities = world.entityManager.getAllPlayerEntities();
	playerEntities.forEach((playerEntity: any) => {
		const player = playerEntity?.player;
		if (player && player.ui) {
			player.ui.sendData({
				type: 'phaseUpdate',
				phase: phase
			});
		}
	});
}

// --- Added Public Broadcast Function ---
function broadcastPublicMessage(senderAgent: BaseAgent, message: string, world: GameWorld, currentTick: number) {
    const cleanMessage = message.replace(/\</g, "&lt;").replace(/>/g, "&gt;"); // Basic sanitization
    console.log(`[PUBLIC CHAT] ${senderAgent.name}: ${cleanMessage}`);
    logEvent({
        type: 'PUBLIC_CHAT',
        sender: senderAgent.name,
        message: cleanMessage,
        tick: currentTick
    });

    // Send to all agents (except sender)
    agents.forEach((recipientAgent) => {
        if (recipientAgent !== senderAgent) {
            recipientAgent.handlePublicChat(senderAgent.name, cleanMessage);
        }
    });

    // Optional: Send to player UIs as well?
    const playerEntities = world.entityManager.getAllPlayerEntities();
    playerEntities.forEach((playerEntity: any) => {
        const player = playerEntity?.player;
        if (player && player.ui) {
            player.ui.sendData({
                type: 'publicChatUpdate', // New UI event type
                sender: senderAgent.name,
                message: cleanMessage
            });
        }
    });
}
// --- End Public Broadcast Function ---

// --- Server Start ---
startServer((world) => {
	const gameWorld = world as GameWorld;

	// Initialize time & phase properties
	gameWorld.currentTimeTicks = 0;
	gameWorld.ticksPerHour = TICKS_PER_HOUR;
	gameWorld.ticksPerDay = TICKS_PER_DAY;
    gameWorld.currentPhase = 'TOWNHALL'; // Start with TOWNHALL
    gameWorld.lastHarvestReports = {}; // Initialize harvest reports

    console.log(`Simulation Config: TicksPerMin=${ticksPerMinute}, HarvestTicks=${harvestWindowTicks}, TownhallTicks=${townhallDurationTicks}, CycleTicks=${totalCycleTicks}`);
    console.log(`Lake Config: Capacity=${LAKE_CAPACITY}, Collapse Threshold <= ${LAKE_COLLAPSE_THRESHOLD}`);

    // --- Spawn Specific Agents ---
    const spawnedAgents = spawnSpecificAgents(gameWorld, specificAgentConfigs, gameContext);

    // Update the global agents array
    agents.length = 0; // Clear previous agents
    agents.push(...spawnedAgents);
    console.log(`Total agents spawned: ${agents.length}`);
    if (agents.length !== 3) {
        console.warn(`Expected 3 agents, but spawned ${agents.length}.`);
    }

	// --- Game Loop ---
	setInterval(() => {
        const currentTick = gameWorld.currentTimeTicks;
        const tickInCycle = currentTick % totalCycleTicks;
        const currentPhase = gameWorld.currentPhase; // Cache current phase for the tick

        // --- Phase Transitions ---
        // Start of Cycle / Trigger Regeneration / Start HARVEST Phase
        if (tickInCycle === 0 && currentTick > 0) { // Skip regen/phase change on tick 0
            console.log(`Tick ${currentTick}: Starting new cycle. Regenerating lake.`);
            lake.regenerate();
            sendLakeStatusUpdate(gameWorld, lake);

            if (currentPhase !== 'HARVEST') {
                gameWorld.currentPhase = 'HARVEST';
                logEvent({ type: 'PHASE_START', phase: 'HARVEST', tick: currentTick, durationTicks: harvestWindowTicks });
                sendPhaseUpdate(gameWorld, gameWorld.currentPhase);
                console.log(`Tick ${currentTick}: Phase changed to HARVEST.`);
                // Clear previous harvest reports when new harvest starts
                gameWorld.lastHarvestReports = {};
            }
        }

        // --- End of Harvest Window / Trigger Collapse Check / Start TOWNHALL Phase ---
        if (tickInCycle === harvestWindowTicks && currentTick > 0) { // Check end of harvest window
            console.log(`Tick ${currentTick}: Harvest window ending. Checking lake collapse.`);
            lake.checkCollapse();
            sendLakeStatusUpdate(gameWorld, lake);

            if (currentPhase !== 'TOWNHALL') {
                gameWorld.currentPhase = 'TOWNHALL';
                logEvent({ type: 'PHASE_START', phase: 'TOWNHALL', tick: currentTick, durationTicks: townhallDurationTicks });
                sendPhaseUpdate(gameWorld, gameWorld.currentPhase);
                 console.log(`Tick ${currentTick}: Phase changed to TOWNHALL.`);
                 // Agent logic should now handle reporting harvests based on this phase
                 // BaseAgent.buildContext needs to populate state.lastHarvestReports based on actual harvest actions
            }
        }

        // --- Agent Processing ---
        // Prepare context for agent updates
        const agentUpdateContext: AgentUpdateContext = {
            currentTick: currentTick,
            currentPhase: gameWorld.currentPhase, // Use the potentially updated phase for this tick
            lake: lake,
            lastHarvestReports: gameWorld.lastHarvestReports,
            broadcastPublicMessage: (sender, message) => broadcastPublicMessage(sender, message, gameWorld, currentTick) // Pass bound function
        };

        // --- Turn-Based Fishing Logic (Only during HARVEST) ---
        if (gameWorld.currentPhase === 'HARVEST') {
            if (agents.length > 0) {
                 // Ensure index is valid
                currentFishingTurnIndex = currentFishingTurnIndex % agents.length;
                const agentWhoseTurnItIs = agents[currentFishingTurnIndex];

                // Set flags for all agents
                agents.forEach((agent, index) => {
                    agent.canAttemptFishThisTick = (index === currentFishingTurnIndex);
                    if (index === currentFishingTurnIndex) {
                        console.log(`Tick ${currentTick}: ${agent.name}'s turn to fish.`);
                    }
                });
                
                // Update index for the *next* tick
                currentFishingTurnIndex = (currentFishingTurnIndex + 1) % agents.length;
            } else {
                 // Reset index if no agents
                currentFishingTurnIndex = 0;
            }
        } else {
            // Ensure no one can fish outside HARVEST phase
            agents.forEach(agent => {
                agent.canAttemptFishThisTick = false;
            });
        }
        // --- End Turn-Based Fishing Logic ---

        // Call BaseAgent.update() for each agent with the context
        agents.forEach(agent => {
             if (!agent.isDead) { // Optional: Check if agent is alive
                try {
                    agent.update(agentUpdateContext);
                } catch (error) {
                    console.error(`Error updating agent ${agent.name}:`, error);
                }
            }
        });

		// Optional: Periodic Log
		if (currentTick > 0 && currentTick % (TICKS_PER_HOUR / 4) === 0) {
		    console.log(`Tick: ${currentTick}, Phase: ${gameWorld.currentPhase}, Lake Stock: ${lake.getState().stock}`);
		}

        // Increment tick
		gameWorld.currentTimeTicks++;

	}, 1000 / 60); // Assuming a 60 TPS simulation rate


	/**
	 * Load map.
	 */
	world.loadMap(worldMap);

    // --- Initial Logging and UI Updates ---
	const lakeState = lake.getState();
    const isInitiallyCollapsed = lake.isCollapsed();
	logEvent({
		type: "game_start",
        tick: gameWorld.currentTimeTicks,
		lake_config: {
			capacity: lakeState.capacity,
			initial_stock_value: lakeState.stock,
            is_initially_collapsed: isInitiallyCollapsed,
            collapse_threshold: LAKE_COLLAPSE_THRESHOLD
		},
        phase_config: {
            harvest_window_ticks: harvestWindowTicks,
            townhall_duration_ticks: townhallDurationTicks,
            total_cycle_ticks: totalCycleTicks
        },
		agents: agents.map(agent => ({ // Log the dynamically spawned agents
			name: agent.name
		}))
	});
    logEvent({ type: 'PHASE_START', phase: gameWorld.currentPhase, tick: gameWorld.currentTimeTicks, durationTicks: townhallDurationTicks });
    sendPhaseUpdate(gameWorld, gameWorld.currentPhase);
    sendLakeStatusUpdate(gameWorld, lake);


	/**
	 * Player Join Logic
	 */
	world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
		const playerEntity = new PlayerEntity({
			player,
			name: "Player",
			modelUri: "models/players/player.gltf",
			modelLoopedAnimations: ["idle"],
			modelScale: 0.5,
		});

		playerEntity.spawn(world, { x: 0, y: 10, z: 0 });
		player.ui.load("ui/index.html");

		// Welcome messages...
		world.chatManager.sendPlayerMessage(player,"Welcome to the game!","00FF00");
		world.chatManager.sendPlayerMessage(player, "Use WASD to move around.");
		world.chatManager.sendPlayerMessage(player, "Press space to jump.");
		world.chatManager.sendPlayerMessage(player, "Hold shift to sprint.");
		world.chatManager.sendPlayerMessage(player,"Press \\ to enter or exit debug view.");

		// Send initial states to player UI on join
        sendLakeStatusUpdate(world, lake);
        sendPhaseUpdate(world, gameWorld.currentPhase);

		// Send initial agent thoughts/states
		player.ui.sendData({
			type: "agentThoughts",
			agents: agents.map((agent) => { // Uses global agents array
				const agentState = agent.getCurrentState();
				return {
					name: agent.name,
					lastThought: agent.getLastMonologue() || "Idle",
                    // Example: Pass energy/inventory if available in state
                    // energy: agentState?.energy,
                    // inventory: agentState?.inventory
				};
			}),
		});
	});

	/**
	 * Player Leave Logic
	 */
	world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
		world.entityManager
			.getPlayerEntitiesByPlayer(player)
			.forEach((entity) => entity.despawn());
	});

	/**
	 * Ambient Music
	 */
	new Audio({
		uri: "audio/music/hytopia-main.mp3",
		loop: true,
		volume: 0.1,
	}).play(world);

	/**
	 * Chat Handling Logic
	 */
	world.chatManager.on(ChatEvent.BROADCAST_MESSAGE, ({ player, message }) => {
		if (!player) { // Agent message
             const agentNameMatch = message.match(/^\[([^\]]+)\]/);
             const agentName = agentNameMatch ? agentNameMatch[1] : null;
			if (agentName) {
                 const sourceAgent = agents.find((a) => a.name === agentName);
				if (sourceAgent) {
					agents.forEach((targetAgent) => {
						if (targetAgent !== sourceAgent) {
                             try {
                                 const distance = Vector3.fromVector3Like(sourceAgent.position).distance(Vector3.fromVector3Like(targetAgent.position));
                                 if (distance <= CHAT_RANGE) {
                                     targetAgent.handleExternalChat({ 
									type: "Agent",
                                         message: message.substring(agentNameMatch![0].length).trim(), 
                                         agent: sourceAgent 
								});
							}
                             } catch (e) { console.error(`Chat routing error for ${targetAgent.name}:`, e); }
						}
					});
                 } else { console.warn(`Chat: Source agent ${agentName} not found.`); }
             } else { console.warn(`Chat: Agent message lacks name prefix: ${message}`); }
			return;
		}

        // Player message
        const playerEntity = world.entityManager.getPlayerEntitiesByPlayer(player)?.[0];
        if (!playerEntity) {
            console.warn(`Chat: Player ${player.username} entity not found.`);
            return;
        }
		agents.forEach((agent) => {
            try {
                const distance = Vector3.fromVector3Like(playerEntity.position).distance(Vector3.fromVector3Like(agent.position));
                if (distance <= CHAT_RANGE) {
                     agent.handleExternalChat({ 
					type: "Player",
					message,
                         player 
				});
			}
            } catch(e) { console.error(`Chat routing error for ${agent.name} from ${player.username}:`, e); }
		});
	});
});

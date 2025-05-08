import { Vector3} from "hytopia";
import { BaseAgent, type AgentBehavior } from "../BaseAgent";
import { Lake } from "../Lake";
import { logEvent } from "../logger";
import { LOCATIONS, SIMULATION_CONFIG, TIME_CONFIG } from "../config/constants";
import type { GameWorld } from "../types/GameState";
import { buildFishingPrompt } from "../config/prompts";
import { UIService } from "../services/UIService";

interface FishResult {
	success: boolean;
	harvestedAmount: number;
}

export interface FishingState {
	currentFishingAgent: string | null;
	fishingQueue: string[];
	harvestAmounts: Map<string, number>;
	isFishing: boolean;
	harvestingCompleted: boolean;
}

/**
 * This is a simple implementation of a fishing behavior for Agents.
 * It uses the Lake class to simulate a realistic fishing environment
 * with capacity, regeneration, and potential collapse.
 * 
 * Only one agent can fish at a time, and agents will stop fishing once
 * they've reached their planned harvest amount.
 */
export class FishingBehavior implements AgentBehavior {
	private readonly PIER_LOCATION = new Vector3(LOCATIONS.pier.x, LOCATIONS.pier.y, LOCATIONS.pier.z);
	private readonly FISHING_RANGE = SIMULATION_CONFIG.FISH_RANGE;
	private lakeManager: Lake;
	private isFishing: boolean = false;
	
	// Static Maps to track shared state across all instances
	private static lastThoughtUpdateTimes: Map<string, number> = new Map();
	private static sharedFishingState: {
		currentFishingAgent: string | null;
		fishingQueue: string[];
		lastFishingEndTime: number;
	} = {
		currentFishingAgent: null,
		fishingQueue: [],
		lastFishingEndTime: 0
	};
	private static hasResetState: boolean = false; // Add flag to track if we've reset state
	private readonly THOUGHT_UPDATE_INTERVAL = TIME_CONFIG.TICKS_PER_SECOND * 10; // Update every 10 seconds
	private readonly MIN_FISHING_DELAY = TIME_CONFIG.TICKS_PER_SECOND * 1; // 1 second minimum delay between fishing attempts

	constructor(lake: Lake) {
		this.lakeManager = lake;
	}

	private getOrInitializeFishingState(agent: BaseAgent): FishingState {
		const memory = agent.getScratchMemory();
		return memory.getFishingMemory();
	}

	private updateFishingState(agent: BaseAgent, world: GameWorld, newState: Partial<FishingState>) {
		const memory = agent.getScratchMemory();
		memory.updateFishingMemory(newState);
		return memory.getFishingMemory();
	}

	private syncSharedState(world: GameWorld, updates: Partial<typeof FishingBehavior.sharedFishingState>) {
		FishingBehavior.sharedFishingState = {
			...FishingBehavior.sharedFishingState,
			...updates
		};
		// console.log(`[FISHING] Shared State Update - Current: ${FishingBehavior.sharedFishingState.currentFishingAgent}, Queue: [${FishingBehavior.sharedFishingState.fishingQueue.join(', ')}]`);
	}

	onUpdate(agent: BaseAgent, world: GameWorld): void {
		const currentState = this.getOrInitializeFishingState(agent);

		// Reset state only once when transitioning from harvesting to discussion
		if (agent.currentAgentPhase !== 'HARVESTING' && agent.lastAgentPhase === 'HARVESTING' && !FishingBehavior.hasResetState) {
			this.syncSharedState(world, {
				currentFishingAgent: null,
				fishingQueue: [],
				lastFishingEndTime: world.currentTick
			});
			this.updateFishingState(agent, world, {
				currentFishingAgent: null,
				fishingQueue: [],
				harvestAmounts: new Map(),
				isFishing: false,
				harvestingCompleted: false
			});
			FishingBehavior.hasResetState = true; // Set flag to indicate we've reset
			return;
		}

		// Reset the flag when entering harvesting phase
		if (agent.currentAgentPhase === 'HARVESTING') {
			FishingBehavior.hasResetState = false;
		}

		// If in HARVESTING phase, manage fishing queue and update thoughts
		if (agent.currentAgentPhase === 'HARVESTING') {
			const timeSinceLastFishing = world.currentTick - FishingBehavior.sharedFishingState.lastFishingEndTime;
			
			// Queue management
			if (!FishingBehavior.sharedFishingState.currentFishingAgent && 
				FishingBehavior.sharedFishingState.fishingQueue.length > 0 && 
				timeSinceLastFishing >= this.MIN_FISHING_DELAY) {
				
				const nextAgent = FishingBehavior.sharedFishingState.fishingQueue[0];
				const updatedQueue = FishingBehavior.sharedFishingState.fishingQueue.slice(1);
				
				console.log(`[FISHING] ${nextAgent}'s turn to fish. Queue: [${updatedQueue.join(', ')}]`);
				
				this.syncSharedState(world, {
					currentFishingAgent: nextAgent,
					fishingQueue: updatedQueue
				});
			}

			// If no one is fishing and we have a plan but haven't completed it, try to fish
			if (!FishingBehavior.sharedFishingState.currentFishingAgent && 
				!currentState.harvestingCompleted && 
				agent.plannedHarvestAmount && 
				timeSinceLastFishing >= this.MIN_FISHING_DELAY) {
				
				console.log(`[FISHING] ${agent.name} starting new fishing attempt`);
				
				// Set ourselves as the current fishing agent
				this.syncSharedState(world, {
					currentFishingAgent: agent.name
				});
				// Try to fish
				agent.handleToolCall("cast_rod", {});
			}

			// Periodic thought updates about waiting in queue
			if (!currentState.harvestingCompleted && 
				FishingBehavior.sharedFishingState.currentFishingAgent !== agent.name) {
				const lastUpdateTime = FishingBehavior.lastThoughtUpdateTimes.get(agent.name) || 0;
				if (world.currentTick - lastUpdateTime >= this.THOUGHT_UPDATE_INTERVAL) {
					const currentHarvest = this.getCurrentHarvestAmount(currentState, agent.name);
					let message;
					
					if (FishingBehavior.sharedFishingState.fishingQueue.includes(agent.name)) {
						const position = FishingBehavior.sharedFishingState.fishingQueue.indexOf(agent.name) + 1;
						message = `I am waiting in line to fish (position ${position}). I have caught ${currentHarvest} fish so far out of my planned ${agent.plannedHarvestAmount}.`;
					} else {
						message = `I am preparing to fish. I have caught ${currentHarvest} fish so far out of my planned ${agent.plannedHarvestAmount}.`;
					}
					
					if (message !== agent.getLastMonologue()) {
						agent.addInternalMonologue(message);
						
						// Update UI for all players
						const playerEntities = world.entityManager.getAllPlayerEntities();
						playerEntities.forEach(playerEntity => {
							if (playerEntity?.player) {
								UIService.sendAgentThoughts(playerEntity.player, world.agents);
							}
						});
						
						FishingBehavior.lastThoughtUpdateTimes.set(agent.name, world.currentTick);
					}
				}
			}
		}
	}

	private isNearPier(agent: BaseAgent): boolean {
		const distance = Vector3.fromVector3Like(agent.position).distance(
			this.PIER_LOCATION
		);
		return distance <= this.FISHING_RANGE;
	}

	private rollForFish(world: GameWorld, plannedAmount: number): FishResult {
		const harvestedAmount = this.lakeManager.harvest(plannedAmount, world.currentTick, world);
		return {
			success: harvestedAmount > 0,
			harvestedAmount: harvestedAmount
		};
	}

	private getCurrentHarvestAmount(state: FishingState, agentName: string): number {
		return state.harvestAmounts.get(agentName) || 0;
	}

	private addToHarvestAmount(agent: BaseAgent, world: GameWorld, amount: number): void {
		const state = this.getOrInitializeFishingState(agent);
		const current = this.getCurrentHarvestAmount(state, agent.name);
		const newHarvestAmounts = new Map(state.harvestAmounts);
		newHarvestAmounts.set(agent.name, current + amount);

		// Check if we've completed our planned harvest
		const newTotal = current + amount;
		const harvestingCompleted = newTotal >= (agent.plannedHarvestAmount || 0);

		this.updateFishingState(agent, world, {
			harvestAmounts: newHarvestAmounts,
			harvestingCompleted: harvestingCompleted
		});

		// Update thoughts after each catch
		const message = harvestingCompleted 
			? `I have successfully completed my harvest with ${newTotal} fish. I will wait for the discussion phase to begin.`
			: `I just caught ${amount} fish! I have caught ${newTotal} fish so far out of my planned ${agent.plannedHarvestAmount}.`;
		
		agent.addInternalMonologue(message);
		
		// Update UI for all players
		const playerEntities = world.entityManager.getAllPlayerEntities();
		playerEntities.forEach(playerEntity => {
			if (playerEntity?.player) {
				UIService.sendAgentThoughts(playerEntity.player, world.agents);
			}
		});
		
		// Initialize thought update time
		FishingBehavior.lastThoughtUpdateTimes.set(agent.name, world.currentTick);
	}

	onToolCall(
		agent: BaseAgent,
		world: GameWorld,
		toolName: string,
		args: any
	): string | void {
		if (toolName === "cast_rod") {
			console.log(`[FISHING] ${agent.name} attempting to cast rod`);

			const state = this.getOrInitializeFishingState(agent);

			// --- Phase and Turn Check ---
			if (agent.currentAgentPhase !== 'HARVESTING') {
				console.log(`[FISHING] ${agent.name} tried to fish during ${agent.currentAgentPhase} phase.`);
				return `You can only fish during the HARVESTING phase. It is currently ${agent.currentAgentPhase}.`;
			}

			// --- Check if agent has a plan ---
			const planAmount = agent.plannedHarvestAmount;
			if (planAmount === null || planAmount <= 0) {
				return "You haven't planned how much to fish this cycle, or your plan was to fish zero. Use plan_harvest in the PLANNING phase.";
			}

			// Check if agent has already reached their planned amount
			const currentHarvest = this.getCurrentHarvestAmount(state, agent.name);
			if (currentHarvest >= planAmount) {
				return `You've already harvested your planned amount of ${planAmount} fish.`;
			}

			// Check if it's this agent's turn
			if (FishingBehavior.sharedFishingState.currentFishingAgent !== agent.name) {
				// Add to queue if not already in it
				if (!FishingBehavior.sharedFishingState.fishingQueue.includes(agent.name) && 
					FishingBehavior.sharedFishingState.currentFishingAgent !== agent.name) {
					
					const updatedQueue = [...FishingBehavior.sharedFishingState.fishingQueue, agent.name];
					console.log(`[FISHING] ${agent.name} added to queue. Current queue: [${updatedQueue.join(', ')}]`);
					
					this.syncSharedState(world, {
						fishingQueue: updatedQueue
					});
				}
				return `Please wait your turn to fish. ${FishingBehavior.sharedFishingState.currentFishingAgent ? 
					`${FishingBehavior.sharedFishingState.currentFishingAgent} is currently fishing.` : 
					'You are in the queue.'}`;
			}

			// Log the attempt
			logEvent({
				type: "agent_action_attempt",
				agentId: agent.id,
				agentName: agent.name,
				action: "cast_rod",
				nearPier: this.isNearPier(agent),
				alreadyFishing: this.isFishing
			});

			if (!this.isNearPier(agent)) {
				return "You need to be closer to the pier to fish!";
			}

			if (this.isFishing) {
				return "You're already fishing!";
			}

			// Add thought when starting to fish
			const remainingToHarvest = planAmount - currentHarvest;
			const message = `It's my turn to fish! I will try to catch ${remainingToHarvest} fish to reach my goal of ${planAmount}.`;
			agent.addInternalMonologue(message);
			
			// Update UI for all players
			const playerEntities = world.entityManager.getAllPlayerEntities();
			playerEntities.forEach(playerEntity => {
				if (playerEntity?.player) {
					UIService.sendAgentThoughts(playerEntity.player, world.agents);
				}
			});

			this.isFishing = true;
			this.updateFishingState(agent, world, { isFishing: true });

			// Start fishing animation if available
			agent.stopModelAnimations(["walk_upper", "walk_lower", "run_upper", "run_lower"]);
			agent.startModelLoopedAnimations(["idle_upper", "idle_lower"]); // Could be replaced with a fishing animation

			// Calculate remaining amount to fish
			const remainingAmount = planAmount - currentHarvest;

			console.log(`[FISHING] ${agent.name} started fishing for ${remainingAmount} fish`);

			// Simulate fishing time
			setTimeout(() => {
				this.isFishing = false;
				this.updateFishingState(agent, world, { isFishing: false });
				
				const result = this.rollForFish(world, remainingAmount);

				if (result.success) {
					console.log(`[FISHING] ${agent.name} caught ${result.harvestedAmount} fish`);
					
					// Record the successful harvest for metrics
					world.metricsTracker.recordAgentHarvest(agent.name, result.harvestedAmount);

					// Update harvest amount tracking
					this.addToHarvestAmount(agent, world, result.harvestedAmount);

					agent.addToInventory({
						name: "fish",
						quantity: result.harvestedAmount,
						metadata: {},
					});

					// --- FIX: Update UI after inventory is updated ---
					const playerEntities = world.entityManager.getAllPlayerEntities();
					playerEntities.forEach(playerEntity => {
						if (playerEntity?.player) {
							UIService.sendAgentThoughts(playerEntity.player, world.agents);
						}
					});
					// --- END FIX ---

					// Check if agent has reached their planned amount
					const newTotal = this.getCurrentHarvestAmount(state, agent.name);
					if (newTotal >= planAmount) {
						agent.plannedHarvestAmount = null; // Reset plan since it's completed
						console.log(`[FISHING] ${agent.name} completed their planned harvest of ${planAmount}`);
					}
				} else {
					console.log(`[FISHING] ${agent.name}'s fishing attempt was unsuccessful`);
				}

				// Check for lake collapse after the harvest is complete
				if (world.lake) {
					world.lake.checkCollapse(world.currentTick);
				}

				// Update shared state to allow next agent to fish
				this.syncSharedState(world, {
					currentFishingAgent: null,
					lastFishingEndTime: world.currentTick
				});

			}, 5000); // 5 second fishing time

			return `Casting your line to try and catch ${remainingAmount} fish...`;
		} else if (toolName === "give_fish") {
			const { target } = args;
			const fishDescription = "fish";

			if (!agent.removeFromInventory({name: fishDescription, quantity: 1})) {
				return "You don't have that fish anymore!";
			}

			const nearbyEntities = agent.getNearbyEntities(SIMULATION_CONFIG.CHAT_RANGE);
			const targetEntity = nearbyEntities.find((e) => e.name === target);

			if (!targetEntity) {
				return `Cannot find ${target} nearby. Try getting closer to them.`;
			}

			// Add to target's inventory if it's an agent
			if (targetEntity.type === "Agent") {
				const targetAgent = world.entityManager
					.getAllEntities()
					.find(
						(e) => e instanceof BaseAgent && e.name === target
					) as BaseAgent;

				if (targetAgent) {
					targetAgent.addToInventory({
						name: fishDescription,
						quantity: 1,
						metadata: {},
					});
				}
			}

			return `Successfully gave ${fishDescription} to ${target}`;
		}
	}

	getPromptInstructions(): string {
		return buildFishingPrompt(this.FISHING_RANGE);
	}

	getState(): string {
		return this.isFishing ? "Currently fishing" : "Not fishing";
	}
}

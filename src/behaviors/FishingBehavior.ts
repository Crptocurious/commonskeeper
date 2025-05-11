import { Vector3} from "hytopia";
import { BaseAgent, type AgentBehavior } from "../BaseAgent";
import { Lake } from "../Lake";
import { logEvent } from "../logger";
import { LOCATIONS, SIMULATION_CONFIG, TIME_CONFIG, DERIVED_TIME_CONFIG } from "../config/constants";
import type { GameWorld } from "../types/GameState";
import { buildFishingPrompt } from "../config/prompts";
import { UIService } from "../services/UIService";

interface FishResult {
	success: boolean;
	harvestedAmount: number;
}

export interface FishingState {
	harvestAmounts: Map<string, number>;  // Current cycle harvest amounts
	lastHarvestAmounts: Map<string, number>;  // Previous cycle harvest amounts
	totalHarvestAmounts: Map<string, number>;  // Total harvest amounts across all cycles
	isFishing: boolean;
	harvestingCompleted: boolean;
}

/**
 * This is a simple implementation of a fishing behavior for Agents.
 * It uses the Lake class to simulate a realistic fishing environment
 * with capacity, regeneration, and potential collapse.
 * 
 * Agents fish in a fixed, randomized sequence that rotates through all agents.
 * This creates patterns like ABC, BCA, CAB and so on.
 */
export class FishingBehavior implements AgentBehavior {
	private readonly PIER_LOCATION = new Vector3(LOCATIONS.pier.x, LOCATIONS.pier.y, LOCATIONS.pier.z);
	private readonly FISHING_RANGE = SIMULATION_CONFIG.FISH_RANGE;
	private lakeManager: Lake;
	private static isFishing: boolean = false;  // Make this static to track across all instances
	
	// Static state to track fishing sequence and current agent
	private static baseSequence: string[] = [];  // Store the original sequence
	private static currentFishingIndex: number = 0;
	private static lastFishingEndTime: number = 0;
	private static hasInitializedSequence: boolean = false;
	private static lastThoughtUpdateTimes: Map<string, number> = new Map();

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

	public getCurrentCycleSequence(world: GameWorld | undefined): string[] {
		// Try to initialize if not initialized yet
		if (!FishingBehavior.hasInitializedSequence && world) {
			this.initializeFishingSequence(world);
		}

		// If sequence not initialized, no agents, or no world object, return empty array
		if (!FishingBehavior.hasInitializedSequence || 
			FishingBehavior.baseSequence.length === 0 ||
			!world) {
			return [];
		}

		// Calculate the sequence for the current cycle
		return FishingBehavior.baseSequence.map((_, i) => {
			const currentCycle = typeof world.currentCycle === 'number' ? world.currentCycle : 0;
			const effectiveIndex = (i + currentCycle) % FishingBehavior.baseSequence.length;
			const agent = FishingBehavior.baseSequence[effectiveIndex];
			if (!agent) {
				return ''; // Return empty string instead of throwing error for undefined agent
			}
			return agent;
		}).filter(agent => agent !== ''); // Filter out any empty strings
	}

	private initializeFishingSequence(world: GameWorld) {
		if (!FishingBehavior.hasInitializedSequence && world.agents && world.agents.length > 0) {
			// Get all agents and ensure they have names
			const agents = world.agents
				.map(agent => agent.name)
				.filter((name): name is string => name !== undefined);

			if (agents.length === 0) {
				console.warn('[FISHING] No agents found to initialize fishing sequence');
				return;
			}

			// Create a copy of the array to shuffle
			const shuffledAgents = [...agents];
			
			// Shuffle the array using Fisher-Yates algorithm
			for (let i = shuffledAgents.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				const temp = shuffledAgents[i] as string;
				shuffledAgents[i] = shuffledAgents[j] as string;
				shuffledAgents[j] = temp;
			}
			
			FishingBehavior.baseSequence = shuffledAgents;
			FishingBehavior.currentFishingIndex = 0;
			FishingBehavior.hasInitializedSequence = true;
			console.log(`[FISHING] Initialized base sequence: [${FishingBehavior.baseSequence.join(', ')}]`);
			console.log(`[FISHING] Cycle 0 sequence will be: [${this.getCurrentCycleSequence(world).join(', ')}]`);
		}
	}

	public getCurrentFishingAgent(world: GameWorld | undefined): string | null {
		if (!world || FishingBehavior.baseSequence.length === 0) return null;
		
		// Calculate effective index based on current fishing index and cycle rotation
		const currentCycle = typeof world.currentCycle === 'number' ? world.currentCycle : 0;
		const effectiveIndex = (FishingBehavior.currentFishingIndex + currentCycle) % FishingBehavior.baseSequence.length;
		return FishingBehavior.baseSequence[effectiveIndex] || null;
	}

	private moveToNextAgent(world: GameWorld) {
		// Just increment the index, the getCurrentFishingAgent will handle the rotation
		FishingBehavior.currentFishingIndex = (FishingBehavior.currentFishingIndex + 1) % FishingBehavior.baseSequence.length;
		console.log(`[FISHING] Moving to next agent. Current position: ${FishingBehavior.currentFishingIndex}, Current agent: ${this.getCurrentFishingAgent(world)}`);
	}

	private checkAllAgentsCompletedHarvesting(world: GameWorld): boolean {
		return world.agents.every(agent => {
			const state = this.getOrInitializeFishingState(agent);
			return state.harvestingCompleted;
		});
	}

	private resetPerCycleFishingState(agent: BaseAgent, world: GameWorld) {
		const memory = agent.getScratchMemory();
		const fishingMemory = memory.getFishingMemory();
		
		// Move current harvest amounts to last harvest amounts
		const newLastHarvestAmounts = new Map(fishingMemory.harvestAmounts);
		
		// Log the state transition
		console.log(`[FISHING] ${agent.name} cycle reset:`, {
			cycle: world.currentCycle,
			previousHarvest: Object.fromEntries(fishingMemory.harvestAmounts),
			movingToLastHarvest: Object.fromEntries(newLastHarvestAmounts)
		});

		this.updateFishingState(agent, world, {
			...fishingMemory,
			lastHarvestAmounts: newLastHarvestAmounts,
			harvestAmounts: new Map(), // Reset current harvest amounts
			harvestingCompleted: false  // Reset completion status
		});
	}

	onUpdate(agent: BaseAgent, world: GameWorld): void {
		const currentState = this.getOrInitializeFishingState(agent);

		// Initialize fishing sequence only if it hasn't been initialized yet
		if (!FishingBehavior.hasInitializedSequence) {
			this.initializeFishingSequence(world);
			this.updateFishingState(agent, world, {
				harvestAmounts: new Map(),
				lastHarvestAmounts: new Map(),
				totalHarvestAmounts: new Map(),
				isFishing: false,
				harvestingCompleted: false
			});
			return;
		}

		// Reset states at the start of each cycle
		if (world.currentTick === 0) {
			FishingBehavior.currentFishingIndex = 0;  // Reset to start of sequence
			// Only reset completion status for all agents
			world.agents.forEach(agent => {
				this.resetPerCycleFishingState(agent, world);
			});
			const nextCycleSequence = this.getCurrentCycleSequence(world);
			console.log(`[FISHING] Starting cycle ${world.currentCycle}:`, {
				baseSequence: FishingBehavior.baseSequence,
				nextCycleSequence,
				firstFisher: this.getCurrentFishingAgent(world)
			});
		}

		// If in HARVESTING phase, manage fishing and update thoughts
		if (agent.currentAgentPhase === 'HARVESTING') {
			const timeSinceLastFishing = world.currentTick - FishingBehavior.lastFishingEndTime;
			
			// If it's this agent's turn and they haven't completed harvesting, try to fish
			if (this.getCurrentFishingAgent(world) === agent.name && 
				!currentState.harvestingCompleted && 
				agent.plannedHarvestAmount && 
				timeSinceLastFishing >= this.MIN_FISHING_DELAY &&
				!FishingBehavior.isFishing) {  // Add check for global fishing state
				
				// Only log when actually attempting to fish
				const currentHarvest = this.getCurrentHarvestAmount(currentState, agent.name);
				const totalHarvest = this.getTotalHarvestAmount(currentState, agent.name);
				console.log(`[FISHING] ${agent.name} attempting to fish in cycle ${world.currentCycle}:`, {
					currentHarvest,
					totalHarvest,
					plannedAmount: agent.plannedHarvestAmount,
					sequence: this.getCurrentCycleSequence(world)
				});
				
				agent.handleToolCall("cast_rod", {});
			}

			// Periodic thought updates about waiting
			if (!currentState.harvestingCompleted && 
				this.getCurrentFishingAgent(world) !== agent.name) {
				const lastUpdateTime = FishingBehavior.lastThoughtUpdateTimes.get(agent.name) || 0;
				if (world.currentTick - lastUpdateTime >= this.THOUGHT_UPDATE_INTERVAL) {
					const currentHarvest = this.getCurrentHarvestAmount(currentState, agent.name);
					const totalHarvest = this.getTotalHarvestAmount(currentState, agent.name);
					const currentPosition = FishingBehavior.baseSequence.indexOf(agent.name);
					const turnsUntilMyTurn = (currentPosition - FishingBehavior.currentFishingIndex + FishingBehavior.baseSequence.length) % FishingBehavior.baseSequence.length;
					
					const message = `I am in position ${currentPosition + 1} of the permanent fishing sequence. ${turnsUntilMyTurn} agents before my turn. I have caught ${totalHarvest} fish in total across all cycles. For this cycle, I still need ${(agent.plannedHarvestAmount || 0) - currentHarvest} more fish to reach my goal.`;
					
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

	private getTotalHarvestAmount(state: FishingState, agentName: string): number {
		return state.totalHarvestAmounts.get(agentName) || 0;
	}

	private addToHarvestAmount(agent: BaseAgent, world: GameWorld, amount: number): void {
		const state = this.getOrInitializeFishingState(agent);
		
		// Update per-cycle harvest amount
		const current = this.getCurrentHarvestAmount(state, agent.name);
		const newHarvestAmounts = new Map(state.harvestAmounts);
		newHarvestAmounts.set(agent.name, current + amount);

		// Update total harvest amount across all cycles
		const currentTotal = this.getTotalHarvestAmount(state, agent.name);
		const newTotalHarvestAmounts = new Map(state.totalHarvestAmounts);
		newTotalHarvestAmounts.set(agent.name, currentTotal + amount);

		// Check if we've completed our planned harvest for this cycle
		const newCycleTotal = current + amount;
		const harvestingCompleted = newCycleTotal >= (agent.plannedHarvestAmount || 0);

		this.updateFishingState(agent, world, {
			harvestAmounts: newHarvestAmounts,
			totalHarvestAmounts: newTotalHarvestAmounts,
			harvestingCompleted: harvestingCompleted
		});

		// Update thoughts after each catch - use total amount for display
		const message = harvestingCompleted 
			? `I have successfully completed my harvest for this cycle. I have caught ${currentTotal + amount} fish in total across all cycles.`
			: `I just caught ${amount} fish! I have caught ${currentTotal + amount} fish in total across all cycles. For this cycle, I still need ${(agent.plannedHarvestAmount || 0) - newCycleTotal} more fish to reach my goal.`;
		
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

		console.log(`[FISHING] ${agent.name} harvest update:`, {
			cycle: world.currentCycle,
			cycleAmount: newCycleTotal,
			totalAmount: currentTotal + amount,
			plannedAmount: agent.plannedHarvestAmount,
			completed: harvestingCompleted
		});
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

			// --- Phase Check ---
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
				const message = `You've already harvested your planned amount of ${planAmount} fish for this cycle (Current: ${currentHarvest}).`;
				console.log(`[FISHING] ${agent.name} ${message}`);
				return message;
			}

			// Check if it's this agent's turn
			if (this.getCurrentFishingAgent(world) !== agent.name) {
				const position = FishingBehavior.baseSequence.indexOf(agent.name);
				const turnsUntilMyTurn = (position - FishingBehavior.currentFishingIndex + FishingBehavior.baseSequence.length) % FishingBehavior.baseSequence.length;
				return `Please wait your turn to fish. You are in position ${position + 1}. ${turnsUntilMyTurn} agents before your turn.`;
			}

			if (!this.isNearPier(agent)) {
				return "You need to be closer to the pier to fish!";
			}

			// Check if anyone is currently fishing
			if (FishingBehavior.isFishing) {
				return "Someone is already fishing! Please wait for them to finish.";
			}

			// Start fishing
			FishingBehavior.isFishing = true;
			this.updateFishingState(agent, world, { isFishing: true });

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

			// Start fishing animation if available
			agent.stopModelAnimations(["walk_upper", "walk_lower", "run_upper", "run_lower"]);
			agent.startModelLoopedAnimations(["idle_upper", "idle_lower"]); // Could be replaced with a fishing animation

			// Calculate remaining amount to fish
			const remainingAmount = planAmount - currentHarvest;

			console.log(`[FISHING] ${agent.name} started fishing for ${remainingAmount} fish`);

			// Simulate fishing time
			setTimeout(() => {
				FishingBehavior.isFishing = false;
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

					// Update UI after inventory is updated
					const playerEntities = world.entityManager.getAllPlayerEntities();
					playerEntities.forEach(playerEntity => {
						if (playerEntity?.player) {
							UIService.sendAgentThoughts(playerEntity.player, world.agents);
						}
					});

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

				// Move to next agent in sequence
				this.moveToNextAgent(world);
				FishingBehavior.lastFishingEndTime = world.currentTick;

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
		return FishingBehavior.isFishing ? "Currently fishing" : "Not fishing";
	}

	handleFishingComplete(agent: BaseAgent, world: GameWorld, amount: number) {
		const state = this.getOrInitializeFishingState(agent);
		
		// Update harvest amounts
		const currentHarvest = this.getCurrentHarvestAmount(state, agent.name);
		const totalHarvest = this.getTotalHarvestAmount(state, agent.name);
		
		// Update the harvest amounts
		state.harvestAmounts.set(agent.name, currentHarvest + amount);
		state.totalHarvestAmounts.set(agent.name, totalHarvest + amount);
		
		// Check if harvesting is completed for this cycle
		if (this.getCurrentHarvestAmount(state, agent.name) >= (agent.plannedHarvestAmount || 0)) {
			state.harvestingCompleted = true;
		}
		
		// Update fishing state
		state.isFishing = false;
		FishingBehavior.isFishing = false;
		
		// Log the harvest update
		console.log(`[FISHING] ${agent.name} harvest update:`, {
			cycle: world.currentCycle,
			cycleAmount: this.getCurrentHarvestAmount(state, agent.name),
			totalAmount: this.getTotalHarvestAmount(state, agent.name),
			plannedAmount: agent.plannedHarvestAmount,
			completed: state.harvestingCompleted
		});
		
		// Move to next agent in sequence
		this.moveToNextAgent(world);
		FishingBehavior.lastFishingEndTime = world.currentTick;
	}
}

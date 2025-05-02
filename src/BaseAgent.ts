/**
 * BaseAgent.ts
 */
import {
	Entity,
	EntityEvent,
	Player,
	Vector3,
	World,
	SimpleEntityController,
	RigidBodyType,
	SceneUI,
	PlayerEntity,
} from "hytopia";

import { logEvent } from "./logger";
import { EnergyManager, type EnergyState } from "./EnergyManager";
import { Plan } from "./brain/cognitive/Plan";
import { Perceive } from "./brain/cognitive/Perceive";
import { ScratchMemory } from "./brain/memory/ScratchMemory";
import type { Lake } from "./Lake";
import { CognitiveCycle } from "./brain/cognitive/CognitiveCycle";

// --- Added GameContext Interface ---
// Define a context interface to pass necessary game state to agent updates
export interface AgentUpdateContext {
	currentTick: number;
	currentPhase: 'HARVEST' | 'TOWNHALL';
	lake: Lake; // Pass lake instance for behaviors that need it directly
	lastHarvestReports?: { [agentName: string]: number }; // Pass reports
	broadcastPublicMessage: (sender: BaseAgent, message: string) => void; // Function for townhall chat
}
// --- End Added GameContext Interface ---

/**
 * This is the interface that all behaviors must implement.
 * See each of the behaviors for examples of how to implement this.
 */
export interface AgentBehavior {
	onUpdate(agent: BaseAgent, world: World): void;
	onToolCall(
		agent: BaseAgent,
		world: World,
		toolName: string,
		args: any,
		player?: Player
	): string | void;
	getPromptInstructions(): string;
	getState(): string;
}

interface NearbyEntity {
	name: string;
	type: string;
	distance: number;
	position: Vector3;
}

export interface InventoryItem {
	name: string;
	quantity: number;
	metadata?: Record<string, any>; // For things like fish weight, mineral value, etc.. whatever you want.
}

// Define ChatOptions type matching the one in Plan.ts
type MessageType = "Player" | "Environment" | "Agent";
interface ChatOptions {
	type: MessageType;
	message: string;
	player?: Player;
	agent?: BaseAgent;
}

export class BaseAgent extends Entity {
	private behaviors: AgentBehavior[] = [];
	private internalMonologue: string[] = [];
	private lastActionTick: number = 0;
	private lastReflectionTick: number = 0; // Added: Track last reflection time
	private currentTick: number = 0;
	private chatUI: SceneUI;
	private inventory: Map<string, InventoryItem> = new Map();
	public energyManager: EnergyManager;
	private plan: Plan;
	private perceive: Perceive;
	private scratchMemory: ScratchMemory;
	private cognitiveCycle: CognitiveCycle;

	public isDead: boolean = false; // Added property to track death state
	public currentPhase: 'HARVEST' | 'TOWNHALL' = 'TOWNHALL'; // Added: Store current phase
	public canAttemptFishThisTick: boolean = false; // Added: Turn-based fishing flag
	private lastHarvestReports: { [agentName: string]: number } = {}; // Added: Store last reports
	private broadcastPublicMessage?: (sender: BaseAgent, message: string) => void; // Added: Store broadcast function

	constructor(options: { name?: string; systemPrompt: string }) {
		super({
			name: options.name || "BaseAgent",
			modelUri: "models/players/player.gltf",
			modelLoopedAnimations: ["idle_upper", "idle_lower"],
			modelScale: 0.5,
			controller: new SimpleEntityController(),
			rigidBodyOptions: {
				type: RigidBodyType.DYNAMIC,
				enabledRotations: { x: false, y: true, z: false },
			},
		});

		this.energyManager = new EnergyManager();
		this.scratchMemory = new ScratchMemory(this.name);
		this.perceive = new Perceive(this.name);
		this.plan = new Plan(options.systemPrompt);
		this.cognitiveCycle = new CognitiveCycle();
		
		this.chatUI = new SceneUI({
			templateId: "agent-chat",
			attachedToEntity: this,
			offset: { x: 0, y: 1, z: 0 },
			state: {
				message: "",
				agentName: options.name || "BaseAgent",
			},
		});
	}

	// Renamed and updated signature to accept context
	public update(context: AgentUpdateContext): void {
		if (!this.isSpawned || !this.world) return;

		// Store context info
		this.currentPhase = context.currentPhase;
		this.lastHarvestReports = context.lastHarvestReports || {}; // Store reports
		this.broadcastPublicMessage = context.broadcastPublicMessage; // Store broadcast function
		this.currentTick = context.currentTick; // Store current tick

		const previousEnergyState = this.energyManager.getState();
		this.energyManager.decayTick();
		const currentEnergyState = this.energyManager.getState();

		// Update perception and memory
		const nearbyEntities = this.getNearbyEntities();
		
		// Perceive nearby agents
		const agentObservations = nearbyEntities
			.filter(e => e.type === "Agent")
			.map(e => {
				const entity = this.world!.entityManager.getAllEntities().find(entity => entity.name === e.name);
				if (entity instanceof BaseAgent) {
					return {
						agentId: e.name,
						energyManager: entity.energyManager
					};
				}
				return null;
			})
			.filter((obs): obs is { agentId: string; energyManager: EnergyManager } => obs !== null);

		this.perceive.perceiveAgentEnergies(agentObservations);

		// Perceive lake if it exists in the world
		if (context.lake) {
			this.perceive.perceiveLake(context.lake);
		}

		// Log energy decay event here, with agent context
		if (currentEnergyState.currentEnergy !== previousEnergyState.currentEnergy) {
			logEvent({
				type: "agent_energy_decay",
				agentId: this.id,
				agentName: this.name,
				energy: currentEnergyState.currentEnergy,
				decayAmount: previousEnergyState.currentEnergy - currentEnergyState.currentEnergy
			});
		}

		// Existing behavior updates
		this.behaviors.forEach((b) => b.onUpdate(this, this.world!));

		// --- Add LLM Tick Trigger Logic ---
		// Decide if the agent should think/plan based on phase, energy, etc.
		const lastPhaseMemory = this.scratchMemory.getRecentMemories({ types: ['phase_change'], maxCount: 1 })[0];
		const lastKnownPhase = lastPhaseMemory ? lastPhaseMemory.content : null;
		const ticksSinceLastAction = context.currentTick - this.lastActionTick;
		const isInactive = ticksSinceLastAction >= (60 * 5);
		const phaseChanged = this.currentPhase !== lastKnownPhase;
		
		if (isInactive || phaseChanged) {
			// Store the new phase in memory if it changed
			if (phaseChanged) {
				this.scratchMemory.addMemory({ type: 'phase_change', content: this.currentPhase, timestamp: Date.now() });
			}

			// Construct message based on triggers
			let message = "";
			if (isInactive) {
				message += `You have been inactive for ${ticksSinceLastAction} ticks. `;
			}
			if (phaseChanged) {
				message += `The phase has changed to ${this.currentPhase}. `;
			}
			message += `Current Tick: ${context.currentTick}. Phase: ${this.currentPhase}. Check your state and decide on actions.`;

			console.log(`Agent ${this.name}: Triggering LLM reasoning. Tick: ${context.currentTick}, Phase: ${this.currentPhase}`);
			this.handleEnvironmentTrigger(message);
			this.lastActionTick = context.currentTick; // Reset last action tick
		}
		// --- End LLM Tick Trigger Logic ---

		// Check depletion status from manager
		if (currentEnergyState.isDepleted) {
			// Placeholder for potential death/starvation logic
			// console.log(`${this.name} has run out of energy!`);
		}
	}

	public addBehavior(behavior: AgentBehavior) {
		this.behaviors.push(behavior);
	}

	public getBehaviors(): AgentBehavior[] {
		return this.behaviors;
	}

	public getNearbyEntities(radius: number = 10): NearbyEntity[] {
		if (!this.world) return [];
		return this.world.entityManager
			.getAllEntities()
			.filter((entity) => entity !== this)
			.map((entity) => {
				const distance = Vector3.fromVector3Like(
					this.position
				).distance(Vector3.fromVector3Like(entity.position));
				if (distance <= radius) {
					return {
						name:
							entity instanceof PlayerEntity
								? entity.player.username
								: entity.name,
						type:
							entity instanceof PlayerEntity
								? "Player"
								: entity instanceof BaseAgent
								? "Agent"
								: "Entity",
						distance,
						position: entity.position,
					};
				}
				return null;
			})
			.filter((e): e is NearbyEntity => e !== null)
			.sort((a, b) => a.distance - b.distance);
	}

	public getCurrentState(): Record<string, any> {
		const state: Record<string, any> = {};
		this.behaviors.forEach((behavior) => {
			if (behavior.getState) {
				state[behavior.constructor.name] = behavior.getState();
			}
		});

		// Get energy state from manager
		const energyState = this.energyManager.getState();
		state.energy = energyState.currentEnergy;
		state.maxEnergy = energyState.maxEnergy;
		state.inventory = Array.from(this.inventory.values()); // Keep inventory logic here

		// Add time and phase information directly from the agent's stored state
		if (this.world) {
			const gameWorld = this.world as any; // Cast to access config properties
			if (gameWorld.currentTimeTicks !== undefined) { // Use world's time for consistency in state
				state.currentTimeTicks = gameWorld.currentTimeTicks;
				state.ticksPerHour = gameWorld.ticksPerHour;
				state.ticksPerDay = gameWorld.ticksPerDay;
			}
		}
		state.currentPhase = this.currentPhase; // Add current phase to state
		state.lastHarvestReports = this.lastHarvestReports; // Add last harvest reports
		
		// Add lake stock information directly from scratch memory
		const lakeState = this.scratchMemory.getLakeState();
		if (lakeState) {
			state.lakeStock = lakeState.stock;
		}

		return state;
	}

	/**
	 * Handle tool calls, passing context to behaviors.
	 */
	public handleToolCall(toolName: string, args: any, player?: Player) {
		if (!this.world) return;
		let results: string[] = [];
		console.log(`Agent ${this.name} handling tool call:`, toolName, args);
		this.lastActionTick = this.currentTick; // Reset last action tick using stored tick value

		// --- Phase/Tool Specific Logic --- 
		if (toolName === 'townhall_speak' && this.currentPhase === 'TOWNHALL') {
			if (this.broadcastPublicMessage && args.message) {
				console.log(`Agent ${this.name} broadcasting public message: ${args.message}`);
				this.broadcastPublicMessage(this, args.message);
				results.push(`${toolName}: Message broadcasted publicly.`);
			} else {
				results.push(`${toolName}: Could not broadcast message (function missing or message empty).`);
			}
		} else if (toolName === 'speak') {
			// Normal speak is handled by SpeakBehavior, potentially for nearby chat
			// Let SpeakBehavior handle it, it might implement range checks later
			let handledByBehavior = false;
			this.behaviors.forEach((b) => {
				if (b.constructor.name === 'SpeakBehavior' && b.onToolCall) {
					const result = b.onToolCall(this, this.world!, toolName, args, player);
					if (result) results.push(`${toolName}: ${result}`);
					handledByBehavior = true;
				}
			});
			if (!handledByBehavior) {
				results.push(`${toolName}: SpeakBehavior not found or did not handle the call.`);
			}
		} else {
			// Default: Pass to all behaviors (includes FishingBehavior, etc.)
			this.behaviors.forEach((b) => {
				if (b.onToolCall) {
					const result = b.onToolCall(
						this,
						this.world!,
						toolName,
						args,
						player
					);
					if (result) results.push(`${b.constructor.name}.${toolName}: ${result}`); // Add behavior name for clarity
				}
			});
		}
		// --- End Phase/Tool Specific Logic ---

		return results.join("\n");
	}

	public spawn(world: World, position: Vector3) {
		super.spawn(world, position);
		this.chatUI.load(world);
	}

	public handleEnvironmentTrigger(message: string) {
		console.log(
			"Environment trigger for agent " + this.name + ":",
			message
		);
		// Use the cognitive cycle instead of directly calling plan
		this.cognitiveCycle.executeCycle(this, this.plan, message);
	}

	/**
	 * New method to handle chat messages originating from external sources (Players or other Agents).
	 * This forwards the message to the agent's Plan module.
	 */
	public handleExternalChat(options: ChatOptions): void {
		// Basic check to ensure it's not an Environment message passed incorrectly
		if (options.type === "Environment") {
			console.warn(`Agent ${this.name} received an Environment message via handleExternalChat. Use handleEnvironmentTrigger instead.`);
			// Optionally, still process it or just return
			// this.plan.chat(this, options);
			return;
		}
		
		// Log the reception for debugging
		console.log(`Agent ${this.name} received external chat: Type=${options.type}, From=${options.player?.username || options.agent?.name || 'Unknown'}`);
		
		// Store in scratch memory
		this.scratchMemory.addMemory({ 
			type: "message", 
			content: { 
				source: options.player?.username || options.agent?.name || 'Unknown', 
				message: options.message 
			}, 
			timestamp: Date.now() 
		});

		// Forward to the Plan module
		this.plan.chat(this, options);
	}

	/**
	 * New method to handle public chat messages specifically during Townhall.
	 * Stores the message in memory.
	 */
	public handlePublicChat(senderName: string, message: string): void {
		console.log(`Agent ${this.name} received public chat from ${senderName}: ${message}`);
		// Store in scratch memory, maybe with a specific tag
		this.scratchMemory.addMemory({ 
			type: "public_message", 
			content: { 
				source: senderName, 
				message: message 
			}, 
			timestamp: Date.now() 
		});

		// Optional: Trigger a reaction or update internal state based on the message
		// this.plan.chat(this, { type: "Agent", message: `Received public message from ${senderName}: ${message}`, agent: undefined }); // Example: Make agent react
	}

	// Clean up interval when agent is destroyed
	public despawn(): void {
		super.despawn();
	}

	// Add method to get last monologue
	public getLastMonologue(): string | undefined {
		return this.internalMonologue[this.internalMonologue.length - 1];
	}

	public setChatUIState(state: Record<string, any>) {
		this.chatUI.setState(state);
	}

	public addToInventory(item: InventoryItem): void {
		const existing = this.inventory.get(item.name);
		if (existing) {
			existing.quantity += item.quantity;
			if (item.metadata) {
				existing.metadata = { ...existing.metadata, ...item.metadata };
			}
		} else {
			this.inventory.set(item.name, { ...item });
		}
		this.broadcastInventoryUpdate();
	}

	public removeFromInventory(itemName: string, quantity: number): boolean {
		const item = this.inventory.get(itemName);
		if (!item || item.quantity < quantity) return false;

		item.quantity -= quantity;
		if (item.quantity <= 0) {
			this.inventory.delete(itemName);
		}
		this.broadcastInventoryUpdate();
		return true;
	}

	public getInventory(): Map<string, InventoryItem> {
		return this.inventory;
	}

	private broadcastInventoryUpdate(): void {
		if (!this.world) return;

		const allPlayers = this.world.entityManager
			.getAllEntities()
			.filter((e) => e instanceof PlayerEntity)
			.map((e) => (e as PlayerEntity).player);

		allPlayers.forEach((player) => {
			player.ui.sendData({
				type: "agentThoughts",
				agents: this.world!.entityManager.getAllEntities()
					.filter((e) => e instanceof BaseAgent)
					.map((e) => {
						const agentState = (e as BaseAgent).getCurrentState();
						return {
							name: e.name,
							lastThought: (e as BaseAgent).getLastMonologue() || "Idle",
							energy: agentState.energy,
							maxEnergy: agentState.maxEnergy,
							inventory: Array.from((e as BaseAgent).getInventory().values())
						};
					}),
			});
		});
	}

	// Method to gain energy - delegates to manager
	public gainEnergy(amount: number): void {
		const previousEnergyState = this.energyManager.getState();
		this.energyManager.gainEnergy(amount);
		const currentEnergyState = this.energyManager.getState();

		// Log energy gain here, with agent context
		if (currentEnergyState.currentEnergy !== previousEnergyState.currentEnergy) {
			logEvent({
				type: "agent_energy_gain",
				agentId: this.id,
				agentName: this.name,
				energy: currentEnergyState.currentEnergy,
				gainAmount: currentEnergyState.currentEnergy - previousEnergyState.currentEnergy // Calculate actual gain
			});
			console.log(`${this.name} gained energy. Current: ${currentEnergyState.currentEnergy}/${currentEnergyState.maxEnergy}`);
		}
	}

	public updateLastActionTime() {
		this.lastActionTick = this.currentTick;
	}

	public addInternalMonologue(thought: string) {
		this.internalMonologue.push(thought);
	}

	public getScratchMemory(): ScratchMemory {
		return this.scratchMemory;
	}

	// Add getter for lastReflectionTick
	public getLastReflectionTick(): number {
		return this.lastReflectionTick;
	}

	// Add setter for lastReflectionTick
	public updateLastReflectionTick(tick: number): void {
		this.lastReflectionTick = tick;
	}

	// Add getter for currentTick
	public getCurrentTick(): number {
		return this.currentTick;
	}
}
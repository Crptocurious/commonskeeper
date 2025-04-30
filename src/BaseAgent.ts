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

export class BaseAgent extends Entity {
	private behaviors: AgentBehavior[] = [];
	private internalMonologue: string[] = [];
	private lastActionTime: number = Date.now();
	private inactivityCheckInterval?: ReturnType<typeof setInterval>;
	private readonly INACTIVITY_THRESHOLD = 30000; // 30 seconds in milliseconds
	private chatUI: SceneUI;
	private inventory: Map<string, InventoryItem> = new Map();
	private energyManager: EnergyManager;
	private plan: Plan;
	private perceive: Perceive;
	private scratchMemory: ScratchMemory;

	public isDead: boolean = false; // Added property to track death state

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
		
		this.on(EntityEvent.TICK, this.onTickBehavior);
		
		// Start inactivity checker when agent is created
		this.inactivityCheckInterval = setInterval(() => {
			const timeSinceLastAction = Date.now() - this.lastActionTime;
			if (timeSinceLastAction >= this.INACTIVITY_THRESHOLD) {
				this.handleEnvironmentTrigger(
					"You have been inactive for a while. What would you like to do?"
				);
				this.lastActionTime = Date.now(); // Reset timer
			}
		}, 5000); // Check every 5 seconds

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

	private onTickBehavior = () => {
		if (!this.isSpawned || !this.world) return;

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
		const lake = this.world.entityManager.getAllEntities().find(e => e.name === "Lake") as Lake | undefined;
		if (lake?.getState) {
			this.perceive.perceiveLake(lake);
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


		// Check depletion status from manager
		if (currentEnergyState.isDepleted) {
			// Placeholder for potential death/starvation logic
			// console.log(`${this.name} has run out of energy!`);
		}

	};

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

        // Add time information from the world state
        if (this.world) {
            const gameWorld = this.world as any; // Cast to access custom properties
            if (gameWorld.currentTimeTicks !== undefined) {
                state.currentTimeTicks = gameWorld.currentTimeTicks;
                state.ticksPerHour = gameWorld.ticksPerHour;
                state.ticksPerDay = gameWorld.ticksPerDay;
                // Optionally calculate and add current hour/day
                // state.currentHour = Math.floor(gameWorld.currentTimeTicks / gameWorld.ticksPerHour) % 24;
                // state.currentDay = Math.floor(gameWorld.currentTimeTicks / gameWorld.ticksPerDay);
            }
        }

		return state;
	}


	/**
	 * Same handleToolCall as in your code. We simply pass the calls to behaviors.
	 */
	public handleToolCall(toolName: string, args: any, player?: Player) {
		if (!this.world) return;
		let results: string[] = [];
		console.log("Handling tool call:", toolName, args);
		this.behaviors.forEach((b) => {
			if (b.onToolCall) {
				const result = b.onToolCall(
					this,
					this.world!,
					toolName,
					args,
					player
				);
				if (result) results.push(`${toolName}: ${result}`);
			}
		});
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
		this.plan.chat(this, {
			type: "Environment",
			message,
		});
	}

	// Clean up interval when agent is destroyed
	public despawn(): void {
		if (this.inactivityCheckInterval) {
			clearInterval(this.inactivityCheckInterval);
		}
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
		this.lastActionTime = Date.now();
	}

	public addInternalMonologue(thought: string) {
		this.internalMonologue.push(thought);
	}

	public getScratchMemory(): ScratchMemory {
		return this.scratchMemory;
	}
}
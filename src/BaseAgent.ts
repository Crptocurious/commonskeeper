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
	PlayerEntity,
} from "hytopia";

import { logEvent } from "./logger";
import { EnergyManager, type EnergyState } from "./EnergyManager";

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
	getState(): Record<string, any>;
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
	private inventory: Map<string, InventoryItem> = new Map();
	private lastThought: string = "idle";
	private energyManager: EnergyManager; // Use EnergyManager instance

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
	}

	private onTickBehavior = () => {
		if (!this.isSpawned || !this.world) return;

		const previousEnergyState = this.energyManager.getState();
 		this.energyManager.decayTick(); // Delegate decay to manager
 		const currentEnergyState = this.energyManager.getState();
 
 		// Log energy decay event here, with agent context
 		if (currentEnergyState.currentEnergy !== previousEnergyState.currentEnergy) {
 			logEvent({
 				type: "agent_energy_decay",
 				agentId: this.id,
 				agentName: this.name,
 				energy: currentEnergyState.currentEnergy,
 				decayAmount: previousEnergyState.currentEnergy - currentEnergyState.currentEnergy // Calculate actual decay
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
		return state;
	}

	/**
	 * Parse XML response for <action> tags and execute them
	 */
	private parseXmlResponse(text: string) {
		// <action type="..."> ... </action>
		const actionRegex = /<action\s+type="([^"]+)">([\s\S]*?)<\/action>/g;
		let actionMatch;
		while ((actionMatch = actionRegex.exec(text)) !== null) {
			const actionType = actionMatch[1] || "";
			if (!actionType) continue; // Skip if no action type
			
			const actionBody = actionMatch[2]?.trim() || "{}";
			try {
				console.log("Action:", actionType, actionBody);
				const parsed = actionBody === "{}" ? {} : JSON.parse(actionBody);
				this.handleToolCall(actionType, parsed);
				this.lastActionTime = Date.now(); // Update last action time
			} catch (e) {
				console.error(`Failed to parse action ${actionType}:`, e);
				console.error("Body:", actionBody);
			}
		}
	}

	/**
	 * Handle tool calls from behaviors
	 */
	public handleToolCall(toolName: string, args: any, player?: Player) {
		if (!this.world) return;
		let results: string[] = [];
		console.log("Handling tool call:", toolName, args);
		this.lastActionTime = Date.now();
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
	}

	public handleEnvironmentTrigger(message: string) {
		console.log(
			"Environment trigger for agent " + this.name + ":",
			message
		);
		this.parseXmlResponse(`<action type="acknowledge">{ "message": "${message}" }</action>`);
	}

	// Clean up interval when agent is destroyed
	public despawn(): void {
		if (this.inactivityCheckInterval) {
			clearInterval(this.inactivityCheckInterval);
		}
		super.despawn();
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
	}

	public removeFromInventory(itemName: string, quantity: number): boolean {
		const item = this.inventory.get(itemName);
		if (!item || item.quantity < quantity) return false;

		item.quantity -= quantity;
		if (item.quantity <= 0) {
			this.inventory.delete(itemName);
		}
		return true;
	}

	public getInventory(): Map<string, InventoryItem> {
		return this.inventory;
	}

	public setLastThought(thought: string) {
		this.lastThought = thought;
	}

	public getLastThought(): string {
		return this.lastThought;
	}

	public getName(): string {
		return this.name;
	}

	public getInventoryArray(): InventoryItem[] {
		return Array.from(this.inventory.values());
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
}

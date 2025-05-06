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
import type { GamePhase, GameState, GameWorld, LakeState } from "./types/GameState";

import { SIMULATION_CONFIG, TIME_CONFIG } from "./config/constants";
import type { InventoryItem, AgentState, NearbyEntity } from "./types/AgentState";
import { CognitiveCycle } from "./brain/cognitive/CognitiveCycle";
import { ScratchMemory } from "./brain/memory/ScratchMemory";
import { UIService } from "./services/UIService";

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

export interface CompleteState {
	agent: AgentState;
	game: GameState;
}

export class BaseAgent extends Entity {
	private behaviors: AgentBehavior[] = [];
	private chatUI: SceneUI;
	private internalMonologue: string[] = [];
	private currentWorld?: GameWorld;
	private scratchMemory: ScratchMemory;
	private cognitiveCycle: CognitiveCycle;
	public currentAgentTick: number = 0;
	public currentAgentPhase: GamePhase = 'PLANNING';
	public lastAgentPhase: GamePhase | null = null;
	public inventory: Map<string, InventoryItem> = new Map();
	public totalHarvested: number = 0;
	private currentLakeState: LakeState = {
		currentStock: 0,
		maxCapacity: 0,
		lastUpdateTick: 0,
		isCollapsed: true,
		regenRate: 0,
		collapseThreshold: 0
	};
	public plannedHarvestAmount: number | null = null;
	
	private lastActionTick: number = 0;
	public lastReflectionTick: number = 0;
	private readonly INACTIVITY_THRESHOLD_TICKS = TIME_CONFIG.TICKS_PER_SECOND * 30; // 30 seconds worth of ticks

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

		this.scratchMemory = new ScratchMemory(this.name);
		this.cognitiveCycle = new CognitiveCycle(options.systemPrompt);
		
		this.chatUI = new SceneUI({
			templateId: "agent-chat",
			attachedToEntity: this,
			offset: { x: 0, y: 1, z: 0 },
			state: {
				message: "",
				agentName: options.name || "BaseAgent",
			},
		});

		// Set up tick handler for inactivity check
		this.on(EntityEvent.TICK, () => {
			if (!this.currentWorld) return;

			this.currentAgentTick = this.currentWorld.currentTick;

			// this.currentAgentPhase = 'DISCUSSION';
			
			// Update phase and track last phase
			const previousPhase = this.currentAgentPhase;
			if (this.currentWorld.currentPhase !== previousPhase) {
				this.lastAgentPhase = this.currentAgentPhase;
				this.currentAgentPhase = this.currentWorld.currentPhase;

				// Trigger planning logic when entering the PLANNING phase
				if (this.currentAgentPhase === 'PLANNING') {
					this.handleEnvironmentTrigger("The PLANNING phase has begun. Review the situation and decide your harvest plan.");
					this.lastActionTick = this.currentAgentTick; // Reset action timer after planning trigger
				}
				// Trigger discussion logic when entering the DISCUSSION phase
				else if (this.currentAgentPhase === 'DISCUSSION') {
					// this.handleEnvironmentTrigger("The DISCUSSION phase has begun. Let's gather at the townhall to discuss our strategies.");
					console.log("The Communication should automatically start via behaviour updates. Nothing to do here.");
					this.lastActionTick = this.currentAgentTick;
				}
			}

			// Update lake state if available
			if (this.currentWorld.lake) {
				this.currentLakeState = this.currentWorld.lake.getState();
			}

			// --- Inactivity Check (Commented out for now) ---
			// const ticksSinceLastAction = this.currentAgentTick - this.lastActionTick;
			// if (ticksSinceLastAction >= this.INACTIVITY_THRESHOLD_TICKS) {
			// 	this.handleEnvironmentTrigger(
			// 		"You have been inactive for a while. What would you like to do?"
			// 	);
			// 	this.lastActionTick = this.currentAgentTick; // Reset timer
			// }

			// Execute all behavior updates
			this.behaviors.forEach(behavior => {
				behavior.onUpdate(this, this.currentWorld!);
			});
		});
	}

	public addBehavior(behavior: AgentBehavior) {
		this.behaviors.push(behavior);
	}

	public getBehaviors(): AgentBehavior[] {
		return this.behaviors;
	}

	public spawn(world: World, position: Vector3) {
		super.spawn(world, position);
		this.chatUI.load(world);
		this.currentWorld = world as GameWorld;
		this.lastActionTick = this.currentWorld.currentTick;
	}

	public updateLastActionTick() {
		this.lastActionTick = this.currentAgentTick;
	}

	public despawn(): void {
		super.despawn();
	}

	public addInternalMonologue(thought: string) {
		this.internalMonologue.push(thought);
	}

	public getLastMonologue(): string | undefined {
		return this.internalMonologue[this.internalMonologue.length - 1];
	}

	public async handleEnvironmentTrigger(message: string) {
		console.log(
			"Environment trigger for agent " + this.name + ":",
			message
		);
		await this.cognitiveCycle.execute(this, message);
	}

	// Commented out because we are only allowing the communication behaviour during townhall phase.
	// private broadcastToNearbyAgents(message: string, sourceAgent: BaseAgent, type: 'SPEAK' | 'TOWNHALL') {
	// 	if (!this.world) return;

	// 	const range = type === 'SPEAK' ? 10 : Infinity; // Regular speak has 10m range, townhall is global
	// 	const nearbyAgents = this.world.entityManager
	// 		.getAllEntities()
	// 		.filter((e): e is BaseAgent => e instanceof BaseAgent && e.name !== sourceAgent.name)
	// 		.filter(agent => {
	// 			if (type === 'TOWNHALL') return true; // Include all agents during townhall
	// 			const agentPos = Vector3.fromVector3Like(agent.position);
	// 			const sourcePos = Vector3.fromVector3Like(sourceAgent.position);
	// 			const distance = agentPos.distance(sourcePos);
	// 			return distance <= range;
	// 		});

	// 	nearbyAgents.forEach(agent => {
	// 		agent.cognitiveCycle.handleChat(agent, {
	// 			type: "Agent",
	// 			message,
	// 			agent: sourceAgent
	// 		});
	// 	});
	// }

	public handleToolCall(toolName: string, args: any, player?: Player) {
		if (!this.world) return;
		let results: string[] = [];
		console.log(`Agent ${this.name} handling tool call:`, toolName, args);
		this.lastActionTick = this.currentAgentTick;

		// Ensure world is treated as GameWorld to access metricsTracker
		const gameWorld = this.world as GameWorld;

		// Handle communication actions first
		// Commented because we are only allowing the communication behaviour during townhall phase.
		// if (toolName === "speak" || toolName === "townhall_speak") {
		// 	const message = args.message;
		// 	if (typeof message === "string") {
		// 		// Set chat UI bubble
		// 		this.setChatUIState({ message });

		// 		// Clear message after delay
		// 		setTimeout(() => {
		// 			this.setChatUIState({ message: "" });
		// 		}, 5300);

		// 		// Broadcast based on phase
		// 		if (toolName === "townhall_speak") {
		// 			if (this.currentAgentPhase === 'DISCUSSION') {
		// 				this.broadcastToNearbyAgents(message, this, "TOWNHALL");
		// 				// Record metric only if broadcast was successful during the correct phase
		// 				gameWorld.metricsTracker.recordTownhallMessage();
		// 				results.push(`${toolName}: ${message}`);
		// 			} else {
		// 				// Inform agent they can't speak now
		// 				results.push(`${toolName}: Failed. You can only use townhall_speak during the DISCUSSION phase.`);
		// 			}
		// 		} else { // toolName === "speak"
		// 			this.broadcastToNearbyAgents(message, this, "SPEAK");
		// 			results.push(`${toolName}: ${message}`);
		// 		}
		// 	}
		// }

		// Handle other behaviors
		this.behaviors.forEach((b) => {
			if (b.onToolCall) {
				const result = b.onToolCall(
					this,
					this.world!,
					toolName,
					args,
					player
				);
				if (result) results.push(`${b.constructor.name}.${toolName}: ${result}`);
			}
		});

		return results.join("\n");
	}

	// Inventory for items like fish.
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

		// If fish are added, update totalHarvested
		if (item.name === "fish") {
			this.totalHarvested += item.quantity;
		}
	}

	public removeFromInventory(item: InventoryItem): boolean {
		const existing = this.inventory.get(item.name);
		if (!existing || existing.quantity < item.quantity) return false;

		existing.quantity -= item.quantity;
		if (existing.quantity <= 0) {
			this.inventory.delete(item.name);
		}
		return true;
	}

	public getScratchMemory(): ScratchMemory {
		return this.scratchMemory;
	}

	public updateLastReflectionTick(tick: number): void {
		this.lastReflectionTick = tick;
	}

	public setChatUIState(state: Record<string, any>) {
		this.chatUI.setState(state);
	}

	public getCompleteState(): CompleteState {
		const agentState: AgentState = {
			name: this.name,
			position: this.position ? { x: this.position.x, y: this.position.y, z: this.position.z } : undefined,
			inventory: Array.from(this.inventory.values()),
			behaviors: this.behaviors.map(b => ({ name: b.constructor.name, state: b.getState() })),
			lastActionTick: this.lastActionTick,
			lastReflectionTick: this.lastReflectionTick,
			totalHarvested: this.totalHarvested,
			internalMonologue: [...this.internalMonologue],
			nearbyEntities: this.getNearbyEntities(),
		};

		const gameState: GameState = {
			lake: this.currentLakeState,
			phase: {
				currentPhase: this.currentAgentPhase,
				lastPhase: this.lastAgentPhase,
				phaseStartTick: this.currentAgentTick
			},
			lastUpdateTick: this.currentAgentTick
		};

		return {
			agent: agentState,
			game: gameState
		};
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

}
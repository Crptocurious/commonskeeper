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

import { EnergyManager } from "./EnergyManager";
import { SIMULATION_CONFIG, TIME_CONFIG } from "./config/constants";
import type { InventoryItem, AgentState, NearbyEntity } from "./types/AgentState";
import { CognitiveCycle } from "./brain/cognitive/CognitiveCycle";
import { ScratchMemory } from "./brain/memory/ScratchMemory";

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
	public energyManager: EnergyManager;
	public isDead: boolean = false;
	private internalMonologue: string[] = [];
	private currentWorld?: GameWorld;
	private scratchMemory: ScratchMemory;
	private cognitiveCycle: CognitiveCycle;
	public currentAgentTick: number = 0;
	public currentAgentPhase: GamePhase = 'TOWNHALL';
	public lastAgentPhase: GamePhase | null = null;
	public inventory: Map<string, InventoryItem> = new Map();
	private currentLakeState: LakeState = {
		currentStock: 0,
		maxCapacity: 0,
		lastUpdateTick: 0,
		isCollapsed: true,
		regenRate: 0,
		collapseThreshold: 0
	};
	
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
		
		this.energyManager = new EnergyManager(SIMULATION_CONFIG.MAX_ENERGY, SIMULATION_CONFIG.MAX_ENERGY / (TIME_CONFIG.TICKS_PER_MINUTE * 60), this);

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
			
			// Update phase and track last phase
			if (this.currentWorld.currentPhase !== this.currentAgentPhase) {
				this.lastAgentPhase = this.currentAgentPhase;
				this.currentAgentPhase = this.currentWorld.currentPhase;
			}

			// Update lake state if available
			if (this.currentWorld.lake) {
				this.currentLakeState = this.currentWorld.lake.getState();
			}

			const ticksSinceLastAction = this.currentAgentTick - this.lastActionTick;
			if (ticksSinceLastAction >= this.INACTIVITY_THRESHOLD_TICKS) {
				this.handleEnvironmentTrigger(
					"You have been inactive for a while. What would you like to do?"
				);
				this.lastActionTick = this.currentAgentTick; // Reset timer
			}

			// Execute all behavior updates
			this.behaviors.forEach(behavior => {
				behavior.onUpdate(this, this.currentWorld!);
			});

			this.energyManager.decay(this.currentAgentTick);
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

	private broadcastToNearbyAgents(message: string, sourceAgent: BaseAgent, type: 'SPEAK' | 'TOWNHALL') {
		if (!this.world) return;

		const range = type === 'SPEAK' ? 10 : Infinity; // Regular speak has 10m range, townhall is global
		const nearbyAgents = this.world.entityManager
			.getAllEntities()
			.filter((e): e is BaseAgent => e instanceof BaseAgent && e.name !== sourceAgent.name)
			.filter(agent => {
				if (type === 'TOWNHALL') return true; // Include all agents during townhall
				const agentPos = Vector3.fromVector3Like(agent.position);
				const sourcePos = Vector3.fromVector3Like(sourceAgent.position);
				const distance = agentPos.distance(sourcePos);
				return distance <= range;
			});

		nearbyAgents.forEach(agent => {
			agent.cognitiveCycle.handleChat(agent, {
				type: "Agent",
				message,
				agent: sourceAgent
			});
		});
	}

	public handleToolCall(toolName: string, args: any, player?: Player) {
		if (!this.world) return;
		let results: string[] = [];
		console.log(`Agent ${this.name} handling tool call:`, toolName, args);
		this.lastActionTick = this.currentAgentTick;

		// Ensure world is treated as GameWorld to access metricsTracker
		const gameWorld = this.world as GameWorld;

		// Handle communication actions first
		if (toolName === "speak" || toolName === "townhall_speak") {
			const message = args.message;
			if (typeof message === "string") {
				// Set chat UI bubble
				this.setChatUIState({ message });

				// Clear message after delay
				setTimeout(() => {
					this.setChatUIState({ message: "" });
				}, 5300);

				// Broadcast to nearby agents
				this.broadcastToNearbyAgents(message, this, toolName === "speak" ? "SPEAK" : "TOWNHALL");

				// Record metric for successful townhall message
				if (toolName === "townhall_speak" && this.currentAgentPhase === 'TOWNHALL') {
					gameWorld.metricsTracker.recordTownhallMessage();
				}

				results.push(`${toolName}: ${message}`);
			}
		}

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
        return {
            agent: {
                name: this.name,
                position: this.position,
                energy: this.energyManager.getState(),
                inventory: Array.from(this.inventory.entries()).map(([name, item]) => ({
                    name,
                    quantity: item.quantity,
                    metadata: item.metadata
                })),
				behaviors: this.behaviors.map(b => ({
					name: b.constructor.name,
					state: b.getState()
				})),
                lastActionTick: this.lastActionTick,
                lastReflectionTick: this.lastReflectionTick,
				isDead: this.isDead,
				internalMonologue: this.internalMonologue,
				nearbyEntities: this.getNearbyEntities(),
				// scratchMemory: this.getScratchMemory()
            },
            game: {
                lake: this.currentLakeState,
                phase: {
                    currentPhase: this.currentAgentPhase,
                    lastPhase: this.lastAgentPhase,
                    phaseStartTick: this.currentAgentTick
                },
                lastUpdateTick: this.currentAgentTick
            }
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
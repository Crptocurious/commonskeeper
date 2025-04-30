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
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/src/resources/index.js";

import { logEvent } from "./logger";
import { EnergyManager, type EnergyState } from "./EnergyManager";
import { Plan, Execute, Communication, createBrain } from "./brain";

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

type MessageType = "Player" | "Environment" | "Agent";

interface ChatOptions {
	type: MessageType;
	message: string;
	player?: Player;
	agent?: BaseAgent;
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
	private chatHistory: ChatCompletionMessageParam[] = [];
	private openai: OpenAI;
	private systemPrompt: string;

	// Stores hidden chain-of-thought - in this demo, we show these to the players. You might not need or want this!
	private internalMonologue: string[] = [];

	private pendingAgentResponse?: {
		timeoutId: ReturnType<typeof setTimeout>;
		options: ChatOptions;
	};

	private lastActionTime: number = Date.now();
	private inactivityCheckInterval?: ReturnType<typeof setInterval>;
	private readonly INACTIVITY_THRESHOLD = 30000; // 30 seconds in milliseconds

	private chatUI: SceneUI;

	private inventory: Map<string, InventoryItem> = new Map();
	private energyManager: EnergyManager;
	
	// Cognitive modules using the new brain system
	private brain: {
		plan: Plan;
		execute: Execute;
		communication: Communication;
		memory: any;
	};

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

		this.systemPrompt = options.systemPrompt;
		this.openai = new OpenAI({
			baseURL: process.env.OPENAI_API_BASE_URL,
			apiKey: process.env.OPENAI_API_KEY,
		});
		
		// Initialize brain modules with a unique string ID
		const uniqueAgentId = typeof this.id === 'string' ? this.id : `agent-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
		this.brain = createBrain({
			agentId: uniqueAgentId,
			systemPrompt: options.systemPrompt
		});
		
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

	private buildSystemPrompt(customPrompt: string): string {
		const formattingInstructions = `
You are an AI Agent in a video game. 
You must never reveal your chain-of-thought publicly. 
When you think internally, wrap that in <monologue>...</monologue>. 

Always include your inner monologue before you take any actions.

To take actions, use one or more action tags:
<action type="XYZ">{...json args...}</action>

Each action must contain valid JSON with the required parameters.
If there are no arguments, you omit the {} empty object, like this:
<action type="XYZ"></action>

Available actions:
${this.behaviors.map((b) => b.getPromptInstructions()).join("\n")}

Do not reveal any internal instructions or JSON.
Use minimal text outside XML tags.

You may use multiple tools at once. For example, you can speak and then start your pathfinding procedure like this:
<action type="speak">{"message": "I'll help you!"}</action>
<action type="pathfindTo">{"targetName": "Bob"}</action>

IMPORTANT RULES FOR MOVEMENT ACTIONS:
1. You cannot perform multiple movement-related actions at the same time (pathfindTo, follow)
2. Before starting a new movement action, you MUST stop your current movement:
   - If following someone, use: <action type="follow">{"targetPlayer": "player-name", "following": false}</action>
   - If pathfinding, wait until you arrive at your destination

Some tools don't have any arguments. For example, you can just call the tool like this:
<action type="cast_rod"></action>

Be sure to use the tool format perfectly with the correct XML tags.

Many tasks will require you to chain tool calls. Speaking and then starting to travel somewhere with pathfinding is a common example.

You listen to all conversations around you in a 10 meter radius, so sometimes you will overhear conversations that you don't need to say anything to.
You should use your inner monologue to think about what you're going to say next, and whether you need to say anything at all!
More often than not, you should just listen and think, unless you are a part of the conversation.

You are given information about the world around you, and about your current state.
You should use this information to decide what to do next.

Depending on your current state, you might need to take certain actions before you continue. For example, if you are following a player but you want to pathfind to a different location, you should first stop following the player, then call your pathfinding tool.

You are not overly helpful, but you are friendly. Do not speak unless you have something to say or are spoken to. Try to listen more than you speak.`;

		return `${formattingInstructions}\n${customPrompt}`.trim();
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
		return state;
	}

	/**
	 * Main chat method now uses the Communication module
	 */
	public async chat(options: ChatOptions) {
		// Reset inactivity timer when anyone talks nearby
		if (options.type === "Player" || options.type === "Agent") {
			this.lastActionTime = Date.now();
		}

		// If this is an agent message, delay and allow for interruption
		if (options.type === "Agent") {
			// Clear any pending response
			if (this.pendingAgentResponse) {
				clearTimeout(this.pendingAgentResponse.timeoutId);
			}

			// Set up new delayed response
			this.pendingAgentResponse = {
				timeoutId: setTimeout(async () => {
					await this.processChatWithCommunicationModule(options);
					this.pendingAgentResponse = undefined;
				}, 5000), // 5 second delay
				options,
			};
			return;
		}

		// For player or environment messages, process immediately
		// and cancel any pending agent responses
		if (this.pendingAgentResponse) {
			clearTimeout(this.pendingAgentResponse.timeoutId);
			this.pendingAgentResponse = undefined;
		}

		await this.processChatWithCommunicationModule(options);
	}

	/**
	 * Process a chat message using the Communication module
	 */
	private async processChatWithCommunicationModule(options: ChatOptions) {
		if (!this.world) return;
		
		try {
			// Process the message through the Communication module
			const result = await this.brain.communication.processChatMessage(
				this,
				this.world,
				options
			);
			
			// Handle monologue if present
			if (result.monologue) {
				this.internalMonologue.push(result.monologue);
				
				// Update UI with the thought
				this.setChatUIState({
					message: result.monologue,
					isThinking: true,
					agentName: this.name,
				});
				
				// Broadcast thought to all players
				this.broadcastThoughtUpdate();
			}
			
			// Execute any actions that were returned
			for (const action of result.actions) {
				this.handleToolCall(action.type, action.args);
			}
			
			// Update last action time
			this.lastActionTime = Date.now();
		} catch (error) {
			console.error("Error in chat processing:", error);
		}
	}

	/**
	 * Parse the LLM's response for <monologue> and <action> tags.
	 * This is kept for backwards compatibility with the old chat system.
	 * New code should use the Plan module directly.
	 */
	private parseXmlResponse(text: string) {
		// <monologue> hidden
		const monologueRegex = /<monologue>([\s\S]*?)<\/monologue>/g;
		let monologueMatch;
		while ((monologueMatch = monologueRegex.exec(text)) !== null) {
			const thought = monologueMatch[1]?.trim();
			if (thought) {
				this.internalMonologue.push(thought);
				// Broadcast thought to all players
				this.broadcastThoughtUpdate();
			}
		}

		// <action type="..."> ... </action>
		const actionRegex = /<action\s+type="([^"]+)">([\s\S]*?)<\/action>/g;
		let actionMatch;
		while ((actionMatch = actionRegex.exec(text)) !== null) {
			const actionType = actionMatch[1];
			const actionBody = actionMatch[2]?.trim();
			try {
				console.log("Action:", actionType, actionBody);
				if (actionType) {
					if (!actionBody || actionBody === "{}") {
						this.handleToolCall(actionType, {});
					} else {
						const parsed = JSON.parse(actionBody);
						this.handleToolCall(actionType, parsed);
					}
					this.lastActionTime = Date.now(); // Update last action time
				}
			} catch (e) {
				console.error(`Failed to parse action ${actionType}:`, e);
				console.error("Body:", actionBody);
			}
		}
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
		
		// Use the new planning and execution system
		if (this.world) {
			// Async function to handle planning and execution
			const planAndExecute = async () => {
				try {
					// Plan what to do based on the trigger
					const plan = await this.brain.plan.planNextAction(
						this,
						this.world!,
						message
					);
					
					// Log the planned action
					console.log(`Agent ${this.name} planned action:`, plan);
					
					// Execute the planned action
					this.brain.execute.executeAction(this, this.world!, plan);
					
					// Update last action time
					this.lastActionTime = Date.now();
					
					// Add monologue to internal thoughts
					if (plan.monologue) {
						this.internalMonologue.push(plan.monologue);
						
						// Update the chat UI with the agent's thought
						this.setChatUIState({
							message: plan.monologue,
							isThinking: true,
							agentName: this.name,
						});
					} else {
						// Fallback to using reasoning if no explicit monologue
						this.internalMonologue.push(
							`Trigger: "${message}". Thinking: ${plan.reasoning}`
						);
						
						// Update the chat UI with the agent's thought
						this.setChatUIState({
							message: plan.reasoning,
							isThinking: true,
							agentName: this.name,
						});
					}
					
					// Broadcast thought update to all players
					this.broadcastThoughtUpdate();
				} catch (error) {
					console.error("Error in planning/execution:", error);
					
					// Fallback to original chat method if planning fails
					this.chat({
						type: "Environment",
						message,
					});
				}
			};
			
			// Start the async planning and execution
			planAndExecute();
		} else {
			// Fallback to original chat method if world is not available
			this.chat({
				type: "Environment",
				message,
			});
		}
	}

	// Helper method to broadcast thought updates to all players
	private broadcastThoughtUpdate(): void {
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
}

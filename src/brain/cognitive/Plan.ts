import type { ChatCompletionMessageParam } from "openai/src/resources/index.js";
import { BaseAgent } from "../../BaseAgent";
import { Player, PlayerEntity } from "hytopia";
import type { AgentBehavior } from "../../BaseAgent";
import { BaseLLM } from "../BaseLLM";
import { buildPlanSystemPrompt, buildPlanUserMessage } from "../../config/prompts";

type MessageType = "Player" | "Environment" | "Agent";

// Export the ChatOptions interface
export interface ChatOptions {
    type: MessageType;
    message: string;
    player?: Player;
    agent?: BaseAgent;
}

export class Plan {
    private llm: BaseLLM;
    private systemPrompt: string;
    private pendingAgentResponse?: {
        timeoutId: ReturnType<typeof setTimeout>;
        options: ChatOptions;
    };

    constructor(systemPrompt: string) {
        this.systemPrompt = systemPrompt;
        this.llm = new BaseLLM();
    }

    public async chat(agent: BaseAgent, options: ChatOptions) {
        // Reset inactivity timer when anyone talks nearby
        if (options.type === "Player" || options.type === "Agent") {
            agent.updateLastActionTick();
        }

        // If this is an agent message, delay and allow for interruption
        if (options.type === "Agent") {
            // Clear any pending response
            if (this.pendingAgentResponse) {
                clearTimeout(this.pendingAgentResponse.timeoutId);
            }

            // Set up new delayed response
            this.pendingAgentResponse = {
                timeoutId: setTimeout(() => {
                    this.processChatMessage(agent, options);
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

        await this.processChatMessage(agent, options);
    }

    private async processChatMessage(agent: BaseAgent, options: ChatOptions) {
        const { type, message, player, agent: sourceAgent } = options;
        try {
            // Get complete state from agent
            const completeState = agent.getCompleteState();

            // Get recent memories
            const recentMemories = agent.getScratchMemory().getRecentMemories();

            // Build prompt with complete state
            const userMessage = buildPlanUserMessage(options, completeState, recentMemories);

            // Construct messages directly without separate convert function
            const messages: ChatCompletionMessageParam[] = [
                {
                    role: "system",
                    content: buildPlanSystemPrompt(this.systemPrompt, agent)
                },
                {
                    role: "user",
                    content: userMessage
                }
            ];

            const response = await this.llm.generate(messages);
            if (!response) return;

            console.log("Response:", response);

            this.parseXmlResponse(agent, response);
        } catch (error) {
            console.error("OpenAI API error:", error);
        }
    }

    private parseXmlResponse(agent: BaseAgent, text: string) {
        // <monologue> hidden
        const monologueRegex = /<monologue>([\s\S]*?)<\/monologue>/g;
        let monologueMatch;
        while ((monologueMatch = monologueRegex.exec(text)) !== null) {
            const thought = monologueMatch[1]?.trim();
            if (thought) {
                agent.addInternalMonologue(thought);
                // Broadcast thought to all players
                if (agent.world) {
                    const allPlayers = agent.world.entityManager
                        .getAllEntities()
                        .filter((e) => e instanceof PlayerEntity)
                        .map((e) => (e as PlayerEntity).player);

                    allPlayers.forEach((player) => {
                        player.ui.sendData({
                            type: "agentThoughts",
                            agents: agent.world!.entityManager.getAllEntities()
                                .filter((e): e is BaseAgent => e instanceof BaseAgent)
                                .map((e) => {
                                    const agentEnergy = e.energyManager.getState();
                                    return {
                                        name: e.name,
                                        lastThought: e.getLastMonologue() || "Idle",
                                        energy: agentEnergy.currentEnergy,
                                        maxEnergy: agentEnergy.maxEnergy,
                                        inventory: Array.from(e.inventory.values())
                                    };
                                }),
                        });
                    });
                }
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
                    // Store state before action
                    const stateBeforeAction = agent.getCompleteState();
                    const currentTick = agent.currentAgentTick;

                    // Parse and execute action
                    let actionArgs = {};
                    if (actionBody && actionBody !== "{}") {
                        actionArgs = JSON.parse(actionBody);
                    }
                    agent.handleToolCall(actionType, actionArgs);
                    
                    // Store action in memory
                    agent.getScratchMemory().addActionMemory(
                        currentTick,
                        stateBeforeAction,
                        actionType,
                        actionArgs
                    );
                    
                    agent.updateLastActionTick(); // Update last action time
                }
            } catch (e) {
                console.error(`Failed to parse action ${actionType}:`, e);
                console.error("Body:", actionBody);
            }
        }
    }
} 
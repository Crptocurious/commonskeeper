import type { AgentBehavior, BaseAgent } from "../BaseAgent";
import type { GameWorld } from "../types/GameState";
import type { ChatHistoryEntry, TownhallHistory } from "../brain/memory/ScratchMemory";
import { logEvent } from "../logger";
import { BaseLLM } from "../brain/BaseLLM";
import { UIService } from "../services/UIService";
import { COMMUNICATION_CONFIG } from "../config/constants";
import { buildCommunicationPrompt, buildCommunicationUserPrompt } from "../config/prompts";

export class CommunicationBehavior implements AgentBehavior {
    private llm: BaseLLM;
    private static sharedHistory: TownhallHistory = {
        messages: [],
        isDiscussionInProgress: false,
        currentSpeakerIndex: 0,
        lastUpdateTick: 0
    };

    constructor() {
        this.llm = new BaseLLM();
    }

    private syncTownhallHistoryToAllAgents(world: GameWorld, history: TownhallHistory) {
        // console.log(`[CommunicationBehavior] Syncing townhall history to all agents:`, {
        //     isDiscussionInProgress: history.isDiscussionInProgress,
        //     currentSpeakerIndex: history.currentSpeakerIndex,
        //     messageCount: history.messages.length,
        //     lastUpdateTick: history.lastUpdateTick,
        //     messages: history.messages
        // });

        // Update shared history first
        CommunicationBehavior.sharedHistory = {
            ...history,
            messages: [...history.messages] // Make a copy of messages
        };

        // Then sync to all agents
        world.agents?.forEach(agent => {
            agent.getScratchMemory().updateTownhallHistory(CommunicationBehavior.sharedHistory);
        });
    }

    onUpdate(agent: BaseAgent, world: GameWorld): void {
        // Only process during DISCUSSION phase
        if (agent.currentAgentPhase !== 'DISCUSSION') {
            return;
        }

        // Get all agents from the world
        const allAgents = world.agents || [];
        if (!allAgents.length) return;

        // Use shared history as source of truth
        const townhallHistory = CommunicationBehavior.sharedHistory;
        
        // If discussion is in progress, wait for it to finish
        if (townhallHistory.isDiscussionInProgress) {
            return;
        }

        // Check if it's this agent's turn to speak
        const currentAgent = allAgents[townhallHistory.currentSpeakerIndex];
        if (currentAgent && currentAgent.name === agent.name) {
            // Check if enough time has passed since last update
            const timeSinceLastUpdate = agent.currentAgentTick - townhallHistory.lastUpdateTick;
            if (timeSinceLastUpdate < COMMUNICATION_CONFIG.TURN_DELAY_TICKS) { // Use the configured delay
                return;
            }

            console.log(`[CommunicationBehavior] ${agent.name} starting turn at tick ${agent.currentAgentTick}`);
            
            // Set discussion in progress before starting the turn
            this.syncTownhallHistoryToAllAgents(world, {
                ...townhallHistory,
                isDiscussionInProgress: true,
                lastUpdateTick: agent.currentAgentTick
            });

            this.handleAgentTurn(agent, world);
        }
    }

    private async handleAgentTurn(agent: BaseAgent, world: GameWorld) {
        // Use shared history as source of truth
        const townhallHistory = CommunicationBehavior.sharedHistory;
        
        // Prepare chat history for the prompt
        const chatHistoryText = townhallHistory.messages
            .map(entry => `[${entry.agentName}]: ${entry.message}`)
            .join('\n');

        console.log(`[CommunicationBehavior] ${agent.name} considering chat history:`, chatHistoryText);

        // Maximum retry attempts
        const MAX_RETRIES = 2;
        let currentRetry = 0;
        let validResponse = false;
        let response = '';
        let monologueMatch = null;
        let speakMatch = null;

        while (currentRetry <= MAX_RETRIES && !validResponse) {
            if (currentRetry > 0) {
                console.log(`[CommunicationBehavior] ${agent.name} retry attempt ${currentRetry}`);
            }

            // Prepare the messages for the LLM
            const messages = [
                ...buildCommunicationPrompt(agent, world, currentRetry),
                buildCommunicationUserPrompt(chatHistoryText, currentRetry)
            ];

            // Get response from LLM
            response = await this.llm.generate(messages) || '';
            if (!response) {
                console.log(`[CommunicationBehavior] ${agent.name} received no response from LLM on attempt ${currentRetry + 1}`);
                currentRetry++;
                continue;
            }

            console.log(`[CommunicationBehavior] ${agent.name} LLM response (attempt ${currentRetry + 1}):`, response);

            // Strict validation of response format
            const validFormat = /^<monologue>[\s\S]*?<\/monologue>\s*<speak>[\s\S]*?<\/speak>\s*$/;
            if (!validFormat.test(response.trim())) {
                console.log(`[CommunicationBehavior] ${agent.name} response format invalid on attempt ${currentRetry + 1}`);
                currentRetry++;
                continue;
            }

            // Parse the response for monologue and speak tags
            monologueMatch = response.match(/<monologue>([\s\S]*?)<\/monologue>/);
            speakMatch = response.match(/<speak>([\s\S]*?)<\/speak>/);

            if (!monologueMatch?.[1] || !speakMatch?.[1]) {
                console.log(`[CommunicationBehavior] ${agent.name} missing required tags on attempt ${currentRetry + 1}`);
                currentRetry++;
                continue;
            }

            validResponse = true;
        }

        if (!validResponse || !monologueMatch?.[1] || !speakMatch?.[1]) {
            console.log(`[CommunicationBehavior] ${agent.name} failed to generate valid response after ${MAX_RETRIES + 1} attempts`);
            this.endTurn(agent, world);
            return;
        }

        // At this point, TypeScript knows monologueMatch[1] and speakMatch[1] are not null
        const thought = monologueMatch[1].trim();
        logEvent({
            type: 'agent_thought',
            agent: agent.name,
            thought: thought,
            tick: agent.currentAgentTick
        });

        // Add the thought to agent's monologue
        agent.addInternalMonologue(thought);

        // Update UI with the thought
        const playerEntities = world.entityManager.getAllPlayerEntities();
        playerEntities.forEach(playerEntity => {
            if (playerEntity?.player) {
                UIService.sendAgentThoughts(playerEntity.player, world.agents);
            }
        });

        // Process speak
        const message = speakMatch[1].trim();
        if (message) {
            console.log(`[CommunicationBehavior] ${agent.name} speaking:`, message);
            
            // Create new chat history entry
            const entry: ChatHistoryEntry = {
                agentName: agent.name,
                message,
                tick: agent.currentAgentTick
            };

            // Update shared history with new message
            const updatedHistory: TownhallHistory = {
                ...townhallHistory,
                messages: [...townhallHistory.messages, entry],
                isDiscussionInProgress: true,
                lastUpdateTick: agent.currentAgentTick
            };

            // Sync the updated history to all agents
            this.syncTownhallHistoryToAllAgents(world, updatedHistory);

            // Update UI with the message using chat bubble
            agent.setChatUIState({ message });

            // Clear chat bubble after delay
            setTimeout(() => {
                agent.setChatUIState({ message: "" });
                // Update UI one final time after chat bubble clears
                const playerEntities = world.entityManager.getAllPlayerEntities();
                playerEntities.forEach(playerEntity => {
                    if (playerEntity?.player) {
                        UIService.sendAgentThoughts(playerEntity.player, world.agents);
                    }
                });
            }, 5300);
        }

        console.log(`[CommunicationBehavior] ${agent.name} ending turn`);
        // End the turn after processing
        this.endTurn(agent, world);
    }

    private endTurn(agent: BaseAgent, world: GameWorld) {
        // Use shared history as source of truth
        const townhallHistory = CommunicationBehavior.sharedHistory;
        const allAgents = world.agents || [];
        
        // Calculate next speaker
        const nextSpeakerIndex = (townhallHistory.currentSpeakerIndex + 1) % allAgents.length;
        const isRoundComplete = nextSpeakerIndex === 0;

        console.log(`[CommunicationBehavior] Turn ended - Next speaker index: ${nextSpeakerIndex}, Round complete: ${isRoundComplete}`);

        // Update townhall history: turn off discussion in progress and update speaker
        const updatedHistory: TownhallHistory = {
            ...townhallHistory,
            isDiscussionInProgress: false, // Turn off discussion lock
            currentSpeakerIndex: isRoundComplete ? 0 : nextSpeakerIndex,
            lastUpdateTick: agent.currentAgentTick
        };

        // Sync the updated history to all agents
        this.syncTownhallHistoryToAllAgents(world, updatedHistory);
    }

    onToolCall(agent: BaseAgent, world: GameWorld, toolName: string, args: any): string | void {
        return;
    }

    getPromptInstructions(): string {
        return ``;
    }

    getState(): string {
        return JSON.stringify({
            isActive: true,
            messageCount: CommunicationBehavior.sharedHistory.messages.length
        });
    }
} 
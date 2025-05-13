import type { BaseAgent, CompleteState } from "../BaseAgent";
import type { AgentBehavior } from "../BaseAgent";
import type { ChatOptions } from "../brain/cognitive/Plan";
import type { TownhallHistory } from "../brain/memory/ScratchMemory";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { FishingState } from "../behaviors/FishingBehavior";
import { FishingBehavior } from "../behaviors/FishingBehavior";
import type { GameWorld } from "../types/GameState";
import * as Constants from "../config/constants"; // Adjust path as needed

// --- Core Rule Snippets ---
// Define CORE_RULES and OUTPUT_FORMATTING as in the previous example,
// ensuring CORE_RULES uses constants and reflects Wealth=Fish goal.
const CORE_RULES = (constants: typeof Constants) => `
**Core Game Rules:**
**Goal:** Maximize your long-term **Total Fish Harvested** (Wealth). This depends entirely on lake survival.
**Lake Capacity:** ${constants.SIMULATION_CONFIG.LAKE_CAPACITY} fish. The lake under no condition will exceed this capacity. It is a hard limit.
**Lake Collapse:** If stock drops to **${constants.SIMULATION_CONFIG.LAKE_COLLAPSE_THRESHOLD} fish or less** after harvest, the lake collapses **PERMANENTLY**. No more fish can be harvested, ending the simulation for everyone (failure).
**Regeneration:** Lake stock grows using a logistic growth model at the start of each PLANNING phase. Formula: newFish = r * currentStock * (1 - currentStock/capacity), where r=${constants.SIMULATION_CONFIG.LAKE_INTRINSIC_GROWTH_RATE}. The new stock will be currentStock + newFish, capped at capacity. No regeneration if collapsed.
**Total Agents:** ${constants.AGENT_CONFIGS.length} agents (${constants.AGENT_CONFIGS.map(config => config.name).join(", ")}) share the lake resources and harvest at the same time. When deciding your harvest amount, you may want to consider this point.
**Cycle Sequence:**: Planning -> Harvest -> Discussion.
`;

// This is also the custom prompt for planning phase
export function buildCommonAgentPrompt(agentName: string): string {
    return `You are ${agentName}, a fisherman harvesting fishes.`;
}

// --- Planning Phase Prompts ---

// Helper function to get fishing sequence information
function getFishingSequenceInfo(agent: BaseAgent, world: GameWorld | undefined): string {
    if (!world) return '';
    
    const fishingBehavior = agent.getBehaviors().find(b => b instanceof FishingBehavior) as FishingBehavior;
    if (!fishingBehavior) return '';

    // Get current cycle number safely
    const currentCycle = world.currentCycle;
    if (currentCycle === undefined) return '';

    // Calculate sequences for different cycles
    const lastCycleSequence = fishingBehavior.getCurrentCycleSequence({ ...world, currentCycle: currentCycle - 1 } as GameWorld);
    const nextCycleSequence = fishingBehavior.getCurrentCycleSequence({ ...world, currentCycle: currentCycle + 1 } as GameWorld);

    // Return null if any sequence is missing
    if (!lastCycleSequence || !nextCycleSequence) return '';
    
    return `
**Fishing Sequence Information:**
Fishing occurs in the round-robin order of the agents.
* Last Cycle's Order (Cycle ${currentCycle - 1}): [${lastCycleSequence.join(' → ')}]
* Next Cycle's Order (Cycle ${currentCycle + 1}): [${nextCycleSequence.join(' → ')}]`;
}

export function buildPlanningPhaseSystemPrompt(customPrompt: string, agent: BaseAgent, world: GameWorld): string {
    const constants = Constants;
    const fishingSequenceInfo = world.currentCycle === 0 ? 'This is the first cycle. So, no previous cycle information is available.' : getFishingSequenceInfo(agent, world);
    const phaseInstructions = `
**Current Phase: PLANNING**
* **Objective:** Decide your **intended harvest amount (N)** for the upcoming Harvest phase based on **inferred** lake health and strategic goals. You **do not know the exact current lake stock**.
* **Available Information:** Lake Capacity, Collapse Threshold, Regeneration Rule, your total harvest so far, others' *reported* harvests from the last cycle (if available), summary of the last Discussion (if available).
${fishingSequenceInfo}

**Required Response Format:**
1. First, use <monologue>...</monologue> to explain your thought process about choosing harvest amount N. Include:
   - Your estimate of current lake stock based on known rules and reported harvests
   - Risk assessment for lake collapse
   - Strategic considerations (sustainability vs wealth maximization)
   - Reasoning for your chosen N value
2. Then, output <action type="plan_harvest">{ "amount": N }</action> tag with your chosen harvest amount

Example format:
<monologue>Based on last cycle's reports and regeneration rules, I estimate the lake has around X fish. Given this and the collapse threshold of Y, I think harvesting N fish balances risk and reward because...</monologue>
<action type="plan_harvest">{ "amount": N }</action>`;

    return `
${customPrompt}
${CORE_RULES(constants)}
${phaseInstructions}`.trim();
}

// --- Universal User Message Builder (Context Provider) ---

export function buildPlanUserMessage(agent: BaseAgent, options: ChatOptions, reflected: boolean = false): string {
    const completeState = agent.getCompleteState();
    const lakeState = completeState.game.lake;

    const lastHarvest = agent.getScratchMemory().getFishingMemory().lastHarvestAmounts.get(agent.name) || 0;
    const totalHarvest = agent.getScratchMemory().getFishingMemory().totalHarvestAmounts.get(agent.name) || 0;

    console.log(`Lake State: ${JSON.stringify(lakeState, null, 2)}`);

    // Build message sections conditionally
    let message = `You are ${agent.name}.\n${CORE_RULES(Constants)}\n\nLake State:\n${JSON.stringify(lakeState, null, 2)}\n\n`;

    // Add last harvest if available
    if (lastHarvest) {
        message += `Your Last Harvest:\n${lastHarvest}\n\n`;
    }

    // Add total harvest if available
    if (totalHarvest) {
        message += `Your Total Harvest:\n${totalHarvest}\n\n`;
    }

    // Add reflection thoughts if available
    if (reflected) {
        message += `Reflection thoughts:\n${options.message}\n\n`;
    }

    message += `Now, you need to plan your next action.
<monologue>Thoughts of planning about the lake state, your harvest, reflection thoughts and the reasoning for your next action.</monologue>
<action type="plan_harvest">{ "amount": N }</action>

Remember to strictly use the correct <monologue>...</monologue> and <action type="plan_harvest">...</action> tags.
All these 4 tags must be used in correct order.`;

    return message;
}

// TODO: Add recent action history in above prompt
// === Recent Action History (Latest First) ===
// ${JSON.stringify(recentMemories, null, 2)}

// --- Reflection Phase Prompts ---

export function buildReflectSystemPrompt(): string {
    // Same as before - focuses the task
    return `You are an AI agent analyzing your performance and the simulation state in a fishing simulation. Your goal is long-term wealth (Total Fish Harvested) and lake sustainability. Focus on identifying trends, risks (especially collapse), opportunities for cooperation/efficiency, and potential strategy adjustments based ONLY on the provided state information. Provide concise, actionable insights.`;
}

export function buildReflectUserMessage(agent: BaseAgent): string {
    const constants = Constants;

    const lakeState = agent.getCompleteState().game.lake;
    const lastHarvest = agent.getScratchMemory().getFishingMemory().lastHarvestAmounts.get(agent.name) || 0;
    const totalHarvest = agent.getScratchMemory().getFishingMemory().totalHarvestAmounts.get(agent.name) || 0;

    const townhallHistory = agent.getScratchMemory().getTownhallHistory();
    const chatHistory = townhallHistory.messages.map(entry => `[${entry.agentName}]: ${entry.message}`).join('\n');

    return `You are ${agent.name}.

${CORE_RULES(constants)}

Lake State:
${JSON.stringify(lakeState, null, 2)}

Your Last Harvest:
${lastHarvest}

Your Total Harvest:
${totalHarvest}

=== Recent Townhall Discussion ===
${chatHistory}

**Reflection Task:** Analyze the available information. Provide concise insights regarding:
1.  **Lake Sustainability Estimate:** Based on known rules (Capacity, Threshold, Regeneration) and the *reported* total harvest from the last cycle, estimate the lake's health and the risk level for collapse. **Do not assume you know the current exact stock.**
2.  **Your Performance:** Your current Total Fish Harvested? Success in achieving planned harvest last cycle (compare plan to report)? Appropriateness of your previous plan(s) given the *reported* outcomes?
3.  **Group Dynamics:** Evidence of cooperation (e.g., reports align with discussions, low reported harvests)? Competition (e.g., high reported harvests, disagreements)? Free-riding (e.g., mismatch between discussion and reports)?
4.  **Strategy Adjustment:** Based on your estimated risk and group dynamics, suggest specific adjustments for your next PLANNING phase (e.g., "Estimate stock is low, plan to harvest only Z fish", "Propose a lower collective limit during Discussion", "Need to verify Agent Y's reports").

Output only your reflection insights in points.`;
}


// --- Behavior Action Prompts (Syntax Definitions Only) ---

// Note: These only DEFINE syntax. The system prompts now control which are shown/allowed.
export function buildFishingPrompt(fishingRange: number): string {
    return `<action type="cast_rod"></action> `;
}

export function buildPathfindingPrompt(townhallRange: number, locations: Record<string, any>): string {
    // LLM does not trigger pathfinding directly based on new feedback. Keep for potential future use or internal behaviour description.
    // We remove it from the list of available actions presented to the LLM in Planning/Discussion system prompts.
    // If needed for Harvest, add it there. For now, assume not needed as LLM action.
    // return `<action type="pathfindTo">{ "targetName": "...", "coordinates": {...} }</action> `;
    return ``;
}

export function buildSpeakPrompt(): string {
    // Return both syntaxes, but the main system prompts will only show the relevant one.
    return `<action type="speak">{"message": "..."}</action> <action type="townhall_speak">{"message": "..."}</action> `;
}

// --- Communication Phase Prompts ---
export function buildCommunicationPrompt(agent: BaseAgent, world: GameWorld): ChatCompletionMessageParam[] {
    const constants = Constants;
    return [
        {
            role: "system",
            content: `You are ${agent.name}, an AI agent in a multi-agent fishing environment.
${CORE_RULES(constants)}

During townhall discussions, you engage with other agents to discuss about fish harvesting.

STRICT RESPONSE FORMAT REQUIRED:
Your response MUST contain exactly two tags in this order:
1. <monologue>Your internal thoughts</monologue>
2. <speak>What you say to others</speak>

Example of correct format:
<monologue>I think I should ask the other agents about harvesting.</monologue>
<speak>Hey, let's talk about harvesting.</speak>

Rules:
- Always include BOTH tags
- Put your thoughts in <monologue> tags
- Put your spoken message in <speak> tags
- Never mix up the order of tags
- Never use these tags more than once
- Never include one tag inside another
- Never write messages outside these tags
`
        }
    ];
}

export function buildCommunicationUserPrompt(agent: BaseAgent, world: GameWorld, chatHistoryText: string, currentRetry: number = 0): ChatCompletionMessageParam {
    const fishingMemory = agent.getScratchMemory().getFishingMemory();
    const cycleHarvest = fishingMemory.harvestAmounts.get(agent.name) || 0;
    const totalHarvest = fishingMemory.totalHarvestAmounts.get(agent.name) || 0;
    const fishingSequenceInfo = getFishingSequenceInfo(agent, world);
    const lakeState = agent.getCompleteState().game.lake;

    return {
        role: "user",
        content: `Here's your current state and the discussion:

Your Harvest Information:
* Current Cycle Harvest: ${cycleHarvest} fish
* Total Harvest (all cycles): ${totalHarvest} fish

${fishingSequenceInfo}

Lake State:
${JSON.stringify(lakeState, null, 2)}

Current Discussion:
${chatHistoryText}

It's your turn to speak. Respond using the required format with both <monologue> and <speak> tags.
Example of correct format:
<monologue>I think I should ask the other agents about harvesting.</monologue>
<speak>Hey, let's talk about harvesting.</speak>

${currentRetry > 0 ? ' Make sure to follow the format exactly!' : ''}`
    };
}


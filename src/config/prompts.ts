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
**Lake Collapse:** If stock drops to **${constants.SIMULATION_CONFIG.LAKE_COLLAPSE_THRESHOLD}% of capacity or less** after harvest, the lake collapses **PERMANENTLY**. No more fish can be harvested, ending the simulation for everyone (failure).
**Regeneration:** Lake stock grows using a logistic growth model at the end of cycle considering the planning, harvest and discussion phases. Formula: newFish = r * currentStock * (1 - currentStock/capacity), where r=${constants.SIMULATION_CONFIG.LAKE_INTRINSIC_GROWTH_RATE}. The new stock will be currentStock + newFish, capped at capacity. No regeneration if collapsed.
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
    const world = agent.getGameWorld();

    // Get harvest information for all agents
    const allAgentsHarvestInfo = (world.agents || []).map(a => {
        const agentFishingMemory = a.getScratchMemory().getFishingMemory();
        return {
            name: a.name,
            lastHarvest: agentFishingMemory.lastHarvestAmounts.get(a.name) || 0,
            totalHarvest: agentFishingMemory.totalHarvestAmounts.get(a.name) || 0
        };
    });

    // Format all agents' harvest information
    const allAgentsHarvestText = allAgentsHarvestInfo
        .map(info => `* ${info.name}:
    - Last Harvest: ${info.lastHarvest} fish
    - Total Harvest: ${info.totalHarvest} fish`)
        .join('\n');

    // Build message sections
    let message = `You are ${agent.name}.\n${CORE_RULES(Constants)}\n\n`;

    message += `Lake State:\n${JSON.stringify(lakeState, null, 2)}\n\n`;
    message += `All Agents' Harvest Information:\n${allAgentsHarvestText}\n\n`;

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
    return `You are an AI agent analyzing your performance and the simulation state in a fishing simulation. Your task is to perform a comprehensive analysis that will inform your next planning phase. Think critically about all aspects that could impact your decision-making.

    Your analysis should be thorough yet focused on what YOU determine to be the most relevant factors for success. Consider:
    
    1. SITUATION ANALYSIS
       Analyze any aspects of the current state that you believe are crucial for decision-making. Think about both obvious and subtle factors that could affect outcomes.
    
    2. INSIGHTS & PATTERNS
       Identify any patterns, relationships, or insights you've discovered. Focus on what YOU find most significant, not just standard metrics.
    
    3. STRATEGIC EVALUATION
       Evaluate the effectiveness of various strategies and approaches you observe. Consider both successful and failed approaches.
    
    4. ACTIONABLE CONCLUSIONS
       Based on your analysis, what specific actions or strategies do you believe will be most effective? Support your conclusions with evidence from your analysis.

    Remember:
    - Think independently about what factors matter most
    - Support your insights with concrete evidence from the data
    - Focus on information that will directly impact your next decisions
    - Consider both immediate actions and long-term implications
    - Base analysis only on REPORTED data - never assume exact stock knowledge
    - Quantify insights where it adds value to your analysis`;
}

export function buildReflectUserMessage(agent: BaseAgent): string {
    const constants = Constants;

    const lakeState = agent.getCompleteState().game.lake;
    const world = agent.getGameWorld();

    // Get harvest information for all agents
    const allAgentsHarvestInfo = (world.agents || []).map(a => {
        const agentFishingMemory = a.getScratchMemory().getFishingMemory();
        return {
            name: a.name,
            lastHarvest: agentFishingMemory.lastHarvestAmounts.get(a.name) || 0,
            totalHarvest: agentFishingMemory.totalHarvestAmounts.get(a.name) || 0
        };
    });

    // Format all agents' harvest information
    const allAgentsHarvestText = allAgentsHarvestInfo
        .map(info => `* ${info.name}:
    - Last Harvest: ${info.lastHarvest} fish
    - Total Harvest: ${info.totalHarvest} fish`)
        .join('\n');

    const townhallHistory = agent.getScratchMemory().getTownhallHistory();
    const chatHistory = townhallHistory.messages.map(entry => `[${entry.agentName}]: ${entry.message}`).join('\n');

    return `You are ${agent.name}.

${CORE_RULES(constants)}

Lake State:
${JSON.stringify(lakeState, null, 2)}

All Agents' Harvest Information:
${allAgentsHarvestText}

=== Recent Townhall Discussion ===
${chatHistory}

**Reflection Task:** Analyze the available information. Provide concise insights regarding:
1.  **Lake Sustainability Estimate:** Based on known rules (Capacity, Threshold, Regeneration) and the *reported* total harvest from the last cycle, estimate the lake's health and the risk level for collapse. **Do not assume you know the current exact stock.**
2.  **Your Performance:** Your current Total Fish Harvested? Success in achieving planned harvest last cycle (compare plan to report)? Appropriateness of your previous plan(s) given the *reported* outcomes?
3.  **Group Dynamics:** Evidence of cooperation (e.g., reports align with discussions, low reported harvests)? Competition (e.g., high reported harvests, disagreements)? Free-riding (e.g., mismatch between discussion and reports)?
4.  **Strategy Adjustment:** Based on your estimated risk and group dynamics, suggest specific adjustments for your next PLANNING phase (e.g., "Estimate stock is low, plan to harvest only Z fish", "Acting or Avoiding the consensus from discussions").

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
    const fishingSequenceInfo = getFishingSequenceInfo(agent, world);
    const lakeState = agent.getCompleteState().game.lake;

    // Get harvest information for all agents
    const allAgentsHarvestInfo = (world.agents || []).map(a => {
        const agentFishingMemory = a.getScratchMemory().getFishingMemory();
        return {
            name: a.name,
            recentHarvest: agentFishingMemory.harvestAmounts.get(a.name) || 0,
            totalHarvest: agentFishingMemory.totalHarvestAmounts.get(a.name) || 0
        };
    });

    // Format all agents' harvest information
    const allAgentsHarvestText = allAgentsHarvestInfo
        .map(info => `* ${info.name}:
    - Recent Harvest: ${info.recentHarvest} fish
    - Total Harvest: ${info.totalHarvest} fish`)
        .join('\n');

    return {
        role: "user",
        content: `Here's your current state and the discussion:

All Agents' Harvest Information:
${allAgentsHarvestText}

${fishingSequenceInfo}

Lake State:
${JSON.stringify(lakeState, null, 2)}
You must consider the current lake state and possible lake re-generation when discussing with other agents.

Current Discussion:
${chatHistoryText}

It's your turn to speak. Respond using the required format with both <monologue> and <speak> tags.
Example of correct format:
<monologue>I think I should ask the other agents about harvesting.</monologue>
<speak>Hey, let's talk about harvesting.</speak>

${currentRetry > 0 ? ' Make sure to follow the format exactly!' : ''}`
    };
}

// --- Evaluation Prompts ---

export function buildPlanEvaluationPrompt(): string {
    return `You are an expert evaluator for agent responses in a fishing simulation game. Your task is to evaluate if a response follows the required format and contains meaningful planning content.

Required Format Rules:
1. Must contain <monologue>...</monologue> tag with thought process
2. Must contain <action type="plan_harvest">{"amount": N}</action> tag
3. Monologue must come before action tag
4. N must be a positive number within lake capacity

Content Evaluation Criteria:
1. Monologue should demonstrate strategic thinking about:
   - Current lake state estimation
   - Risk assessment
   - Consideration of other agents
   - Justification for harvest amount
2. The harvest amount should be reasonable given the context
3. The response should show awareness of lake sustainability

IMPORTANT: You must respond with ONLY a JSON object in this exact format (no backticks, no explanation):
{
    "accepted": true/false,
    "feedback": "Detailed feedback about why accepted/rejected",
    "score": 0.0-1.0 (only if accepted)
}`;
}

export function buildReflectEvaluationPrompt(): string {
    return `You are an expert evaluator for agent reflections in a fishing simulation game. Your task is to evaluate if a reflection contains meaningful analysis of the simulation state.

Content Evaluation Criteria:
1. Must include analysis of lake sustainability and health
2. Must evaluate agent's own performance and strategy
3. Must consider group dynamics and cooperation
4. Must propose concrete strategy adjustments
5. Analysis should be data-driven and specific
6. Insights should be actionable for future planning

The reflection does NOT need any specific XML tags or format, but should be clear and well-structured.

IMPORTANT: You must respond with ONLY a JSON object in this exact format (no backticks, no explanation):
{
    "accepted": true/false,
    "feedback": "Detailed feedback about why accepted/rejected",
    "score": 0.0-1.0 (only if accepted)
}`;
}


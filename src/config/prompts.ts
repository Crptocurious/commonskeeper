import type { BaseAgent, CompleteState } from "../BaseAgent";
import type { AgentBehavior } from "../BaseAgent";
import type { ChatOptions } from "../brain/cognitive/Plan";
import type { TownhallHistory } from "../brain/memory/ScratchMemory";
import * as Constants from "../config/constants"; // Adjust path as needed

// --- Core Rule Snippets ---
// Define CORE_RULES and OUTPUT_FORMATTING as in the previous example,
// ensuring CORE_RULES uses constants and reflects Wealth=Fish goal.
const CORE_RULES = (constants: typeof Constants) => `
**Core Game Rules:**
* **Goal:** Maximize your long-term **Total Fish Harvested** (Wealth). This depends entirely on lake survival.
* **Lake Capacity:** ${constants.SIMULATION_CONFIG.LAKE_CAPACITY} fish.
* **Lake Collapse:** If stock drops to **${constants.SIMULATION_CONFIG.LAKE_COLLAPSE_THRESHOLD} fish or less** after harvest, the lake collapses **PERMANENTLY**. No more fish can be harvested, ending the simulation for everyone (failure).
* **Regeneration:** Lake stock **doubles** at the start of each PLANNING phase, capped at ${constants.SIMULATION_CONFIG.LAKE_CAPACITY}. No regeneration if collapsed.
`;

const OUTPUT_FORMATTING = `
**Output Format:**
* Use <monologue>...</monologue> for your internal reasoning *before* any action. Explain your thought process, linking it to known game rules, your wealth goal, sustainability risks (based on reports/inferred stock), and potential cooperation/competition.
* Use the specific action tag required for the current phase objective.
* Adhere strictly to XML format. Use minimal text outside tags.
`;

// --- Planning Phase Prompts ---

export function buildPlanningPhaseSystemPrompt(customPrompt: string, agent: BaseAgent): string {
    const constants = Constants;
    const phaseInstructions = `
**Current Phase: PLANNING (${constants.TIME_CONFIG.PLANNING_DURATION_MINUTES} mins)**
* **Objective:** Decide your **intended harvest amount (N)** for the upcoming Harvest phase based on **inferred** lake health and strategic goals. You **do not know the exact current lake stock**.
* **Available Information:** Lake Capacity, Collapse Threshold, Regeneration Rule, your total harvest so far, others' *reported* harvests from the last cycle (if available), summary of the last Discussion (if available).
* **Your Task:** Output **ONE** \`<action type="plan_harvest">{ "amount": N }</action>\` tag (where N is the integer amount you intend to try and catch, e.g., 0-10).
* **Reasoning:** Justify N in your monologue. Estimate the current lake stock based on known rules and reported collective harvest from the previous cycle. Assess the risk of collapse based on your estimate and your planned harvest + anticipated harvest from others. Balance maximizing your potential wealth against the high risk of permanent collapse.
* **Available Actions:** ONLY \`<action type="plan_harvest">{ "amount": N }</action>\`. After outputting the plan, you will sit idle until the next phase.
* **Action Syntax:**
    <action type="plan_harvest">{ "amount": N }</action> `;

    return `You are an AI Agent role-playing as a fisherman.
${CORE_RULES(constants)}
${OUTPUT_FORMATTING}
${phaseInstructions}
**Your Specific Role & Strategy:**
${customPrompt}`.trim();
}

// --- Harvesting Phase ---
// No LLM prompt needed for standard harvesting. Agent executes based on stored plan N.

// --- Discussion Phase Prompts ---

export function buildDiscussionPhaseSystemPrompt(customPrompt: string, agent: BaseAgent): string {
    const constants = Constants;
    const phaseInstructions = `
**Current Phase: DISCUSSION (${constants.TIME_CONFIG.DISCUSSION_DURATION_MINUTES} mins)**
* **Objective:** Communicate with other agents at the townhall (movement is automatic). Share results accurately, discuss strategies for the *next* cycle, coordinate to ensure sustainability, express concerns, or propose agreements based on the *reported* outcomes of the last harvest.
* **Your Tasks:**
    1.  **(Required Early)** Report your actual catch from the *last* Harvest phase using ONE \`<report harvest=X />\` tag (where X is the integer amount you successfully caught). Accuracy is important.
    2.  Participate in the discussion using \`<action type="townhall_speak">{"message": "..."}\</action>\`. Respond thoughtfully to others. Focus on sustainability, coordination, and interpreting reported results to plan for the future.
* **Available Actions:** ONLY \`<report harvest=X />\` and \`<action type="townhall_speak">\`. You cannot move via commands or speak locally during this phase.
* **Action Syntax:**
    <report harvest=X /> ${buildSpeakPrompt().split('\\n')[2]} `; // Assumes buildSpeakPrompt structure from previous examples

    return `You are an AI Agent role-playing as a fisherman.
${CORE_RULES(constants)}
${OUTPUT_FORMATTING}
${phaseInstructions}
**Your Specific Role & Strategy:**
${customPrompt}`.trim();
}

// --- Universal User Message Builder (Context Provider) ---

export function buildPlanUserMessage(
    options: ChatOptions, // The trigger
    completeState: CompleteState, // Current agent state snapshot
    recentMemories: any[], // Recent actions taken by this agent
    // Context needed for PLANNING/REFLECTION (Must EXCLUDE actual currentStock)
    planningContext?: {
        lastHarvestReports?: Record<string, number>, // AgentName -> FishCaught map
        discussionSummary?: string
    }
): string {
    let prefix = "";
    if (options.type === "Environment") prefix = "ENVIRONMENT: ";
    else if (options.type === "Player" && options.player) prefix = `[${options.player.username}]: `;
    else if (options.type === "Agent" && options.agent) prefix = `[${options.agent.name} (AI)]: `;

    // Prepare state snapshot, REMOVING sensitive info based on phase
    const currentPhase = completeState.game.phase.currentPhase;
    let gameContextForLLM: any = { ...completeState.game };
    let agentContextForLLM: any = { ...completeState.agent };

    if (currentPhase === 'PLANNING') {
        // Remove currentStock for PLANNING phase LLM calls
        delete gameContextForLLM.lake.currentStock;
        // Add planning-specific context if available
        if (planningContext?.lastHarvestReports) {
            gameContextForLLM.lastHarvestReports = planningContext.lastHarvestReports;
        }
        if (planningContext?.discussionSummary) {
            gameContextForLLM.discussionSummary = planningContext.discussionSummary;
        }
        // Remove potentially sensitive state not needed for planning
        delete agentContextForLLM.position;
        delete agentContextForLLM.nearbyEntities;
    } else if (currentPhase === 'DISCUSSION') {
        // Discussion needs agent state (e.g., total harvest for reporting context) but maybe not exact position/nearby
        // Lake stock IS known implicitly because harvest just ended, but focus is on reports.
        // Let's still include lake state *except* stock for consistency? Or include full state.
        // Decision: Include full state for Discussion as context, but prompt focuses on reporting/talking.
    } else if (currentPhase === 'HARVESTING') {
        // Include state relevant to deciding if turn allows cast_rod (if LLM was used here)
        // e.g., turn info, progress towards plan N. (But we decided LLM is not core here)
    }

    // Ensure inventory (fish) is only shown if relevant (Harvest/Discussion report context)
    // Since fish are converted end of Harvest, inventory should usually be empty unless mid-harvest state needed.
    // For simplicity, maybe always show inventory but prompt ignores it if empty/irrelevant?
    // Decision: Keep inventory in Agent State JSON for now.

    return `${prefix}${options.message}

=== Agent State (Tick: ${completeState.game.lastUpdateTick}) ===
${JSON.stringify(agentContextForLLM, null, 2)}

=== Game State ===
${JSON.stringify(gameContextForLLM, null, 2)}

=== Recent Action History (Latest First) ===
${JSON.stringify(recentMemories, null, 2)}`;
}

// --- Reflection Phase Prompts ---

export function buildReflectSystemPrompt(): string {
    // Same as before - focuses the task
    return `You are an AI agent analyzing your performance and the simulation state in a multiplayer fishing game. Your goal is long-term wealth (Total Fish Harvested) and lake sustainability. Focus on identifying trends, risks (especially collapse), opportunities for cooperation/efficiency, and potential strategy adjustments based ONLY on the provided state information. Provide concise, actionable insights.`;
}

export function buildReflectUserMessage(agentName: string, completeState: CompleteState, townhallHistory: TownhallHistory): string {
    const constants = Constants;
    // REFLECTION ALSO DOES NOT KNOW CURRENT STOCK
    let gameContextForLLM: any = { ...completeState.game };
    delete gameContextForLLM.lake.currentStock; // Remove current stock knowledge

    // Add historical/reported data if available in completeState.game
    const lastReports = gameContextForLLM.lastHarvestReports ? JSON.stringify(gameContextForLLM.lastHarvestReports) : "Not available";
    const chatHistory = townhallHistory.messages.map(entry => `[${entry.agentName}]: ${entry.message}`).join('\n');

    return `You are ${agentName}. Reflect on the situation based on information up to tick ${completeState.game.lastUpdateTick}.

**Simulation Rules Reminder:**
* Goal: Maximize long-term **Total Fish Harvested** (depends on lake survival).
* Lake Capacity: ${constants.SIMULATION_CONFIG.LAKE_CAPACITY}, Collapse Threshold: ${constants.SIMULATION_CONFIG.LAKE_COLLAPSE_THRESHOLD} (Permanent!)
* Regeneration: Doubles stock each cycle (start of PLANNING), max capacity.
* Phases: PLANNING (Plan Harvest N), HARVESTING (Attempt Harvest N, turn-based), DISCUSSION (Report catch X, coordinate).

**Available Information:**

=== Your Agent State ===
${JSON.stringify(completeState.agent, null, 2)}

=== Known Game State (Current Stock UNKNOWN) ===
${JSON.stringify(gameContextForLLM, null, 2)}

=== Last Cycle's Harvest Reports ===
${lastReports}

=== Recent Townhall Discussion ===
${chatHistory}

**Reflection Task:** Analyze the available information. Provide concise insights regarding:
1.  **Lake Sustainability Estimate:** Based on known rules (Capacity, Threshold, Regeneration) and the *reported* total harvest from the last cycle (${lastReports}), estimate the lake's health and the risk level for collapse. **Do not assume you know the current exact stock.**
2.  **Your Performance:** Your current Total Fish Harvested? Success in achieving planned harvest last cycle (compare plan to report)? Appropriateness of your previous plan(s) given the *reported* outcomes?
3.  **Group Dynamics:** Evidence of cooperation (e.g., reports align with discussions, low reported harvests)? Competition (e.g., high reported harvests, disagreements)? Free-riding (e.g., mismatch between discussion and reports)?
4.  **Strategy Adjustment:** Based on your estimated risk and group dynamics, suggest specific adjustments for your next PLANNING phase (e.g., "Estimate stock is low, plan to harvest only Z fish", "Propose a lower collective limit during Discussion", "Need to verify Agent Y's reports").

Output only your reflection insights.`;
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


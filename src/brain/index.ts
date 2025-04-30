// Import modules for internal use
import { Plan } from './cognitive/Plan';
import { Execute } from './cognitive/Execute';
import { Communication } from './cognitive/Communication';
import { ScratchMemory } from './memory/ScratchMemory';

// Export all brain modules for easy imports

// Cognitive modules
export { Plan, type PlanResult } from './cognitive/Plan';
export { Execute } from './cognitive/Execute';
export { Communication } from './cognitive/Communication';

// Memory modules
export { ScratchMemory, type Memory, type LakeObservation, type AgentEnergyObservation } from './memory/ScratchMemory';

// Auxiliary type exports
export interface BrainOptions {
  agentId: string;
  systemPrompt: string;
}

// Factory function to create all brain components
export function createBrain(options: BrainOptions) {
  const { agentId, systemPrompt } = options;
  
  return {
    plan: new Plan(agentId),
    execute: new Execute(),
    communication: new Communication(agentId, systemPrompt),
    memory: new ScratchMemory(agentId),
  };
} 
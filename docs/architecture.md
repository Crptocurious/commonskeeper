# CommonsKeeper Architecture

This document outlines the architecture of the CommonsKeeper project, which appears to be an agent-based system for managing resources and interactions.

## Component Relationship Diagram

```mermaid
graph TD
    BaseAgent[BaseAgent.ts] --> Behaviors[Behaviors]
    BaseAgent --> Services[Services]
    BaseAgent --> Types[Types]
    BaseAgent --> Lake[Lake.ts]
    BaseAgent --> MetricsTracker[MetricsTracker.ts]
    
    subgraph Behaviors
        CommunicationBehavior[CommunicationBehavior.ts]
        FishingBehavior[FishingBehavior.ts]
        PlanningBehavior[PlanningBehavior.ts]
        PathfindingBehavior[PathfindingBehavior.ts]
        SpeakBehavior[SpeakBehavior.ts]
    end

    subgraph Types
        AgentState[AgentState.ts]
        GameState[GameState.ts]
    end

    subgraph Services
        UIService[UIService.ts]
    end

    Lake --> MetricsTracker
    Behaviors --> Types
    Services --> Types
```

## Class Diagram

```mermaid
classDiagram
    class BaseAgent {
        -behaviors: Behavior[]
        -state: AgentState
        +update()
        +getState()
        +setState()
    }
    
    class Behavior {
        <<interface>>
        +update()
        +initialize()
    }
    
    class AgentState {
        +position: Vector3
        +inventory: Item[]
        +status: string
    }
    
    class Lake {
        -metricsTracker: MetricsTracker
        +updateResources()
        +getResourceLevel()
    }
    
    class MetricsTracker {
        +trackMetric()
        +getMetrics()
        +generateReport()
    }
    
    BaseAgent --> Behavior
    BaseAgent --> AgentState
    BaseAgent --> Lake
    Lake --> MetricsTracker
```

## Sequence Diagram (Fishing Action)

```mermaid
sequenceDiagram
    participant Agent as BaseAgent
    participant Fishing as FishingBehavior
    participant Lake as Lake
    participant Metrics as MetricsTracker
    
    Agent->>Fishing: initiateFishing()
    Fishing->>Lake: checkResourceAvailability()
    Lake->>Metrics: trackResourceCheck()
    Lake-->>Fishing: resourceStatus
    
    alt Resources Available
        Fishing->>Lake: harvestResource()
        Lake->>Metrics: trackHarvest()
        Lake-->>Fishing: harvestResult
        Fishing-->>Agent: updateInventory()
    else No Resources
        Lake-->>Fishing: noResourcesAvailable
        Fishing-->>Agent: cancelFishing()
    end
```

## State Diagram (Agent States)

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Planning: New Task
    Planning --> Moving: Path Found
    Moving --> Fishing: At Location
    Moving --> Communicating: Meet Agent
    Fishing --> Idle: Task Complete
    Communicating --> Planning: New Information
    Planning --> Idle: No Tasks
    Fishing --> Planning: Resource Depleted
```

## Entity Relationship Diagram

```mermaid
erDiagram
    AGENT ||--o{ BEHAVIOR : has
    AGENT ||--|| AGENT_STATE : maintains
    AGENT ||--o{ INVENTORY_ITEM : contains
    LAKE ||--o{ RESOURCE : manages
    METRICS_TRACKER ||--o{ METRIC : tracks
    BEHAVIOR ||--|| BEHAVIOR_TYPE : "is of"
    
    AGENT {
        string id
        vector3 position
        string status
    }
    
    AGENT_STATE {
        string currentState
        number health
        number energy
    }
    
    LAKE {
        number resourceLevel
        string status
        number capacity
    }
```

## Flow Chart (Decision Making)

```mermaid
flowchart TD
    A[Start] --> B{Check State}
    B -->|Idle| C{Resources Needed?}
    B -->|Busy| D[Continue Current Task]
    C -->|Yes| E[Plan Resource Gathering]
    C -->|No| F{Other Agents Nearby?}
    E --> G[Navigate to Resource]
    F -->|Yes| H[Initiate Communication]
    F -->|No| I[Check Environment]
    G --> J[Gather Resources]
    H --> K[Exchange Information]
    I --> B
    J --> B
    K --> B
    D --> B
```

## Component Overview

### Core Components

1. **BaseAgent.ts**
   - Central agent implementation
   - Coordinates behaviors and services
   - Manages agent state and interactions

2. **Lake.ts**
   - Manages lake-related functionality
   - Likely handles resource management
   - Interacts with MetricsTracker

3. **MetricsTracker.ts**
   - Tracks system metrics and performance
   - Provides analytics and monitoring
   - Integrates with various components

### Behaviors

The system implements a behavior-based architecture with the following components:

1. **CommunicationBehavior.ts**
   - Handles agent communication protocols
   - Manages interaction between agents

2. **FishingBehavior.ts**
   - Implements fishing-related activities
   - Resource gathering mechanics

3. **PlanningBehavior.ts**
   - Handles strategic planning
   - Decision-making logic

4. **PathfindingBehavior.ts**
   - Navigation and movement logic
   - Path optimization

5. **SpeakBehavior.ts**
   - Manages agent speech/dialogue
   - Communication output

### Types

1. **AgentState.ts**
   - Defines agent state structure
   - Manages state transitions

2. **GameState.ts**
   - Global game state definitions
   - State management types

### Services

1. **UIService.ts**
   - User interface management
   - Display and interaction handling

## Architecture Patterns

The system follows several key architectural patterns:

1. **Behavior-Driven Design**
   - Modular behavior implementation
   - Separation of concerns through behavior classes

2. **Service-Oriented Architecture**
   - Dedicated services for specific functionalities
   - Clear service boundaries

3. **Type-Safe Implementation**
   - Strong typing through TypeScript
   - Clear state management

4. **Metrics and Monitoring**
   - Built-in performance tracking
   - System health monitoring

## Data Flow

1. The BaseAgent acts as the central coordinator
2. Behaviors implement specific functionalities
3. Services provide supporting features
4. Types ensure data consistency
5. MetricsTracker monitors system performance

## Logger Integration

The system includes a dedicated logger.ts for:
- System logging
- Debug information
- Error tracking
- Performance monitoring 
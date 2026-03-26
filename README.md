# NutritionAIagents

Backend for a conversational meal-planner agent built with Express, LangChain, and LangGraph.

This project is designed as a multi-step nutrition assistant that:
- collects user profile data
- calculates health metrics
- collects food preferences
- generates a weekly meal plan
- explains the plan and answers follow-up questions

This README is written for interview preparation. It explains the runtime architecture, design pattern choices, graph flow, state model, and the reasoning behind the implementation.

## 1. Problem Statement

The system solves a structured conversational workflow:

1. Ask the user for profile details
2. Ask for health measurements
3. Ask for food and location preferences
4. Generate a localized weekly meal plan
5. Explain the plan in simple, polite language
6. Stay available for follow-up questions about that plan

The challenge is that the conversation is multi-turn and stateful, so the backend must remember:
- what is already collected
- what is still missing
- which step is currently active
- when to stop and wait for the next user input

## 2. Tech Stack

- Node.js
- Express 5
- LangChain
- LangGraph
- OpenAI via `@langchain/openai`
- In-memory session store using JavaScript `Map`
- `dotenv` for configuration

Installed but not actively used in the runtime path:
- MongoDB / Mongoose
- ChromaDB

## 3. Project Structure

```text
.
├── app.js
├── server.js
├── graph.js
├── package.json
├── README.md
└── src
    ├── agents
    │   └── meal-palnner
    │       └── nodes
    │           ├── profileCollector.js
    │           ├── health-analyser.js
    │           ├── prefrence-detector.js
    │           ├── weekly-meal-generator.js
    │           ├── plan-explainer.js
    │           └── session-router.js
    ├── controllers
    │   └── meal-planner-agent.controller.js
    ├── routes
    │   └── meal-planner-agent.route.js
    ├── state
    │   └── agentState.js
    └── utils
        └── sessionStore.js
```

Note:
- the directory name is `meal-palnner` in the current codebase
- imports depend on that exact spelling

## 4. High-Level System Design

The system has five major layers:

### A. API Layer

Express exposes endpoints for:
- sending a chat message
- resetting a session
- a simple extension endpoint

### B. Controller Layer

The controller:
- receives the new user message
- loads prior session state from memory
- appends the message to conversation history
- invokes the LangGraph workflow
- saves the updated state
- returns a minimal response to the client

### C. Workflow Layer

LangGraph orchestrates the conversation as a graph of nodes.

The current graph uses:
- one internal supervisor/router node: `session_router`
- five worker nodes:
  - `profile_collector`
  - `health_analyser`
  - `preference_detector`
  - `plan_generator`
  - `plan_explainer`

### D. State Layer

All conversation state is centralized in `agentState.js`.

This includes:
- `messages`
- `profile`
- `health`
- `preferences`
- `mealPlan`
- `currentNode`
- `nodeComplete`
- session metadata

### E. Session Storage Layer

State is stored per `sessionId` in an in-memory `Map`.

That means:
- the server owns the conversation state
- the client is stateless
- restarting the server clears active sessions

## 5. Design Pattern Used

### Primary Pattern: Supervisor / Router Pattern

The project uses a supervisor-style LangGraph design.

The core idea:
- worker nodes do their own job only
- worker nodes return control back to a central router
- the router decides what runs next

This is implemented by:
- `session_router` as the supervisor
- all worker nodes routing back to it

Why this pattern is good:
- clean graph structure
- easy to debug
- easy to add logging or policy checks between stages
- avoids tangled worker-to-worker transitions
- makes resume behavior explicit

### Secondary Pattern: Stateful Step Executor

Each HTTP request triggers one graph invocation.

The system does not keep a long-running socket session inside LangGraph itself.
Instead:
- each request loads saved state
- runs the graph once
- persists the new state

This is a pragmatic backend design for chat APIs.

### Tertiary Pattern: Node Ownership

Each node owns one part of the state:
- `profile_collector` owns `profile`
- `health_analyser` owns `health`
- `preference_detector` owns `preferences`
- `plan_generator` owns `mealPlan`
- `plan_explainer` owns the final explanation messages

This reduces accidental state coupling.

## 6. Runtime Flow

### End-to-End Happy Path

```text
Client
  -> POST /api/agent/message
  -> Controller loads session state
  -> Graph starts at START
  -> START -> session_router
  -> session_router -> active worker node
  -> worker node updates state and returns
  -> worker -> session_router
  -> session_router either:
       - advances to next worker, or
       - ends and waits for the next user input
  -> Controller saves final state
  -> Controller returns latest assistant reply
```

### Workflow Sequence

The production sequence is:

1. `profile_collector`
2. `health_analyser`
3. `preference_detector`
4. `plan_generator`
5. `plan_explainer`

After that:
- `plan_explainer` remains the active conversational node
- future questions about the meal plan resume in `plan_explainer`

## 7. Graph Design

### Actual Graph Shape

The graph is intentionally supervisor-driven:

```text
START -> session_router

session_router -> profile_collector
session_router -> health_analyser
session_router -> preference_detector
session_router -> plan_generator
session_router -> plan_explainer
session_router -> END

profile_collector -> session_router
health_analyser -> session_router
preference_detector -> session_router
plan_generator -> session_router
plan_explainer -> session_router
```

### Why This Graph Is Cleaner

This avoids:
- direct worker-to-worker coupling
- multiple uncontrolled exits
- spaghetti-style routing

The router becomes the single place that decides:
- continue to the next stage
- resume the active stage
- stop and wait for the next user message

## 8. Router Logic

The router node is implemented in `session-router.js`.

Its responsibilities:
- inspect `currentNode`
- inspect `nodeComplete`
- inspect whether `mealPlan` exists
- decide the next target node or `END`

### Router Rules

If the worker is incomplete and has already asked the user something:
- stop at `END`
- wait for the next user message

If the worker completed successfully:
- move to the next stage

If the active node is `plan_explainer` and `mealPlan` exists:
- resume `plan_explainer`

This is the central control policy of the application.

## 9. Node-by-Node Flow

### 9.1 Profile Collector

File:
- [profileCollector.js](/d:/NutritionAIagents/src/agents/meal-palnner/nodes/profileCollector.js)

Collects:
- age
- gender
- activity level

Behavior:
- checks what is missing
- extracts one missing field from the latest user message
- asks the next question if needed
- marks itself complete when all profile fields are present

Output:
- updates `profile`
- returns assistant question or summary

### 9.2 Health Analyser

File:
- [health-analyser.js](/d:/NutritionAIagents/src/agents/meal-palnner/nodes/health-analyser.js)

Collects:
- weight
- height

Calculates:
- BMI
- BMI category
- BMR
- estimated daily calories

Behavior:
- extracts numeric input using both heuristics and LLM parsing
- asks for missing measurement if needed
- computes health metrics once both inputs exist

Output:
- updates `health`
- returns assistant question or summary

### 9.3 Preference Detector

File:
- [prefrence-detector.js](/d:/NutritionAIagents/src/agents/meal-palnner/nodes/prefrence-detector.js)

Collects:
- country
- state
- diet style
- allergies
- cuisine preference
- disliked foods

Behavior:
- enforces all required preference fields
- handles special replies like `none` for allergies/disliked foods
- uses both local heuristics and LLM extraction

Output:
- updates `preferences`
- returns assistant question or summary

### 9.4 Weekly Meal Generator

File:
- [weekly-meal-generator.js](/d:/NutritionAIagents/src/agents/meal-palnner/nodes/weekly-meal-generator.js)

Generates:
- a 7-day meal plan
- estimated daily nutrition values

Meal plan structure includes:
- breakfast
- lunch
- dinner
- snack
- nutrition:
  - calories
  - protein
  - carbs
  - fat

Behavior:
- reads profile, health, and preference state
- creates a localized meal plan using country and state
- persists the result in `mealPlan`

Output:
- updates `mealPlan`
- no unnecessary user-facing final explanation on success

### 9.5 Plan Explainer

File:
- [plan-explainer.js](/d:/NutritionAIagents/src/agents/meal-palnner/nodes/plan-explainer.js)

Responsibilities:
- explain the generated meal plan in polite Indian-style motivational language
- answer follow-up questions about the saved meal plan

Modes:
- `initial`: explain the full plan
- `follow_up`: answer user questions based on saved state

Behavior:
- guarded fallback if `mealPlan` is missing
- remains active after first explanation

Output:
- assistant explanation or answer

## 10. State Model

Defined in:
- [agentState.js](/d:/NutritionAIagents/src/state/agentState.js)

### Important State Fields

#### `messages`
Conversation history for the session.

#### `profile`
```json
{
  "age": null,
  "gender": null,
  "activityLevel": null
}
```

#### `health`
```json
{
  "weight": null,
  "height": null,
  "bmi": null,
  "bmr": null,
  "dailyCalories": null,
  "bmiCategory": null
}
```

#### `preferences`
```json
{
  "country": null,
  "state": null,
  "dietStyle": null,
  "allergies": null,
  "cuisinePreference": null,
  "dislikedFoods": null
}
```

#### `mealPlan`
Holds the generated weekly meal plan JSON.

#### `currentNode`
Tracks which worker should resume next.

#### `nodeComplete`
Signals whether the last worker finished its current stage and handed control back for progression.

## 11. API Design

### `POST /api/agent/message`

Main chat endpoint.

Example request:

```json
{
  "message": "I am 26, female, and active",
  "userId": "user-1",
  "sessionId": "session-1"
}
```

Minimal response shape:

```json
{
  "success": true,
  "response": "Please provide your weight in kilograms.",
  "currentNode": "health_analyser",
  "nodeComplete": false
}
```

If a meal plan exists, `mealPlan` is included.

### `POST /api/agent/reset`

Resets the in-memory session so the same user can restart with fresh data.

Example request:

```json
{
  "sessionId": "session-1",
  "userId": "user-1"
}
```

Example response:

```json
{
  "success": true,
  "response": "Session reset successfully. You can start again with new data.",
  "currentNode": "profile_collector",
  "nodeComplete": false
}
```

### `POST /api/agent/extension`

Auxiliary endpoint currently used as a stub.

## 12. Session Management

File:
- [sessionStore.js](/d:/NutritionAIagents/src/utils/sessionStore.js)

Implementation:
- simple in-memory `Map`

Key:
- `sessionId`

Value:
- full graph state

### Pros

- extremely simple
- fast for local development
- easy to reason about during prototyping

### Cons

- data is lost on server restart
- not horizontally scalable
- not suitable for production multi-instance deployment

### Interview Talking Point

If asked how to productionize this:
- replace `Map` with Redis or a database-backed session store
- add TTL and cleanup policy
- persist conversation state and audit logs

## 13. Why the Current Design Is Good for Interviews

This project demonstrates:
- multi-turn conversational state management
- orchestration using LangGraph
- separation of controller, state, workflow, and node logic
- a supervisor pattern instead of ad hoc chaining
- practical handling of extraction ambiguity using heuristics plus LLMs
- conversation continuity through `sessionId`

It is much stronger in an interview than a single-prompt demo because it shows:
- system design thinking
- state ownership
- runtime control logic
- error handling and fallback design

## 14. Key Tradeoffs You Should Be Ready to Explain

### Why use LangGraph?

Because this is not a single-shot prompt. It is a stateful workflow where:
- different stages own different data
- progress depends on what has already been collected
- the system must resume cleanly over multiple API calls

### Why use a router node?

Because it centralizes control.

Without a router:
- workers decide transitions directly
- the graph becomes tangled
- adding logging, policy, or instrumentation between steps becomes harder

### Why keep the client stateless?

Because server-owned state is more reliable for:
- multi-turn workflows
- session continuity
- preventing client-side tampering with agent state

### Why combine heuristics with LLM extraction?

Because user replies like:
- `none`
- `55`
- `170 cm`

are often better handled by deterministic parsing than by sending everything to the model.

### Why keep `plan_explainer` conversational?

Because once the meal plan exists, the user usually wants follow-up help like:
- “Can I swap breakfast?”
- “Why is this plan good for me?”
- “Can you make it more South Indian?”

So the system keeps the final node active instead of ending the conversation permanently.

## 15. Known Limitations

Current limitations include:
- in-memory session storage only
- no request validation middleware
- no schema validation for LLM JSON outputs
- no automated tests yet
- no authentication
- no persistence or observability stack
- no retry or timeout policy around model failures

These are acceptable for a prototype, but they are the first areas to harden for production.

## 16. How to Explain This in an Interview

Use this short summary:

> This is a stateful conversational meal-planner backend built with Express and LangGraph. I modeled the workflow as a supervisor graph, where a central router decides which worker node runs next based on persisted session state. Each worker owns a specific slice of state such as profile, health, preferences, or meal plan. The system supports multi-turn collection, structured progression, weekly plan generation, and a conversational explainer for follow-up questions. The current prototype uses an in-memory session store, but the design is ready to move to Redis or database-backed persistence for production.

## 17. Local Run

### Install

```bash
npm install
```

### Environment

Create `.env`:

```env
OPENAI_API_KEY=your_openai_key
PORT=5000
```

### Run server

```bash
npm run dev
```

or

```bash
npm start
```

### Optional graph test

```bash
node graph.js
```

## 18. Final Summary

This project is a multi-step conversational backend for nutrition planning. The strongest architectural idea in the codebase is the supervisor-style LangGraph design, where a central router controls progression and worker nodes remain focused on one responsibility each. That makes the workflow easier to scale, easier to explain, and much stronger as an interview project than a simple chatbot or single-prompt API.

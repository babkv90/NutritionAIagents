# NutritionAIagents

Node.js backend for a meal-planner conversational agent built with Express, LangChain, and LangGraph. The current implementation exposes an HTTP API, keeps conversation state in memory per session, and runs a LangGraph workflow with a single active node: `profile_collector`.

## Tech Stack

- Node.js with native ESM
- Express 5 for the HTTP server
- LangChain for prompt composition and OpenAI model access
- LangGraph for stateful workflow orchestration
- In-memory `Map` session store for per-session conversation state
- `dotenv` for local environment loading

Installed but not yet active in the runtime flow:

- `mongodb`, `mongoose`
- `chromadb`

## Project Structure

```text
.
├── app.js
├── server.js
├── graph.js
├── package.json
└── src
    ├── agents
    │   ├── graph.js
    │   └── meal-palnner
    │       └── nodes
    │           └── profileCollector.js
    ├── controllers
    │   └── meal-planner-agent.controller.js
    ├── routes
    │   └── meal-planner-agent.route.js
    ├── state
    │   └── agentState.js
    └── utils
        └── sessionStore.js
```

Note: the folder name is currently `meal-palnner`, not `meal-planner`. The code imports that exact path.

## Runtime Architecture

### 1. HTTP Layer

[server.js](d:/NutritionAIagents/server.js) starts the Express app from [app.js](d:/NutritionAIagents/app.js).

- `server.js` loads env variables and listens on `PORT` or `5000`
- `app.js` enables CORS and JSON parsing
- `app.js` mounts the agent routes at `/api/agent`
- `app.js` also exposes `GET /health`

### 2. Route Layer

[meal-planner-agent.route.js](d:/NutritionAIagents/src/routes/meal-planner-agent.route.js) defines:

- `POST /api/agent/message`

This route forwards the request to the controller.

### 3. Controller Layer

[meal-planner-agent.controller.js](d:/NutritionAIagents/src/controllers/meal-planner-agent.controller.js) is the orchestration point between HTTP and the graph.

It:

1. Accepts `message`, `userId`, and `sessionId`
2. Loads any existing conversation state from the session store
3. Builds the next graph input state
4. Calls `agent.invoke(inputState)`
5. Saves the returned state back to the session store
6. Returns a simplified JSON response to the client

Important design choice:

- The client sends the new user message, but the server owns the session state
- The full graph state is not returned to the client
- The controller returns only the latest assistant reply and a few state snapshots

### 4. Session State Layer

[sessionStore.js](d:/NutritionAIagents/src/utils/sessionStore.js) stores agent state in a process-local `Map`.

Characteristics:

- Key: `sessionId`
- Value: full graph state object
- Persistence: none
- Scope: single server process only

Implications:

- restarting the server loses all active sessions
- the app is not horizontally scalable in its current form
- memory usage grows with active sessions and conversation history

### 5. Workflow Layer

[graph.js](d:/NutritionAIagents/graph.js) defines the LangGraph workflow.

Current graph:

- one registered node: `profile_collector`
- entry point: `profile_collector`
- terminal behavior: every invoke ends after the node returns

This means the graph is being used as a stateful step executor, not as a long-running internal loop. The loop across multiple user turns is handled by the controller:

- user sends message
- controller loads previous state
- graph runs once
- controller saves updated state
- next user message triggers the next graph invocation

This is a reasonable pattern for chat APIs because each HTTP request maps to exactly one graph run.

### 6. Agent State Model

[agentState.js](d:/NutritionAIagents/src/state/agentState.js) defines shared channels used by LangGraph:

- `messages`
- `profile`
- `health`
- `preferences`
- `mealPlan`
- `ragInsight`
- `currentNode`
- `nodeComplete`
- `userId`
- `sessionId`
- `isFirstSession`

The file also defines:

- node name constants in `NODES`
- ordered workflow metadata for future nodes
- `getInitialState(userId, sessionId)`

Architecturally, this is the central schema for the agent.

### 7. Node Layer

[profileCollector.js](d:/NutritionAIagents/src/agents/meal-palnner/nodes/profileCollector.js) contains the only active node today.

Responsibilities:

- inspect collected profile fields
- ask for the next missing field
- extract a field from the latest user message
- update profile state
- mark the node complete once all profile fields are collected

The node currently manages three profile fields:

- `age`
- `gender`
- `activityLevel`

Internally it uses two prompt pipelines:

- ask-next-question prompt
- extract-data prompt

Both are composed using LangChain runnables:

- `PromptTemplate`
- `ChatOpenAI`
- `StringOutputParser`

## Request Flow

### Incoming Message Flow

1. Client sends `POST /api/agent/message`
2. Express route forwards to `handleAgentMessage`
3. Controller loads prior state from `sessionStore`
4. Controller appends the new user message to `messages`
5. Controller invokes the LangGraph `agent`
6. Graph runs `profileCollectorNode`
7. Node either:
   - asks the next profile question, or
   - extracts data and updates the profile, or
   - marks profile collection complete
8. Controller saves the returned state back into `sessionStore`
9. Controller responds with:
   - `success`
   - `response`
   - `currentNode`
   - `nodeComplete`
   - `profile`
   - `mealPlan`

### First Message vs Later Messages

First session message:

- no existing session state is found
- controller creates a fresh state object
- graph runs with that new state

Later session messages:

- previous state is loaded from memory
- new user message is appended
- graph continues from saved state

## API Surface

### Health Check

`GET /health`

Example response:

```json
{
  "status": "ok",
  "message": "Server is running"
}
```

### Agent Message Endpoint

`POST /api/agent/message`

Example request:

```json
{
  "message": "I am 28",
  "userId": "user-123",
  "sessionId": "session-abc"
}
```

Example response shape:

```json
{
  "success": true,
  "response": "What is your gender?",
  "currentNode": "profile_collector",
  "nodeComplete": false,
  "profile": {
    "age": 28,
    "gender": null,
    "activityLevel": null
  },
  "mealPlan": null
}
```

## How To Run

### Prerequisites

- Node.js 20+
- OpenAI API key available in `.env`

### Environment

Create `.env` with at least:

```env
OPENAI_API_KEY=your_key_here
PORT=5000
```

### Install

```bash
npm install
```

### Start

Development:

```bash
npm run dev
```

Production-style local run:

```bash
npm start
```

Direct graph test:

```bash
node graph.js
```

## Current Architecture Assessment

### What is solid

- Clear separation between HTTP, controller, workflow, state, and node logic
- Good foundation for extending into a multi-node agent
- Server-side session ownership is the correct direction for conversational workflows
- LangGraph state channels are defined centrally, which reduces state drift

### What is incomplete

- Only one workflow node is active
- `health`, `preferences`, and `mealPlan` paths are defined in state but not implemented
- Session persistence is in-memory only
- No request validation layer
- No tests
- No database integration despite installed packages
- No observability beyond console logs

### Architectural Risks

- Session loss on restart because state is stored in RAM
- Single-process memory growth as chat histories accumulate
- LLM-based extraction currently depends on prompt quality and raw JSON parsing
- No durable queue, retry, or timeout handling around model calls
- No schema validation on API input or LLM output

## Suggested Next Steps

1. Add validation for `message`, `userId`, and `sessionId` at the controller boundary.
2. Replace the in-memory session store with Redis or MongoDB-backed persistence.
3. Add structured parsing for extraction outputs instead of free-form JSON parsing.
4. Implement the remaining nodes:
   - `health_analyser`
   - `preference_detector`
   - `plan_generator`
   - `plan_explainer`
5. Add integration tests for the controller and graph flow.
6. Add consistent logging and error metadata for failed LLM calls.

## Summary

This project is currently a session-based conversational backend for a nutrition assistant. The production shape is already visible: Express handles requests, the controller manages turn-by-turn state, LangGraph encapsulates workflow execution, and nodes perform focused reasoning tasks. Right now the implementation is in an early but coherent stage, centered around profile collection as the first step in a larger meal-planning agent pipeline.

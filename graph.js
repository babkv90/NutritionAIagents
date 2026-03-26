import "dotenv/config"
import { pathToFileURL } from "node:url"
import { StateGraph, START } from "@langchain/langgraph"
import { AgentState, NODES, getInitialState } from "./src/state/agentState.js"
import { profileCollectorNode } from "./src/agents/meal-palnner/nodes/profileCollector.js"
import { healthAnalyserNode } from "./src/agents/meal-palnner/nodes/health-analyser.js"
import { preferenceDetectorNode } from "./src/agents/meal-palnner/nodes/prefrence-detector.js"
import { weeklyMealGeneratorNode } from "./src/agents/meal-palnner/nodes/weekly-meal-generator.js"
import { planExplainerNode } from "./src/agents/meal-palnner/nodes/plan-explainer.js"
import {
    SESSION_ROUTER,
    sessionRouterNode,
    getSessionRouterTarget,
} from "./src/agents/meal-palnner/nodes/session-router.js"

const workflow = new StateGraph({
    channels: AgentState.channels,
})

workflow.addNode(SESSION_ROUTER, sessionRouterNode)
workflow.addNode(NODES.PROFILE_COLLECTOR, profileCollectorNode)
workflow.addNode(NODES.HEALTH_ANALYSER, healthAnalyserNode)
workflow.addNode(NODES.PREFERENCE_DETECTOR, preferenceDetectorNode)
workflow.addNode(NODES.PLAN_GENERATOR, weeklyMealGeneratorNode)
workflow.addNode(NODES.PLAN_EXPLAINER, planExplainerNode)

workflow.addEdge(START, SESSION_ROUTER)
workflow.addConditionalEdges(SESSION_ROUTER, getSessionRouterTarget)

workflow.addEdge(NODES.PROFILE_COLLECTOR, SESSION_ROUTER)
workflow.addEdge(NODES.HEALTH_ANALYSER, SESSION_ROUTER)
workflow.addEdge(NODES.PREFERENCE_DETECTOR, SESSION_ROUTER)
workflow.addEdge(NODES.PLAN_GENERATOR, SESSION_ROUTER)
workflow.addEdge(NODES.PLAN_EXPLAINER, SESSION_ROUTER)

export const agent = workflow.compile()

export const testGraph = async () => {
    console.log("Graph compiled successfully")
    console.log("Nodes registered:", [
        SESSION_ROUTER,
        NODES.PROFILE_COLLECTOR,
        NODES.HEALTH_ANALYSER,
        NODES.PREFERENCE_DETECTOR,
        NODES.PLAN_GENERATOR,
        NODES.PLAN_EXPLAINER,
    ])
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await testGraph()

    const initialState = getInitialState("local-user", "local-session")
    const result = await agent.invoke(initialState)

    console.log("\nAgent result:")
    console.dir(result, { depth: null })
}

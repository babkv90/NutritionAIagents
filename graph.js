import "dotenv/config"
import { pathToFileURL } from "node:url"
import { StateGraph, END } from "@langchain/langgraph"
import { AgentState, NODES, getInitialState } from "./src/state/agentState.js"
import {profileCollectorNode} from "./src/agents/meal-palnner/nodes/profileCollector.js"

const workflow = new StateGraph({
    channels: AgentState.channels,
})

workflow.addNode(NODES.PROFILE_COLLECTOR, profileCollectorNode)
workflow.setEntryPoint(NODES.PROFILE_COLLECTOR)

workflow.addConditionalEdges(
    NODES.PROFILE_COLLECTOR,
    (state) => {
        if (state.nodeComplete) {
            return END   // profile done → end this invoke
        }
        return END       // profile not done → also end
                         // controller will call again next message
    }
)

export const agent = workflow.compile()

export const testGraph = async () => {
    console.log("Graph compiled successfully")
    console.log("Nodes registered:", [NODES.PROFILE_COLLECTOR])
}



if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await testGraph()

    const initialState = getInitialState("local-user", "local-session")
    const result = await agent.invoke(initialState)

    console.log("\nAgent result:")
    console.dir(result, { depth: null })
}


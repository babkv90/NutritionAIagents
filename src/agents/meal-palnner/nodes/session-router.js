import { END } from "@langchain/langgraph"
import { NODES } from "../../../state/agentState.js"

export const SESSION_ROUTER = "session_router"

const getResumeNode = (state) => {
    if (state?.nodeComplete) {
        if (state?.currentNode === NODES.PROFILE_COLLECTOR) {
            return NODES.HEALTH_ANALYSER
        }

        if (state?.currentNode === NODES.HEALTH_ANALYSER) {
            return NODES.PREFERENCE_DETECTOR
        }

        if (state?.currentNode === NODES.PREFERENCE_DETECTOR) {
            return NODES.PLAN_GENERATOR
        }

        if (state?.currentNode === NODES.PLAN_GENERATOR) {
            return state?.mealPlan ? NODES.PLAN_EXPLAINER : NODES.PLAN_GENERATOR
        }
    }

    if (state?.currentNode === NODES.HEALTH_ANALYSER) {
        return NODES.HEALTH_ANALYSER
    }

    if (state?.currentNode === NODES.PREFERENCE_DETECTOR) {
        return NODES.PREFERENCE_DETECTOR
    }

    if (state?.currentNode === NODES.PLAN_GENERATOR) {
        return NODES.PLAN_GENERATOR
    }

    if (state?.currentNode === NODES.PLAN_EXPLAINER && state?.mealPlan) {
        return NODES.PLAN_EXPLAINER
    }

    return NODES.PROFILE_COLLECTOR
}

const shouldWaitForUserInput = (state) => {
    if (state?.nodeComplete) {
        return false
    }

    const lastMessage = state?.messages?.at(-1)
    return lastMessage?.role === "assistant"
}

export function sessionRouterNode(state) {
    return {
        currentNode: getResumeNode(state),
    }
}

export function getSessionRouterTarget(state) {
    if (shouldWaitForUserInput(state)) {
        return END
    }

    return getResumeNode(state)
}

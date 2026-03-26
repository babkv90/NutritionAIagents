// server/src/controllers/agent.controller.js
import { agent }        from "../../graph.js"
import { sessionStore } from "../utils/sessionStore.js"
import { getInitialState } from "../state/agentState.js"

const buildClientResponse = ({ response, currentNode, nodeComplete, mealPlan }) => {
    const payload = {
        success: true,
        response,
        currentNode,
        nodeComplete,
    }

    if (mealPlan) {
        payload.mealPlan = mealPlan
    }

    return payload
}

export const handleAgentMessage = async (req, res) => {
    try {
        const { message, userId, sessionId } = req.body
        // ← NOTICE: no more currentState from client

      

        // Step 1 — Load existing state from server
        // Client does NOT need to send state anymore
        const existingState = sessionStore.get(sessionId)
        console.log("▶ Existing state found:", !!existingState)

        // Step 2 — Build input state
        const inputState = existingState
            ? {
                // Session exists — add new message to history
                ...existingState,
                messages: [
                    ...existingState.messages,
                    { role: "user", content: message }
                ],
                nodeComplete: false
            }
            : {
                // New session — start fresh
                messages: [
                    { role: "user", content: message }
                ],
                profile: {
                    age:           null,
                    gender:        null,
                    activityLevel: null
                },
                health: {
                    weight:        null,
                    height:        null,
                    bmi:           null,
                    bmr:           null,
                    dailyCalories: null,
                    bmiCategory:   null
                },
                preferences:  {
                    country:           null,
                    state:             null,
                    dietStyle:         null,
                    allergies:         null,
                    cuisinePreference: null,
                    dislikedFoods:     null
                },
                mealPlan:     null,
                currentNode:  "profile_collector",
                nodeComplete: false,
                userId,
                sessionId
            }


        // Step 3 — Run agent
        const result = await agent.invoke(inputState)

        // Step 4 — Save updated state to server
        // Client does NOT need to store this anymore
        sessionStore.save(sessionId, result)

        // Step 5 — Send SIMPLE response to client
        // No more sending full updatedState
        res.json(buildClientResponse({
            response: result.messages.at(-1)?.content,
            currentNode: result.currentNode,
            nodeComplete: result.nodeComplete,
            mealPlan: result.mealPlan || null,
        }))

    } catch (error) {
        console.error("❌ Error:", error.message)
        res.status(500).json({ 
            success: false, 
            error: error.message 
        })
    }
}



export const extensionCall = async (req, res) => {
    try {
        var contactData = req.body
        console.log("Received contact data:", contactData)
        res.json({ success: true }) // Acknowledge receipt of data
        // Here you would add logic to handle the contact data, 
        // such as saving it to a database or sending an email.
    }    
    catch (error) {
        res.status(500).json({ success: false, error: error.message })
    }
}

export const resetAgentSession = async (req, res) => {
    try {
        const { sessionId, userId } = req.body

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: "sessionId is required",
            })
        }

        sessionStore.delete(sessionId)

        const freshState = getInitialState(userId ?? null, sessionId)

        return res.json(buildClientResponse({
            response: "Session reset successfully. You can start again with new data.",
            currentNode: freshState.currentNode,
            nodeComplete: freshState.nodeComplete,
            mealPlan: freshState.mealPlan,
        }))
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message,
        })
    }
}

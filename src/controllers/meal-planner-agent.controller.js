// server/src/controllers/agent.controller.js
import { agent }        from "../../graph.js"
import { sessionStore } from "../utils/sessionStore.js"

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
                health:       {},
                preferences:  {},
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
        res.json({
            success:      true,
            response:     result.messages.at(-1)?.content,
            currentNode:  result.currentNode,
            nodeComplete: result.nodeComplete,
            profile:      result.profile,
            mealPlan:     result.mealPlan || null
        })

    } catch (error) {
        console.error("❌ Error:", error.message)
        res.status(500).json({ 
            success: false, 
            error: error.message 
        })
    }
}
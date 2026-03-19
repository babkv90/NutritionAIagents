// server/src/utils/sessionStore.js

// Simple in-memory store
// Key = sessionId, Value = full agent state
const sessions = new Map()

export const sessionStore = {

    // Save state after every agent call
    save: (sessionId, state) => {
        sessions.set(sessionId, state)
       
    },

    // Load state before every agent call
    get: (sessionId) => {
        return sessions.get(sessionId) || null
    },

    // Clear session when conversation is done
    delete: (sessionId) => {
        sessions.delete(sessionId)
        console.log(`🗑️ Session deleted: ${sessionId}`)
    },

    // Check if session exists
    exists: (sessionId) => {
        return sessions.has(sessionId)
    }
}
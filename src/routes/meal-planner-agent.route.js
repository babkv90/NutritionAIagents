// server/src/routes/agent.routes.js
import express               from "express"
import { handleAgentMessage } from "../controllers/meal-planner-agent.controller.js"
import { extensionCall }       from "../controllers/meal-planner-agent.controller.js"
import { resetAgentSession }   from "../controllers/meal-planner-agent.controller.js"
const router = express.Router()

// POST http://localhost:5000/api/agent/message
router.post("/message", handleAgentMessage)
router.post("/reset", resetAgentSession)
router.post("/extension", extensionCall)

export default router

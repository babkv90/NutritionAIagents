// server/app.js
import "dotenv/config"
import express     from "express"
import cors        from "cors"
import agentRoutes from "./src/routes/meal-planner-agent.route.js"

const app = express()

app.use(cors())
app.use(express.json())

// Agent routes
app.use("/api/agent", agentRoutes)

// Health check — test server is running
app.get("/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running" })
})

export default app
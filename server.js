// server/server.js
import "dotenv/config"
import app from "./app.js"

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`)
})

app.get('/', (req, res) => res.json({message : 'Hello Agents'}));
import "dotenv/config"
import { ChatOpenAI } from "@langchain/openai"
import { PromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"

// ── Model ─────────────────────────────────────────────
const llm = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0,
})  

// ── Prompt 1 — Analyze Health ───────────────────────────
// FIX: Keep variable names SIMPLE
// FIX: No special characters around variable names
// FIX: Variables must EXACTLY match invoke() keys  

const analyzeHealthPrompt = PromptTemplate.fromTemplate(
    `You are a helpful nutrition assistant. 
    Analyze this health information and determine if there are any concerns that should be addressed in a meal plan.
    Health information:{weight}, {height}, {medicalConditions}, {dietaryRestrictions}`)


const analyzeHealthChain = analyzeHealthPrompt
    .pipe(llm)
    .pipe(new StringOutputParser()) 


const result = await analyzeHealthChain.invoke({
    weight: "70kg",
    height: "175cm",
    medicalConditions: "none",
    dietaryRestrictions: "vegetarian"
})  
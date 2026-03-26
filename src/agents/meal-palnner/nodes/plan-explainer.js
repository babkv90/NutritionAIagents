import "dotenv/config"
import { ChatOpenAI } from "@langchain/openai"
import { PromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"

const llm = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0.3,
})

const explainMealPlanPrompt = PromptTemplate.fromTemplate(
    `You are a polite Indian nutrition coach.

    Mode: {mode}

    Instructions:
    - Use simple English.
    - Be practical, warm, and concise.
    - Base the answer only on the user profile, preferences, health data, and meal plan below.
    - If mode is "initial", explain why the plan suits the user, briefly mention calories and nutrition balance, and end with one short motivating line.
    - If mode is "follow_up", answer the user's specific question clearly using the meal plan context. If the question is unclear, ask one short clarifying question.
    - Do not invent foods or facts not supported by the meal plan.

    User profile:
    Age: {age}
    Gender: {gender}
    Activity level: {activityLevel}

    Health:
    Weight: {weight} kg
    Height: {height} cm
    BMI: {bmi}
    Daily calories: {dailyCalories}

    Preferences:
    Country: {country}
    State: {state}
    Diet style: {dietStyle}
    Allergies: {allergies}
    Cuisine preference: {cuisinePreference}
    Disliked foods: {dislikedFoods}

    User follow-up question:
    {userQuestion}

    Meal plan JSON:
    {mealPlan}`
)

const explainMealPlanChain = explainMealPlanPrompt
    .pipe(llm)
    .pipe(new StringOutputParser())

const createAssistantMessage = (content) => ({
    role: "assistant",
    content,
    nodeId: "plan_explainer",
})

const formatListForPrompt = (value) => {
    if (value === null || value === undefined) return "none"
    if (!Array.isArray(value)) return String(value)
    if (value.length === 0) return "none"
    return value.join(", ")
}

const getLatestNonEmptyUserMessage = (messages) => (
    messages
        .filter((message) => message.role === "user" && String(message.content ?? "").trim())
        .at(-1) || null
)

const hasPriorExplainerReply = (messages) => (
    messages.some((message) => message.role === "assistant" && message.nodeId === "plan_explainer")
)

export async function planExplainerNode(state) {
    if (!state.mealPlan) {
        return {
            nodeComplete: false,
            currentNode: "plan_explainer",
            messages: [createAssistantMessage("I need the meal plan before I can explain it.")],
        }
    }

    const latestUserMessage = getLatestNonEmptyUserMessage(state.messages || [])
    const mode = hasPriorExplainerReply(state.messages || []) ? "follow_up" : "initial"

    const explanation = await explainMealPlanChain.invoke({
        mode,
        age: state.profile?.age ?? "unknown",
        gender: state.profile?.gender ?? "unknown",
        activityLevel: state.profile?.activityLevel ?? "unknown",
        weight: state.health?.weight ?? "unknown",
        height: state.health?.height ?? "unknown",
        bmi: state.health?.bmi ?? "unknown",
        dailyCalories: state.health?.dailyCalories ?? "unknown",
        country: state.preferences?.country ?? "unknown",
        state: state.preferences?.state ?? "unknown",
        dietStyle: state.preferences?.dietStyle ?? "unknown",
        allergies: formatListForPrompt(state.preferences?.allergies),
        cuisinePreference: state.preferences?.cuisinePreference ?? "no preference",
        dislikedFoods: formatListForPrompt(state.preferences?.dislikedFoods),
        userQuestion: mode === "follow_up"
            ? (latestUserMessage?.content ?? "Please explain the plan.")
            : "Please explain the weekly meal plan.",
        mealPlan: JSON.stringify(state.mealPlan),
    })

    return {
        nodeComplete: false,
        currentNode: "plan_explainer",
        messages: [createAssistantMessage(explanation.trim())],
    }
}

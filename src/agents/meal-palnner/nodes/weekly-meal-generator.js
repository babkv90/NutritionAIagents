import "dotenv/config"
import { ChatOpenAI } from "@langchain/openai"
import { PromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"

const llm = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0,
})

const generateMealPlanPrompt = PromptTemplate.fromTemplate(
    `Create a personalized 7-day meal plan from this user state.

    Profile:
    Age: {age}
    Gender: {gender}
    Activity level: {activityLevel}

    Health:
    Weight: {weight} kg
    Height: {height} cm
    BMI: {bmi}
    BMI category: {bmiCategory}
    Estimated daily calories: {dailyCalories}

    Preferences:
    Country: {country}
    State: {state}
    Diet style: {dietStyle}
    Allergies: {allergies}
    Cuisine preference: {cuisinePreference}
    Disliked foods: {dislikedFoods}

    Requirements:
    Return ONLY valid JSON with this shape:
    {{
      "dailyCalorieTarget": number,
      "notes": [string],
      "days": [
        {{
          "day": "Day 1",
          "breakfast": string,
          "lunch": string,
          "dinner": string,
          "snack": string,
          "nutrition": {{
            "calories": number,
            "protein": number,
            "carbs": number,
            "fat": number
          }}
        }}
      ]
    }}
    Include exactly 7 items in "days".
    Each "nutrition" object must be the estimated total for the full day.
    Use grams for protein, carbs, and fat.
    Use the country and state to localize ingredients and dishes when appropriate.
    Respect allergies and disliked foods strictly.
    Match the diet style strictly.
    Keep meals practical and concise.`
)

const generateMealPlanChain = generateMealPlanPrompt
    .pipe(llm)
    .pipe(new StringOutputParser())

const safeParseJSON = (text) => {
    try {
        const cleaned = text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim()

        return JSON.parse(cleaned)
    } catch (error) {
        console.error("Meal plan JSON parse error. LLM returned:", text)
        return null
    }
}

const formatListForPrompt = (value) => {
    if (value === null || value === undefined) return "none"
    if (!Array.isArray(value)) return String(value)
    if (value.length === 0) return "none"
    return value.join(", ")
}

export async function weeklyMealGeneratorNode(state) {
    if (state.mealPlan) {
        return {
            nodeComplete: true,
            currentNode: "plan_generator",
        }
    }

    const mealPlanResult = await generateMealPlanChain.invoke({
        age: state.profile?.age ?? "unknown",
        gender: state.profile?.gender ?? "unknown",
        activityLevel: state.profile?.activityLevel ?? "unknown",
        weight: state.health?.weight ?? "unknown",
        height: state.health?.height ?? "unknown",
        bmi: state.health?.bmi ?? "unknown",
        bmiCategory: state.health?.bmiCategory ?? "unknown",
        dailyCalories: state.health?.dailyCalories ?? "unknown",
        country: state.preferences?.country ?? "unknown",
        state: state.preferences?.state ?? "unknown",
        dietStyle: state.preferences?.dietStyle ?? "unknown",
        allergies: formatListForPrompt(state.preferences?.allergies),
        cuisinePreference: state.preferences?.cuisinePreference ?? "no preference",
        dislikedFoods: formatListForPrompt(state.preferences?.dislikedFoods),
    })

    const mealPlan = safeParseJSON(mealPlanResult)

    if (!mealPlan) {
        const createAssistantMessage = (content) => ({
            role: "assistant",
            content,
            nodeId: "plan_generator",
        })

        return {
            nodeComplete: false,
            currentNode: "plan_generator",
            messages: [createAssistantMessage("I could not generate your weekly meal plan yet. Please try again.")],
        }
    }

    return {
        mealPlan,
        nodeComplete: true,
        currentNode: "plan_generator",
    }
}

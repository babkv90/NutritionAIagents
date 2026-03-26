import "dotenv/config"
import { ChatOpenAI } from "@langchain/openai"
import { PromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"

const llm = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0,
})

const askHealthQuestionPrompt = PromptTemplate.fromTemplate(
    `You are a friendly health assistant.

    Missing health input: {missingField}

    Instructions:
    Ask for exactly one missing health input in one short sentence.
    If asking for weight, specify kilograms.
    If asking for height, specify centimeters.
    Keep the tone polite and concise.`
)

const askHealthQuestionChain = askHealthQuestionPrompt
    .pipe(llm)
    .pipe(new StringOutputParser())

const extractHealthPrompt = PromptTemplate.fromTemplate(
    `Extract health measurements from the user's message.

    User said: {userMessage}

    Rules:
    Return ONLY valid JSON with keys "weight" and "height".
    Weight must be a number in kilograms.
    Height must be a number in centimeters.
    If a value is not present, return it as null.

    Examples:
    "I weigh 72 kg and my height is 178 cm" => {{"weight":72,"height":178}}
    "My weight is 80" => {{"weight":80,"height":null}}
    "I am 170 cm tall" => {{"weight":null,"height":170}}`
)

const extractHealthChain = extractHealthPrompt
    .pipe(llm)
    .pipe(new StringOutputParser())

const createAssistantMessage = (content) => ({
    role: "assistant",
    content,
    nodeId: "health_analyser",
})

const getEmptyHealth = () => ({
    weight: null,
    height: null,
    bmi: null,
    bmr: null,
    dailyCalories: null,
    bmiCategory: null,
})

const safeParseJSON = (text) => {
    try {
        const cleaned = text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim()

        return JSON.parse(cleaned)
    } catch (error) {
        console.error("Health JSON parse error. LLM returned:", text)
        return null
    }
}

const getMissingHealthField = (health) => {
    if (health.weight === null || health.weight === undefined) return "weight"
    if (health.height === null || health.height === undefined) return "height"
    return null
}

const normalizeMeasurement = (value) => {
    if (value === null || value === undefined || value === "") return null

    const numericValue = Number(value)
    return Number.isFinite(numericValue) ? numericValue : null
}

const extractNumericValue = (text) => {
    if (!text) return null

    const match = String(text).match(/(\d+(\.\d+)?)/)
    return match ? normalizeMeasurement(match[1]) : null
}

const extractHealthHeuristics = (userMessage, missingField) => {
    const numericValue = extractNumericValue(userMessage)

    if (numericValue === null) return {}

    if (missingField === "weight") {
        return { weight: numericValue }
    }

    if (missingField === "height") {
        return { height: numericValue }
    }

    return {}
}

const getBmiCategory = (bmi) => {
    if (bmi < 18.5) return "underweight"
    if (bmi < 25) return "normal"
    if (bmi < 30) return "overweight"
    return "obese"
}

const getActivityMultiplier = (activityLevel) => {
    const multipliers = {
        sedentary: 1.2,
        moderate: 1.55,
        active: 1.725,
        "very active": 1.9,
    }

    return multipliers[activityLevel] ?? 1.2
}

const getGenderOffset = (gender) => {
    if (gender === "male") return 5
    if (gender === "female") return -161

    // Midpoint fallback when the profile uses a non-binary or unknown label.
    return -78
}

    const calculateHealthMetrics = ({ age, gender, activityLevel, weight, height }) => {
    const heightInMeters = height / 100
    const bmi = weight / (heightInMeters * heightInMeters)
    const bmr =
        (10 * weight) +
        (6.25 * height) -
        (5 * age) +
        getGenderOffset(gender)

    const dailyCalories = bmr * getActivityMultiplier(activityLevel)

    return {
        weight,
        height,
        bmi: Number(bmi.toFixed(1)),
        bmr: Math.round(bmr),
        dailyCalories: Math.round(dailyCalories),
        bmiCategory: getBmiCategory(bmi),
    }
}

export async function healthAnalyserNode(state) {
    const lastUserMessage = state.messages
        .filter((message) => message.role === "user")
        .at(-1)

    const existingHealth = {
        ...getEmptyHealth(),
        ...state.health,
    }

    let updatedHealth = { ...existingHealth }

    const missingFieldBeforeExtraction = getMissingHealthField(updatedHealth)

    if (lastUserMessage && missingFieldBeforeExtraction) {
        const heuristicHealth = extractHealthHeuristics(
            lastUserMessage.content,
            missingFieldBeforeExtraction
        )

        const extractResult = await extractHealthChain.invoke({
            userMessage: lastUserMessage.content,
        })

        const extractedHealth = safeParseJSON(extractResult)

        updatedHealth = {
            ...updatedHealth,
            weight:
                normalizeMeasurement(heuristicHealth.weight) ??
                normalizeMeasurement(extractedHealth?.weight) ??
                updatedHealth.weight,
            height:
                normalizeMeasurement(heuristicHealth.height) ??
                normalizeMeasurement(extractedHealth?.height) ??
                updatedHealth.height,
            bmi: null,
            bmr: null,
            dailyCalories: null,
            bmiCategory: null,
        }
    }

    const missingField = getMissingHealthField(updatedHealth)

    if (missingField) {
        const question = await askHealthQuestionChain.invoke({
            missingField,
        })

        return {
            health: updatedHealth,
            nodeComplete: false,
            currentNode: "health_analyser",
            messages: [createAssistantMessage(question)],
        }
    }

    const completedHealth = calculateHealthMetrics({
        age: Number(state.profile.age),
        gender: state.profile.gender,
        activityLevel: state.profile.activityLevel,
        weight: updatedHealth.weight,
        height: updatedHealth.height,
    })

    return {
        health: completedHealth,
        nodeComplete: true,
        currentNode: "health_analyser",
        messages: [createAssistantMessage(
            `Thanks. I have your health metrics now:
Weight: ${completedHealth.weight} kg
Height: ${completedHealth.height} cm
BMI: ${completedHealth.bmi} (${completedHealth.bmiCategory})
BMR: ${completedHealth.bmr} kcal/day
Estimated daily calories: ${completedHealth.dailyCalories} kcal/day

Let me move to your food preferences next.`
        )],
    }
}

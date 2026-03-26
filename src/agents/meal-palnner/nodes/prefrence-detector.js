import "dotenv/config"
import { ChatOpenAI } from "@langchain/openai"
import { PromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"

const llm = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0,
})

const askPreferenceQuestionPrompt = PromptTemplate.fromTemplate(
    `You are a friendly meal planning assistant.

    Current preference data:
    Country: {country}
    State: {state}
    Diet style: {dietStyle}
    Allergies: {allergies}
    Cuisine preference: {cuisinePreference}
    Disliked foods: {dislikedFoods}

    Missing field: {missingField}

    Instructions:
    Ask for exactly one missing preference field in one short sentence.
    If asking for country, ask for the user's country only.
    If asking for state, ask for the user's state or region only.
    If asking for diet style, suggest examples like vegetarian, vegan, eggetarian, keto, high-protein, or non-vegetarian.
    If asking for allergies, explicitly say they can say "none".
    If asking for cuisine preference, mention they can name cuisines like South Indian, Gujarati, Mediterranean, Asian, or say no preference.
    If asking for disliked foods, explicitly say they can say "none".
    Keep the tone polite and concise.`
)

const askPreferenceQuestionChain = askPreferenceQuestionPrompt
    .pipe(llm)
    .pipe(new StringOutputParser())

const extractPreferencesPrompt = PromptTemplate.fromTemplate(
    `Extract meal preference fields from the user's message.

    User said: {userMessage}

    Rules:
    Return ONLY valid JSON with these keys:
    "country", "state", "dietStyle", "allergies", "cuisinePreference", "dislikedFoods"
    Use null when a field is not mentioned.
    "allergies" and "dislikedFoods" must be arrays when mentioned.
    If the user says they have no allergies, return [] for "allergies".
    If the user says they dislike nothing or have no disliked foods, return [] for "dislikedFoods".
    If the user says no cuisine preference, return "no preference" for "cuisinePreference".
    Keep food names short strings.

    Example:
    "I live in India, in Karnataka, I am vegetarian, allergic to peanuts, like South Indian food, and dislike mushrooms"
    => {{"country":"India","state":"Karnataka","dietStyle":"vegetarian","allergies":["peanuts"],"cuisinePreference":"South Indian","dislikedFoods":["mushrooms"]}}`
)

const extractPreferencesChain = extractPreferencesPrompt
    .pipe(llm)
    .pipe(new StringOutputParser())

const createAssistantMessage = (content) => ({
    role: "assistant",
    content,
    nodeId: "preference_detector",
})

const getEmptyPreferences = () => ({
    country: null,
    state: null,
    dietStyle: null,
    allergies: null,
    cuisinePreference: null,
    dislikedFoods: null,
})

const safeParseJSON = (text) => {
    try {
        const cleaned = text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim()

        return JSON.parse(cleaned)
    } catch (error) {
        console.error("Preference JSON parse error. LLM returned:", text)
        return null
    }
}

const normalizeText = (value) => {
    if (value === null || value === undefined) return null

    const trimmed = String(value).trim()
    return trimmed ? trimmed : null
}

const normalizeList = (value) => {
    if (value === null || value === undefined) return null
    if (!Array.isArray(value)) return null

    const cleaned = value
        .map((item) => String(item).trim())
        .filter(Boolean)

    return cleaned
}

const hasNegativePreferenceReply = (text) => {
    const normalized = text.toLowerCase().trim()

    return [
        "none",
        "no",
        "nope",
        "nil",
        "nothing",
        "n/a",
        "na",
        "no allergies",
        "no allergy",
        "i have no allergies",
        "dont have allergies",
        "don't have allergies",
        "no disliked foods",
        "no dislikes",
        "nothing specific",
        "no preference",
    ].includes(normalized)
}

const splitListText = (text) => text
    .split(/,| and |\/|\n/gi)
    .map((item) => item.trim())
    .filter(Boolean)

const extractPreferenceHeuristics = (userMessage, missingField) => {
    if (!userMessage) return {}

    const message = userMessage.trim()
    const lowerMessage = message.toLowerCase()

    if (missingField === "country") {
        const cleaned = message
            .replace(/^i (live|am) in\s+/i, "")
            .replace(/^from\s+/i, "")
            .trim()

        return cleaned ? { country: cleaned } : {}
    }

    if (missingField === "state") {
        const cleaned = message
            .replace(/^i live in\s+/i, "")
            .replace(/^state is\s+/i, "")
            .replace(/^from\s+/i, "")
            .trim()

        return cleaned ? { state: cleaned } : {}
    }

    if (missingField === "allergies") {
        if (
            hasNegativePreferenceReply(message) ||
            /no\s+allerg/i.test(message) ||
            /without\s+allerg/i.test(message)
        ) {
            return { allergies: [] }
        }

        const cleaned = lowerMessage
            .replace(/i am allergic to/gi, "")
            .replace(/i'm allergic to/gi, "")
            .replace(/allergic to/gi, "")
            .replace(/my allergies are/gi, "")
            .replace(/allergies are/gi, "")
            .trim()

        const allergies = splitListText(cleaned)
        return allergies.length ? { allergies } : {}
    }

    if (missingField === "dislikedFoods") {
        if (
            hasNegativePreferenceReply(message) ||
            /do not dislike anything/i.test(message) ||
            /don't dislike anything/i.test(message)
        ) {
            return { dislikedFoods: [] }
        }

        const cleaned = lowerMessage
            .replace(/i dislike/gi, "")
            .replace(/i don't like/gi, "")
            .replace(/i do not like/gi, "")
            .replace(/disliked foods are/gi, "")
            .replace(/dislikes are/gi, "")
            .trim()

        const dislikedFoods = splitListText(cleaned)
        return dislikedFoods.length ? { dislikedFoods } : {}
    }

    if (missingField === "cuisinePreference") {
        if (/no\s+preference/i.test(message)) {
            return { cuisinePreference: "no preference" }
        }

        return { cuisinePreference: message }
    }

    if (missingField === "dietStyle") {
        return { dietStyle: message }
    }

    return {}
}

const getMissingPreferenceField = (preferences) => {
    if (!preferences.country) return "country"
    if (!preferences.state) return "state"
    if (!preferences.dietStyle) return "dietStyle"
    if (preferences.allergies === null) return "allergies"
    if (!preferences.cuisinePreference) return "cuisinePreference"
    if (preferences.dislikedFoods === null) return "dislikedFoods"
    return null
}

const formatListForPrompt = (value) => {
    if (value === null || value === undefined) return "not collected"
    if (!Array.isArray(value)) return String(value)
    if (value.length === 0) return "none"
    return value.join(", ")
}

export async function preferenceDetectorNode(state) {
    const lastUserMessage = state.messages
        .filter((message) => message.role === "user")
        .at(-1)

    const existingPreferences = {
        ...getEmptyPreferences(),
        ...state.preferences,
    }

    let updatedPreferences = {
        country: normalizeText(existingPreferences.country),
        state: normalizeText(existingPreferences.state),
        dietStyle: normalizeText(existingPreferences.dietStyle),
        allergies: normalizeList(existingPreferences.allergies),
        cuisinePreference: normalizeText(existingPreferences.cuisinePreference),
        dislikedFoods: normalizeList(existingPreferences.dislikedFoods),
    }

    const missingFieldBeforeExtraction = getMissingPreferenceField(updatedPreferences)

    if (lastUserMessage && missingFieldBeforeExtraction) {
        const heuristicPreferences = extractPreferenceHeuristics(
            lastUserMessage.content,
            missingFieldBeforeExtraction
        )

        const extractResult = await extractPreferencesChain.invoke({
            userMessage: lastUserMessage.content,
        })

        const extractedPreferences = safeParseJSON(extractResult)

        updatedPreferences = {
            country:
                normalizeText(heuristicPreferences.country) ??
                normalizeText(extractedPreferences?.country) ??
                updatedPreferences.country,
            state:
                normalizeText(heuristicPreferences.state) ??
                normalizeText(extractedPreferences?.state) ??
                updatedPreferences.state,
            dietStyle:
                normalizeText(heuristicPreferences.dietStyle) ??
                normalizeText(extractedPreferences?.dietStyle) ??
                updatedPreferences.dietStyle,
            allergies:
                normalizeList(heuristicPreferences.allergies) ??
                normalizeList(extractedPreferences?.allergies) ??
                updatedPreferences.allergies,
            cuisinePreference:
                normalizeText(heuristicPreferences.cuisinePreference) ??
                normalizeText(extractedPreferences?.cuisinePreference) ??
                updatedPreferences.cuisinePreference,
            dislikedFoods:
                normalizeList(heuristicPreferences.dislikedFoods) ??
                normalizeList(extractedPreferences?.dislikedFoods) ??
                updatedPreferences.dislikedFoods,
        }
    }

    const missingField = getMissingPreferenceField(updatedPreferences)

    if (missingField) {
        const question = await askPreferenceQuestionChain.invoke({
            country: updatedPreferences.country ?? "not collected",
            state: updatedPreferences.state ?? "not collected",
            dietStyle: updatedPreferences.dietStyle ?? "not collected",
            allergies: formatListForPrompt(updatedPreferences.allergies),
            cuisinePreference: updatedPreferences.cuisinePreference ?? "not collected",
            dislikedFoods: formatListForPrompt(updatedPreferences.dislikedFoods),
            missingField,
        })

        return {
            preferences: updatedPreferences,
            nodeComplete: false,
            currentNode: "preference_detector",
            messages: [createAssistantMessage(question)],
        }
    }

    return {
        preferences: updatedPreferences,
        nodeComplete: true,
        currentNode: "preference_detector",
        messages: [createAssistantMessage(
            `Thanks. I have your food preferences now:
Country: ${updatedPreferences.country}
State: ${updatedPreferences.state}
Diet style: ${updatedPreferences.dietStyle}
Allergies: ${formatListForPrompt(updatedPreferences.allergies)}
Cuisine preference: ${updatedPreferences.cuisinePreference}
Disliked foods: ${formatListForPrompt(updatedPreferences.dislikedFoods)}

I will generate your weekly meal plan next.`
        )],
    }
}

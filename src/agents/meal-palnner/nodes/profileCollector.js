// server/src/agent/nodes/profileCollector.js
import "dotenv/config"
import { ChatOpenAI } from "@langchain/openai"
import { PromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"

// ── Model ─────────────────────────────────────────────
const llm = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0,
})


// ── Prompt 1 — Ask Question ───────────────────────────
// FIX: Keep variable names SIMPLE
// FIX: No special characters around variable names
// FIX: Variables must EXACTLY match invoke() keys

const askQuestionPrompt = PromptTemplate.fromTemplate(
    `You are a friendly nutrition assistant.

    What has been collected so far:
    Age: {age}
    Gender: {gender}
    Activity Level: {activityLevel}

    Instructions:
    Ask for exactly ONE missing piece of information.
    If age is "not collected" ask for age only.
    If gender is "not collected" ask for gender only.
    If activityLevel is "not collected" ask for activity level only.
    Give these options for activity: sedentary, moderate, active, very active.
    Keep response to one short sentence.`
)

// IMPORTANT: Variable names here must EXACTLY match
// what you pass to invoke() below
const askQuestionChain = askQuestionPrompt
    .pipe(llm)
    .pipe(new StringOutputParser())

// ── Prompt 2 — Extract Data ───────────────────────────
// FIX: Escaped curly braces use double brackets
// FIX: Only 2 variables — userMessage and fieldToExtract

const extractDataPrompt = PromptTemplate.fromTemplate(
    `Extract information from this message.

    User said: {userMessage}
    Extract this field: {fieldToExtract}

    Rules:
    For age: return a number like 28
    For gender: return male or female or other
    For activityLevel: return sedentary or moderate or active or very active

    Map natural language to closest value.
    gym 3 times = active
    desk job = sedentary  
    walk daily = moderate
    athlete = very active

    Return ONLY valid JSON with no extra text.
    If found: return the field and value.
    If not found: return the field with null value.`
)

// IMPORTANT: Only 2 variables in this prompt
// invoke() must pass EXACTLY these 2 keys
const extractDataChain = extractDataPrompt
    .pipe(llm)
    .pipe(new StringOutputParser())

// ── Helpers ───────────────────────────────────────────
const safeParseJSON = (text) => {
    try {
        const cleaned = text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim()
        return JSON.parse(cleaned)
    } catch (err) {
        console.error("JSON parse error. LLM returned:", text)
        return null
    }
}

const isProfileComplete = (profile) =>
    profile.age !== null &&
    profile.gender !== null &&
    profile.activityLevel !== null

const getMissingField = (profile) => {
    if (profile.age === null) return "age"
    if (profile.gender === null) return "gender"
    if (profile.activityLevel === null) return "activityLevel"
    return null
}

const createAssistantMessage = (content) => ({
    role: "assistant",
    content,
    nodeId: "profile_collector",
})


// ── Main Node Function ────────────────────────────────
export async function profileCollectorNode(state) {

    const lastUserMessage = state.messages
        .filter((m) => m.role === "user")
        .at(-1)


    // ── First call — no user message yet ──────────────
    if (!lastUserMessage) {
        console.log("  No user message — asking first question")

        // FIX: Pass EXACT variable names the prompt expects
        const result = await askQuestionChain.invoke({
            age: "not collected",
            gender: "not collected",
            activityLevel: "not collected",
        })

        return {
            nodeComplete: false,
            currentNode: "profile_collector",
            messages: [createAssistantMessage(result)]
        }
    }


    // ── Extract from user message ──────────────────────
    const missingField = getMissingField(state.profile)

    if (missingField) {
        console.log(`  Extracting: ${missingField}`)

        // FIX: EXACTLY 2 variables matching the prompt
        const extractResult = await extractDataChain.invoke({
            userMessage: lastUserMessage.content,
            fieldToExtract: missingField,
        })

        // console.log("Raw LLM response:", extractResult)

        const extracted = safeParseJSON(extractResult)

        console.log("  Parsed:", extracted)

        const updatedProfile = {
            ...state.profile,
            ...(extracted || {})
        }

        console.log("  Updated profile:", updatedProfile)


        // ── Profile complete ───────────────────────────
        if (isProfileComplete(updatedProfile)) {
            console.log("  ✅ Profile complete")

            return {
                profile: updatedProfile,
                nodeComplete: true,
                currentNode: "profile_collector",
                messages: [createAssistantMessage(
                    // FIX: No LLM call here — just a
                    // hardcoded confirmation message
                    // Avoids unnecessary API call
                    `Perfect! Here is what I have:
                        Age: ${updatedProfile.age}
                        Gender: ${updatedProfile.gender}
                        Activity Level: ${updatedProfile.activityLevel}

                        Let me now check your health metrics.`
                )]
            }
        }


        // ── Still missing fields — ask next question ───
        // FIX: Pass exact variable names
        const nextQuestion = await askQuestionChain.invoke({
            age: updatedProfile.age ?? "not collected",
            gender: updatedProfile.gender ?? "not collected",
            activityLevel: updatedProfile.activityLevel ?? "not collected",
        })

        return {
            profile: updatedProfile,
            nodeComplete: false,
            currentNode: "profile_collector",
            messages: [createAssistantMessage(nextQuestion)]
        }
    }


    // ── Already complete — move forward ───────────────
    return {
        nodeComplete: true,
        currentNode: "profile_collector"
    }
}

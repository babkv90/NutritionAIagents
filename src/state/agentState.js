// server/src/agent/state/agentState.js

export const AgentState = {
    channels: {

        // ── All conversation messages ──────────────
        // concat = every new message gets added to array
        // never replaced — you need full history
        messages: {
            value:   (existing, newMsg) => existing.concat(newMsg),
            default: () => []
        },

        // ── Node 1 data ────────────────────────────
        // merge = new fields merge into existing object
        // age might come first, gender second — both kept
        profile: {
            value:   (existing, updates) => ({ ...existing, ...updates }),
            default: () => ({
                age:           null,
                gender:        null,
                activityLevel: null
            })
        },

        // ── Node 2 data ────────────────────────────
        health: {
            value:   (existing, updates) => ({ ...existing, ...updates }),
            default: () => ({
                weight:        null,
                height:        null,
                bmi:           null,
                bmr:           null,
                dailyCalories: null,
                bmiCategory:   null
            })
        },

        // ── Node 3 data ────────────────────────────
        preferences: {
            value:   (existing, updates) => ({ ...existing, ...updates }),
            default: () => ({
                dietStyle:        null,
                allergies:        [],
                cuisinePreference: null,
                dislikedFoods:    []
            })
        },

        // ── Node 4 data ────────────────────────────
        // replace = whole plan generated at once
        // no partial merging needed
        mealPlan: {
            value:   (existing, updated) => updated ?? existing,
            default: () => null
        },

        // RAG insight card text for right panel
        ragInsight: {
            value:   (existing, updated) => updated ?? existing,
            default: () => null
        },

        // ── Agent control ──────────────────────────
        currentNode: {
            value:   (existing, updated) => updated ?? existing,
            default: () => "profile_collector"
        },

        nodeComplete: {
            value:   (existing, updated) => updated ?? existing,
            default: () => false
        },

        // ── Session info ───────────────────────────
        userId: {
            value:   (existing, updated) => updated ?? existing,
            default: () => null
        },

        sessionId: {
            value:   (existing, updated) => updated ?? existing,
            default: () => null
        },

        isFirstSession: {
            value:   (existing, updated) => updated ?? existing,
            default: () => true
        }
    }
}


// ── Node names as constants ────────────────────────────
// Use these everywhere instead of raw strings
// Avoids typo bugs like "profile_collecctor"

export const NODES = {
    PROFILE_COLLECTOR:   "profile_collector",
    HEALTH_ANALYSER:     "health_analyser",
    PREFERENCE_DETECTOR: "preference_detector",
    PLAN_GENERATOR:      "plan_generator",
    PLAN_EXPLAINER:      "plan_explainer"
}


// ── Node sequence ──────────────────────────────────────
// Used by graph.js to define edges in order

export const NODE_SEQUENCE = [
    NODES.PROFILE_COLLECTOR,
    NODES.HEALTH_ANALYSER,
    NODES.PREFERENCE_DETECTOR,
    NODES.PLAN_GENERATOR,
    NODES.PLAN_EXPLAINER
]


// ── Node display info ──────────────────────────────────
// Sent to React frontend to render the stepper UI
// Each node has a label, description, input placeholder

export const NODE_META = {
    [NODES.PROFILE_COLLECTOR]: {
        id:               1,
        label:            "Profile Collector",
        description:      "Collecting age, gender, activity level",
        inputPlaceholder: "Enter your age, gender, activity level..."
    },
    [NODES.HEALTH_ANALYSER]: {
        id:               2,
        label:            "Health Analyser",
        description:      "Calculating BMI and calorie needs",
        inputPlaceholder: "Enter your weight (kg) and height (cm)..."
    },
    [NODES.PREFERENCE_DETECTOR]: {
        id:               3,
        label:            "Preference Detector",
        description:      "Diet style and allergies",
        inputPlaceholder: "Enter your diet preferences..."
    },
    [NODES.PLAN_GENERATOR]: {
        id:               4,
        label:            "Plan Generator",
        description:      "Generating your 7-day meal plan",
        inputPlaceholder: null  // input disabled during generation
    },
    [NODES.PLAN_EXPLAINER]: {
        id:               5,
        label:            "Plan Explainer",
        description:      "Ask anything about your plan",
        inputPlaceholder: "Ask anything about your meal plan..."
    }
}


// ── Fresh state for new session ────────────────────────
// Call this in controller when new user session starts
// Gives a clean starting state every time

export const getInitialState = (userId, sessionId) => ({
    messages:       [],
    profile: {
        age:           null,
        gender:        null,
        activityLevel: null
    },
    health: {
        weight:        null,
        height:        null,
        bmi:           null,
        bmr:           null,
        dailyCalories: null,
        bmiCategory:   null
    },
    preferences: {
        dietStyle:         null,
        allergies:         [],
        cuisinePreference: null,
        dislikedFoods:     []
    },
    mealPlan:       null,
    ragInsight:     null,
    currentNode:    "profile_collector",
    nodeComplete:   false,
    userId,
    sessionId,
    isFirstSession: true
})
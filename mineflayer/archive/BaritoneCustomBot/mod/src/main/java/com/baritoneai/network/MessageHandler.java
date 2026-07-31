package com.baritoneai.network;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

public class MessageHandler {

    // Message types: Mod -> Backend
    public static final String CHAT_MESSAGE = "CHAT_MESSAGE";
    public static final String STATE_UPDATE = "STATE_UPDATE";
    public static final String TASK_COMPLETE = "TASK_COMPLETE";
    public static final String TASK_FAILED = "TASK_FAILED";
    public static final String EMERGENCY = "EMERGENCY";

    // Message types: Backend -> Mod
    public static final String EXECUTE_ACTIONS = "EXECUTE_ACTIONS";
    public static final String STOP = "STOP";
    public static final String REQUEST_STATE = "REQUEST_STATE";
    public static final String SET_BASE = "SET_BASE";
    public static final String SET_CONFIG = "SET_CONFIG";
    public static final String SET_IDLE_MODE = "SET_IDLE_MODE";

    // ========== Outgoing Message Builders ==========

    public static String buildChatMessage(String sender, String message, JsonObject worldState) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", CHAT_MESSAGE);
        msg.addProperty("sender", sender);
        msg.addProperty("message", message);
        msg.addProperty("timestamp", System.currentTimeMillis());
        msg.add("worldState", worldState);
        return msg.toString();
    }

    public static String buildStateUpdate(JsonObject worldState) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", STATE_UPDATE);
        msg.addProperty("timestamp", System.currentTimeMillis());
        msg.add("worldState", worldState);
        return msg.toString();
    }

    public static String buildTaskComplete(String taskId, String result) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", TASK_COMPLETE);
        msg.addProperty("taskId", taskId);
        msg.addProperty("result", result);
        msg.addProperty("timestamp", System.currentTimeMillis());
        return msg.toString();
    }

    public static String buildTaskFailed(String taskId, String error) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", TASK_FAILED);
        msg.addProperty("taskId", taskId);
        msg.addProperty("error", error);
        msg.addProperty("timestamp", System.currentTimeMillis());
        return msg.toString();
    }

    public static String buildEmergency(String emergencyType, JsonObject worldState) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", EMERGENCY);
        msg.addProperty("emergencyType", emergencyType);
        msg.addProperty("timestamp", System.currentTimeMillis());
        msg.add("worldState", worldState);
        return msg.toString();
    }

    // ========== Incoming Message Parsing ==========

    public static JsonObject parse(String raw) {
        return JsonParser.parseString(raw).getAsJsonObject();
    }

    public static String getType(JsonObject msg) {
        return msg.has("type") ? msg.get("type").getAsString() : "UNKNOWN";
    }
}

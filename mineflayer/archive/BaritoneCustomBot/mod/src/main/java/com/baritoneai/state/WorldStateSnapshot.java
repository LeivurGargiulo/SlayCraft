package com.baritoneai.state;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

public class WorldStateSnapshot {

    // Player state
    public double x, y, z;
    public float yaw, pitch;
    public float health;
    public int food;
    public float saturation;
    public int experienceLevel;
    public boolean isOnGround;
    public boolean isInWater;
    public boolean isFallFlying;

    // Environment
    public String biome;
    public String dimension;
    public long timeOfDay;
    public boolean isRaining;

    // Inventory
    public List<ItemStackInfo> inventory = new ArrayList<>();
    public List<ItemStackInfo> armor = new ArrayList<>();
    public ItemStackInfo mainHand;
    public ItemStackInfo offHand;

    // Nearby entities
    public List<EntityInfo> nearbyEntities = new ArrayList<>();
    public List<EntityInfo> nearbyHostiles = new ArrayList<>();
    public List<PlayerInfo> nearbyPlayers = new ArrayList<>();

    // Current task info
    public String currentTaskState;
    public String currentTaskType;
    public String currentTaskDescription;

    // Baritone activity (includes manual commands)
    public boolean baritoneActive;

    // Available schematics
    public List<String> availableSchematics = new ArrayList<>();

    // Inventory stats
    public int usedInventorySlots;

    // Transport capabilities
    public boolean hasElytra;
    public boolean elytraEquipped;
    public int fireworkCount;
    public boolean hasBoat;
    public boolean isInBoat;

    // Nearby portals
    public List<PortalInfo> nearbyPortals = new ArrayList<>();

    // Nearby chests
    public List<ChestInfo> nearbyChests = new ArrayList<>();

    public JsonObject toJson() {
        JsonObject json = new JsonObject();

        // Position
        JsonObject pos = new JsonObject();
        pos.addProperty("x", Math.round(x * 100.0) / 100.0);
        pos.addProperty("y", Math.round(y * 100.0) / 100.0);
        pos.addProperty("z", Math.round(z * 100.0) / 100.0);
        json.add("position", pos);
        json.addProperty("yaw", Math.round(yaw * 10.0f) / 10.0f);
        json.addProperty("pitch", Math.round(pitch * 10.0f) / 10.0f);

        // Vitals
        json.addProperty("health", health);
        json.addProperty("food", food);
        json.addProperty("saturation", Math.round(saturation * 10.0f) / 10.0f);
        json.addProperty("experienceLevel", experienceLevel);
        json.addProperty("isOnGround", isOnGround);
        json.addProperty("isInWater", isInWater);
        json.addProperty("isFallFlying", isFallFlying);

        // Environment
        json.addProperty("biome", biome);
        json.addProperty("dimension", dimension);
        json.addProperty("timeOfDay", timeOfDay);
        json.addProperty("isRaining", isRaining);

        // Inventory
        json.add("inventory", serializeItemList(inventory));
        json.add("armor", serializeItemList(armor));
        json.add("mainHand", mainHand != null ? mainHand.toJson() : null);
        json.add("offHand", offHand != null ? offHand.toJson() : null);
        json.addProperty("usedInventorySlots", usedInventorySlots);

        // Entities
        json.add("nearbyHostiles", serializeEntityList(nearbyHostiles));
        json.add("nearbyPlayers", serializePlayerList(nearbyPlayers));
        json.addProperty("nearbyEntityCount", nearbyEntities.size());

        // Task
        json.addProperty("currentTaskState", currentTaskState);
        json.addProperty("currentTaskType", currentTaskType);
        json.addProperty("currentTaskDescription", currentTaskDescription);
        json.addProperty("baritoneActive", baritoneActive);

        // Transport capabilities
        JsonObject capabilities = new JsonObject();
        capabilities.addProperty("hasElytra", hasElytra);
        capabilities.addProperty("elytraEquipped", elytraEquipped);
        capabilities.addProperty("fireworkCount", fireworkCount);
        capabilities.addProperty("hasBoat", hasBoat);
        capabilities.addProperty("isInBoat", isInBoat);
        json.add("capabilities", capabilities);

        // Nearby portals
        if (!nearbyPortals.isEmpty()) {
            JsonArray portals = new JsonArray();
            for (PortalInfo p : nearbyPortals) {
                portals.add(p.toJson());
            }
            json.add("nearbyPortals", portals);
        }

        // Nearby chests
        if (!nearbyChests.isEmpty()) {
            JsonArray chests = new JsonArray();
            for (ChestInfo c : nearbyChests) {
                chests.add(c.toJson());
            }
            json.add("nearbyChests", chests);
        }

        // Schematics
        if (!availableSchematics.isEmpty()) {
            JsonArray schems = new JsonArray();
            for (String s : availableSchematics) {
                schems.add(s);
            }
            json.add("availableSchematics", schems);
        }

        return json;
    }

    private JsonArray serializeItemList(List<ItemStackInfo> items) {
        JsonArray arr = new JsonArray();
        for (ItemStackInfo item : items) {
            if (item != null && !item.itemId.equals("minecraft:air")) {
                arr.add(item.toJson());
            }
        }
        return arr;
    }

    private JsonArray serializeEntityList(List<EntityInfo> entities) {
        JsonArray arr = new JsonArray();
        for (EntityInfo e : entities) {
            arr.add(e.toJson());
        }
        return arr;
    }

    private JsonArray serializePlayerList(List<PlayerInfo> players) {
        JsonArray arr = new JsonArray();
        for (PlayerInfo p : players) {
            arr.add(p.toJson());
        }
        return arr;
    }

    // Inner data classes

    public static class ItemStackInfo {
        public final String itemId;
        public final int count;
        public final int slot;

        public ItemStackInfo(String itemId, int count, int slot) {
            this.itemId = itemId;
            this.count = count;
            this.slot = slot;
        }

        public JsonObject toJson() {
            JsonObject json = new JsonObject();
            json.addProperty("item", itemId);
            json.addProperty("count", count);
            json.addProperty("slot", slot);
            return json;
        }
    }

    public static class EntityInfo {
        public final String type;
        public final String name;
        public final double distance;
        public final double x, y, z;
        public final float health;

        public EntityInfo(String type, String name, double distance, double x, double y, double z, float health) {
            this.type = type;
            this.name = name;
            this.distance = distance;
            this.x = x;
            this.y = y;
            this.z = z;
            this.health = health;
        }

        public JsonObject toJson() {
            JsonObject json = new JsonObject();
            json.addProperty("type", type);
            json.addProperty("name", name);
            json.addProperty("distance", Math.round(distance * 10.0) / 10.0);
            json.addProperty("x", Math.round(x * 10.0) / 10.0);
            json.addProperty("y", Math.round(y * 10.0) / 10.0);
            json.addProperty("z", Math.round(z * 10.0) / 10.0);
            json.addProperty("health", health);
            return json;
        }
    }

    public static class PlayerInfo {
        public final String name;
        public final double distance;
        public final double x, y, z;

        public PlayerInfo(String name, double distance, double x, double y, double z) {
            this.name = name;
            this.distance = distance;
            this.x = x;
            this.y = y;
            this.z = z;
        }

        public JsonObject toJson() {
            JsonObject json = new JsonObject();
            json.addProperty("name", name);
            json.addProperty("distance", Math.round(distance * 10.0) / 10.0);
            json.addProperty("x", Math.round(x * 10.0) / 10.0);
            json.addProperty("y", Math.round(y * 10.0) / 10.0);
            json.addProperty("z", Math.round(z * 10.0) / 10.0);
            return json;
        }
    }

    public static class PortalInfo {
        public final int x, y, z;

        public PortalInfo(int x, int y, int z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }

        public JsonObject toJson() {
            JsonObject json = new JsonObject();
            json.addProperty("x", x);
            json.addProperty("y", y);
            json.addProperty("z", z);
            return json;
        }
    }

    public static class ChestInfo {
        public final int x, y, z;
        public final double distance;

        public ChestInfo(int x, int y, int z, double distance) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.distance = distance;
        }

        public JsonObject toJson() {
            JsonObject json = new JsonObject();
            json.addProperty("x", x);
            json.addProperty("y", y);
            json.addProperty("z", z);
            json.addProperty("distance", Math.round(distance * 10.0) / 10.0);
            return json;
        }
    }
}

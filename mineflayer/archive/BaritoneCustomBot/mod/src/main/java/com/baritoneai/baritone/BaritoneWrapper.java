package com.baritoneai.baritone;

import baritone.api.BaritoneAPI;
import baritone.api.IBaritone;
import baritone.api.pathing.goals.GoalBlock;
import baritone.api.pathing.goals.GoalNear;
import baritone.api.pathing.goals.GoalRunAway;
import baritone.api.pathing.goals.GoalXZ;
import baritone.api.pathing.goals.GoalYLevel;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class BaritoneWrapper {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-Baritone");

    private IBaritone baritone;

    /**
     * Initialize by grabbing the primary Baritone instance.
     * Must be called AFTER the world has loaded (player != null).
     */
    public void initialize() {
        try {
            this.baritone = BaritoneAPI.getProvider().getPrimaryBaritone();
            if (this.baritone != null) {
                LOGGER.info("Baritone API connected successfully");
            } else {
                LOGGER.error("Baritone API returned null - is Baritone installed?");
            }
        } catch (Exception e) {
            LOGGER.error("Failed to initialize Baritone API", e);
        }
    }

    public boolean isInitialized() {
        return baritone != null;
    }

    // ========== GOTO ==========

    public void gotoPosition(double x, double y, double z) {
        if (!ensureReady()) return;
        LOGGER.info("Navigating to {}, {}, {}", (int) x, (int) y, (int) z);
        baritone.getCustomGoalProcess().setGoalAndPath(
                new GoalBlock(new BlockPos((int) x, (int) y, (int) z))
        );
    }

    public void gotoXZ(int x, int z) {
        if (!ensureReady()) return;
        LOGGER.info("Navigating to x={}, z={}", x, z);
        baritone.getCustomGoalProcess().setGoalAndPath(new GoalXZ(x, z));
    }

    public void gotoNear(double x, double y, double z, int range) {
        if (!ensureReady()) return;
        LOGGER.info("Navigating near {}, {}, {} (range {})", (int) x, (int) y, (int) z, range);
        baritone.getCustomGoalProcess().setGoalAndPath(
                new GoalNear(new BlockPos((int) x, (int) y, (int) z), range)
        );
    }

    // ========== MINE ==========

    public void mine(String... blockNames) {
        if (!ensureReady()) return;
        LOGGER.info("Mining: {}", String.join(", ", blockNames));
        baritone.getMineProcess().mineByName(0, blockNames);
    }

    public void mine(int quantity, String... blockNames) {
        if (!ensureReady()) return;
        LOGGER.info("Mining {} of: {}", quantity, String.join(", ", blockNames));
        baritone.getMineProcess().mineByName(quantity, blockNames);
    }

    // ========== FOLLOW ==========

    public void followPlayer(String playerName) {
        if (!ensureReady()) return;
        LOGGER.info("Following player: {}", playerName);
        baritone.getFollowProcess().follow(entity ->
                entity instanceof Player &&
                        entity.getName().getString().equalsIgnoreCase(playerName) &&
                        entity != Minecraft.getInstance().player
        );
    }

    // ========== EXPLORE ==========

    public void explore(int centerX, int centerZ) {
        if (!ensureReady()) return;
        LOGGER.info("Exploring from {}, {}", centerX, centerZ);
        baritone.getExploreProcess().explore(centerX, centerZ);
    }

    // ========== BUILD ==========

    /**
     * Build a schematic from the schematics folder.
     * Looks for .schem and .litematic files in the Minecraft game dir under schematics/.
     */
    public boolean buildSchematic(String schematicName) {
        if (!ensureReady()) return false;

        File schematicsDir = getSchematicsDir();
        if (schematicsDir == null || !schematicsDir.isDirectory()) {
            LOGGER.warn("Schematics directory not found");
            return false;
        }

        // Search for matching file
        File schematicFile = findSchematicFile(schematicsDir, schematicName);
        if (schematicFile == null) {
            LOGGER.warn("Schematic '{}' not found in {}", schematicName, schematicsDir.getAbsolutePath());
            return false;
        }

        LOGGER.info("Building schematic: {}", schematicFile.getName());
        BlockPos origin = Minecraft.getInstance().player.blockPosition();
        baritone.getBuilderProcess().build(schematicFile.getName(), schematicFile, origin);
        return true;
    }

    /**
     * Returns a list of available schematic file names (without extension).
     */
    public List<String> getAvailableSchematics() {
        List<String> schematics = new ArrayList<>();
        File schematicsDir = getSchematicsDir();
        if (schematicsDir == null || !schematicsDir.isDirectory()) return schematics;

        File[] files = schematicsDir.listFiles();
        if (files == null) return schematics;

        for (File f : files) {
            String name = f.getName().toLowerCase();
            if (name.endsWith(".schem") || name.endsWith(".litematic") || name.endsWith(".schematic")) {
                // Return name without extension
                int dot = f.getName().lastIndexOf('.');
                schematics.add(dot > 0 ? f.getName().substring(0, dot) : f.getName());
            }
        }
        return schematics;
    }

    private File getSchematicsDir() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.gameDirectory == null) return null;
        return new File(mc.gameDirectory, "schematics");
    }

    private File findSchematicFile(File dir, String name) {
        String lowerName = name.toLowerCase();
        File[] files = dir.listFiles();
        if (files == null) return null;

        // Exact match first (with any schematic extension)
        for (File f : files) {
            String fName = f.getName().toLowerCase();
            if (fName.equals(lowerName + ".schem") ||
                    fName.equals(lowerName + ".litematic") ||
                    fName.equals(lowerName + ".schematic") ||
                    fName.equalsIgnoreCase(name)) {
                return f;
            }
        }

        // Partial match (name contains the search term)
        for (File f : files) {
            String fName = f.getName().toLowerCase();
            if (fName.contains(lowerName) &&
                    (fName.endsWith(".schem") || fName.endsWith(".litematic") || fName.endsWith(".schematic"))) {
                return f;
            }
        }

        return null;
    }

    // ========== STOP ==========

    public void stop() {
        if (!ensureReady()) return;
        LOGGER.info("Stopping all Baritone processes");
        baritone.getPathingBehavior().cancelEverything();
    }

    // ========== STATUS ==========

    public boolean isPathing() {
        return baritone != null && baritone.getPathingBehavior().isPathing();
    }

    public boolean hasActiveProcess() {
        return baritone != null &&
                baritone.getPathingControlManager().mostRecentInControl().isPresent();
    }

    public IBaritone getBaritone() {
        return baritone;
    }

    // ========== HELPERS ==========

    private boolean ensureReady() {
        if (baritone == null) {
            LOGGER.warn("Baritone not initialized, ignoring command");
            return false;
        }
        if (Minecraft.getInstance().player == null) {
            LOGGER.warn("Player is null, ignoring command");
            return false;
        }
        return true;
    }
}

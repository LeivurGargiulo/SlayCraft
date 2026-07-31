package com.bresenham.bot.task.impl;

import com.bresenham.bot.controller.BotController;
import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.AbstractStep;
import com.bresenham.bot.task.AbstractTask;
import com.bresenham.bot.task.TaskPriority;
import net.minecraft.block.Blocks;
import net.minecraft.util.math.BlockPos;

import java.util.List;

/**
 * Example task: Find and mine iron ore.
 * Steps:
 * 1. Scan for iron ore nearby
 * 2. Move to iron ore
 * 3. Mine the iron ore
 *
 * Metadata indicates this task requires a pickaxe, which the planner
 * will use to inject a CraftPickaxeTask if needed.
 */
public class MineIronTask extends AbstractTask {

    public MineIronTask() {
        super("mine_iron", TaskPriority.MEDIUM);
        setMetadata("requires_tool", "pickaxe");

        // Add a scan step that will find iron and add mine steps dynamically
        addStep(new ScanForIronStep());
    }

    /**
     * Step that scans for iron ore in the vicinity and creates mine steps.
     */
    private static class ScanForIronStep extends AbstractStep {
        ScanForIronStep() {
            super("scan_for_iron");
        }

        @Override
        public void run(BotController controller) {
            WorldState state = controller.getWorldState();
            BlockPos playerPos = state.getPosition();

            if (playerPos == null) {
                markComplete();
                return;
            }

            // Scan a 16-block radius for iron ore
            int scanRadius = 16;
            BlockPos foundOre = null;

            for (int x = -scanRadius; x <= scanRadius; x++) {
                for (int y = -scanRadius; y <= scanRadius; y++) {
                    for (int z = -scanRadius; z <= scanRadius; z++) {
                        BlockPos checkPos = playerPos.add(x, y, z);
                        if (state.getPlayer() != null
                                && state.getPlayer().getWorld().getBlockState(checkPos).getBlock() == Blocks.IRON_ORE) {
                            foundOre = checkPos;
                            state.addKnownResource(Blocks.IRON_ORE, checkPos);
                            break;
                        }
                    }
                    if (foundOre != null) break;
                }
                if (foundOre != null) break;
            }

            // If no iron found by scanning, check known resources
            if (foundOre == null) {
                List<BlockPos> known = state.getKnownResourceLocations(Blocks.IRON_ORE);
                if (!known.isEmpty()) {
                    foundOre = known.get(0);
                }
            }

            if (foundOre != null) {
                // Dynamically add steps to mine the found ore
                com.bresenham.bot.task.Task currentTask = controller.getTaskManager().getCurrentTask();
                if (currentTask instanceof MineIronTask parentTask) {
                    parentTask.addStep(new MoveToStep(foundOre));
                    parentTask.addStep(new MineBlockStep(foundOre));
                }
            }

            markComplete();
        }
    }
}

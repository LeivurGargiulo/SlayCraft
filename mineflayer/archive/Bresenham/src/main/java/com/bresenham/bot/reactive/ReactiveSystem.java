package com.bresenham.bot.reactive;

import com.bresenham.bot.BresenhamMod;
import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.Task;
import com.bresenham.bot.task.TaskManager;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Event-driven reactive system that monitors world state and interrupts
 * normal task execution when critical conditions are detected.
 *
 * This system ALWAYS runs before task execution in the tick cycle,
 * guaranteeing that safety behaviors override normal operations.
 */
public class ReactiveSystem {

    private final List<ReactiveRule> rules = new ArrayList<>();
    private final Map<String, Integer> cooldowns = new HashMap<>();

    public void addRule(ReactiveRule rule) {
        rules.add(rule);
    }

    /**
     * Check all reactive rules against current world state.
     * If any rule triggers, its response task interrupts the current task.
     * Called every tick BEFORE TaskManager.tick().
     */
    public void check(WorldState state, TaskManager taskManager) {
        for (ReactiveRule rule : rules) {
            // Check cooldown
            String ruleName = rule.getName();
            Integer cooldownRemaining = cooldowns.get(ruleName);
            if (cooldownRemaining != null && cooldownRemaining > 0) {
                cooldowns.put(ruleName, cooldownRemaining - 1);
                continue;
            }

            if (rule.shouldTrigger(state)) {
                Task responseTask = rule.createResponseTask();
                BresenhamMod.LOGGER.info("[Bresenham] Reactive rule '{}' triggered! Creating task '{}'.",
                        ruleName, responseTask.getName());

                taskManager.interruptWith(responseTask);

                // Set cooldown
                cooldowns.put(ruleName, rule.getCooldownTicks());
            }
        }
    }

    /**
     * Reset all cooldowns.
     */
    public void resetCooldowns() {
        cooldowns.clear();
    }

    public List<ReactiveRule> getRules() {
        return rules;
    }
}

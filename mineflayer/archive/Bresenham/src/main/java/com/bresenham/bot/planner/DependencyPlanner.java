package com.bresenham.bot.planner;

import com.bresenham.bot.BresenhamMod;
import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.Task;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Validates task preconditions and injects prerequisite tasks.
 * Supports recursive dependency resolution (prerequisites can have their own prerequisites).
 */
public class DependencyPlanner implements Planner {

    private final List<PlannerRule> rules = new ArrayList<>();
    private static final int MAX_DEPTH = 10; // Prevent infinite recursion

    public void addRule(PlannerRule rule) {
        rules.add(rule);
    }

    @Override
    public List<Task> plan(Task task, WorldState state) {
        List<Task> result = new ArrayList<>();
        Set<String> visited = new HashSet<>();
        resolveRecursive(task, state, result, visited, 0);
        return result;
    }

    private void resolveRecursive(Task task, WorldState state, List<Task> result,
                                   Set<String> visited, int depth) {
        if (depth > MAX_DEPTH) {
            BresenhamMod.LOGGER.warn("[Bresenham] Max planning depth reached for task '{}'.", task.getName());
            result.add(task);
            return;
        }

        // Prevent circular dependencies
        if (visited.contains(task.getName())) {
            BresenhamMod.LOGGER.warn("[Bresenham] Circular dependency detected for task '{}'.", task.getName());
            return;
        }
        visited.add(task.getName());

        // Check all rules for prerequisites
        for (PlannerRule rule : rules) {
            if (rule.appliesTo(task)) {
                List<Task> prerequisites = rule.getPrerequisites(task, state);
                for (Task prereq : prerequisites) {
                    // Recursively resolve prerequisites of prerequisites
                    resolveRecursive(prereq, state, result, visited, depth + 1);
                }
            }
        }

        // Add the original task last (after all prerequisites)
        result.add(task);
    }

    public List<PlannerRule> getRules() {
        return rules;
    }
}

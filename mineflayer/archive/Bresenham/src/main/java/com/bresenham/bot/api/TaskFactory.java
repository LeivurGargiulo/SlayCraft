package com.bresenham.bot.api;

import com.bresenham.bot.BresenhamMod;
import com.bresenham.bot.task.Task;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Registry that maps task names to Task constructors.
 * Enables task creation by name from commands or future REST API.
 */
public class TaskFactory {

    private final Map<String, Supplier<Task>> registry = new HashMap<>();

    /**
     * Register a task type by name.
     */
    public void registerTask(String name, Supplier<Task> supplier) {
        registry.put(name.toLowerCase(), supplier);
        BresenhamMod.LOGGER.debug("[Bresenham] Registered task: {}", name);
    }

    /**
     * Create a task instance by name.
     * @throws IllegalArgumentException if the task name is not registered
     */
    public Task createTask(String name) {
        Supplier<Task> supplier = registry.get(name.toLowerCase());
        if (supplier == null) {
            throw new IllegalArgumentException("Unknown task: " + name);
        }
        return supplier.get();
    }

    /**
     * @return list of all registered task names
     */
    public List<String> getAvailableTaskNames() {
        return new ArrayList<>(registry.keySet());
    }

    /**
     * @return true if a task with the given name is registered
     */
    public boolean hasTask(String name) {
        return registry.containsKey(name.toLowerCase());
    }
}

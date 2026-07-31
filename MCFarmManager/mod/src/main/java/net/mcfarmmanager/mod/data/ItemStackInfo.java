package net.mcfarmmanager.mod.data;

import java.util.List;
import java.util.stream.Stream;

public record ItemStackInfo(String itemId, int count, List<ItemStackInfo> shulkerContents) {
    /**
     * This stack's contents if it's a filled shulker box, otherwise the stack itself.
     * A filled box represents what's inside it, not an item of its own; an empty box
     * still counts as one shulker_box. Nesting is capped at one level, so no recursion.
     */
    public Stream<ItemStackInfo> selfAndContents() {
        return shulkerContents == null || shulkerContents.isEmpty() ? Stream.of(this) : shulkerContents.stream();
    }
}

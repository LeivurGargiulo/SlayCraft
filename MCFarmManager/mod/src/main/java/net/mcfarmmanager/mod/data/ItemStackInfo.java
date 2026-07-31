package net.mcfarmmanager.mod.data;

import java.util.List;
import java.util.stream.Stream;

public record ItemStackInfo(String itemId, int count, List<ItemStackInfo> shulkerContents) {
    /** This stack plus its shulker contents. Nesting is capped at one level, so no recursion. */
    public Stream<ItemStackInfo> selfAndContents() {
        return shulkerContents == null ? Stream.of(this) : Stream.concat(Stream.of(this), shulkerContents.stream());
    }
}

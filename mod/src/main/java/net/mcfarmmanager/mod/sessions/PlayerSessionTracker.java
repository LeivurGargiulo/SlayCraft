package net.mcfarmmanager.mod.sessions;

import java.util.function.IntSupplier;

/**
 * Free of Minecraft/Fabric types so it's unit-testable without a running server - the
 * extension wiring layer translates {@code ServerPlayConnectionEvents.JOIN}/{@code DISCONNECT}
 * callbacks (which hand over a {@code ServerGamePacketListenerImpl}) into calls here.
 */
public final class PlayerSessionTracker {
    private final PlayerSessionStore store;
    private final IntSupplier heartbeatIntervalMinutes;
    private long ticksSinceHeartbeat = 0;

    public PlayerSessionTracker(PlayerSessionStore store, IntSupplier heartbeatIntervalMinutes) {
        this.store = store;
        this.heartbeatIntervalMinutes = heartbeatIntervalMinutes;
    }

    public void onPlayerJoin(String playerName, boolean isFakePlayer, long atMillis) {
        if (isFakePlayer) {
            return;
        }
        store.openSession(playerName, atMillis);
    }

    public void onPlayerDisconnect(String playerName, boolean isFakePlayer, long atMillis) {
        if (isFakePlayer) {
            return;
        }
        store.closeSession(playerName, atMillis);
    }

    public void onEndTick() {
        long intervalTicks = heartbeatIntervalMinutes.getAsInt() * 60L * 20L;
        if (++ticksSinceHeartbeat < intervalTicks) {
            return;
        }
        ticksSinceHeartbeat = 0;
        store.recordHeartbeat(System.currentTimeMillis());
    }

    /** Call once at startup, before registering join/disconnect listeners, to close any
     * session left open by an unclean shutdown. */
    public void closeDanglingSessionsFromPreviousRun() {
        Long lastHeartbeat = store.lastHeartbeatMillis();
        store.closeDanglingSessions(lastHeartbeat != null ? lastHeartbeat : System.currentTimeMillis());
    }
}

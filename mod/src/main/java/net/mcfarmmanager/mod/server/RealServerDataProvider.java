// Confirmed via javap -p against the same Loom-remapped jars Task 4 used
// (minecraft-merged-...-1.21.11-loom.mappings...jar, fabric-carpet-1.21.11-1.4.194+v251223 remapped jar):
// - Real vs. fake players: PlayerList.getPlayers() (MinecraftServer.getPlayerList()), filtered with
//   "!(player instanceof carpet.patches.EntityPlayerMPFake)" - the same fake-player marker class Task 4
//   confirmed. ServerPlayer.level().dimension().identifier() gives the dimension id (Identifier, not
//   ResourceLocation, per the Task 4 mapping rename); ServerPlayer.gameMode().getSerializedName() gives
//   the lowercase gamemode string. com.mojang.authlib.GameProfile is itself a record in this authlib
//   version (7.0.61) - name() not getName() (confirmed via javap, not training-data Yarn-era API).
// - Per-dimension world state: MinecraftServer.getAllLevels() enumerates every ServerLevel. Level.getDayTime()
//   is a single ever-increasing counter (not reset per day), so timeOfDay = dayTime % 24000 and
//   dayCount = dayTime / 24000 are derived from it, matching vanilla's own debug-HUD day/time split.
//   Level.isRaining()/isThundering() and Level.getLevelData().getDifficulty().getKey() (lowercase, e.g.
//   "hard") cover weather/difficulty. ServerLevel.getChunkSource().getLoadedChunksCount() gives the loaded
//   chunk count (ServerChunkCache, confirmed distinct from the interface-typed ChunkSource overload).
// - Tick timing: this Carpet build (1.4.194+v251223) has no standalone TickSpeed/tick-tracking class of its
//   own for this version - carpet.mixins.MinecraftServer_tickspeedMixin only covers tick *rate control*
//   (freeze/step/sprint, i.e. what /tick backs). The actual timing *measurement* API is vanilla's own
//   MinecraftServer.getAverageTickTimeNanos()/getTickTimesNanos(), which is what vanilla's own "/tick query"
//   command (net.minecraft.server.commands.TickCommand) reads from - confirmed via its private
//   TICK_STATS_SPAN=100 constant matching this record's sampledOverTicks sample value exactly. Carpet doesn't
//   reimplement or wrap this in a newer class in this version, so this mod reads the same vanilla source
//   Carpet's own /tick-adjacent commands do, rather than hand-rolling a separate timing tracker.
package net.mcfarmmanager.mod.server;

import carpet.CarpetSettings;
import carpet.patches.EntityPlayerMPFake;
import net.fabricmc.loader.api.FabricLoader;
import net.mcfarmmanager.mod.MCFarmManagerMod;
import net.mcfarmmanager.mod.config.Position;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

/**
 * Read-only. Every method below only calls getters on Minecraft/Carpet types - no mutation of
 * world, entity, or player state anywhere in this class.
 *
 * Task 7 live verification found that ServerLevel/BlockEntity reads must happen on the server's
 * main thread (see RealFarmDataProvider's onMainThread for the confirmed root cause), so every
 * method here that touches live ServerLevel/ServerPlayer state hops onto it via
 * MinecraftServer.submit(...).join() rather than reading it from the HTTP thread pool directly.
 */
public final class RealServerDataProvider implements ServerDataProvider {
    private static final long DAY_LENGTH_TICKS = 24000L;

    private final Supplier<MinecraftServer> serverSupplier;
    private final long startTimeMillis = System.currentTimeMillis();

    public RealServerDataProvider(Supplier<MinecraftServer> serverSupplier) {
        this.serverSupplier = serverSupplier;
    }

    private static <T> T onMainThread(MinecraftServer server, Supplier<T> action, T fallback) {
        if (server.isSameThread()) {
            return action.get();
        }
        try {
            return server.submit(action).join();
        } catch (RuntimeException e) {
            MCFarmManagerMod.LOGGER.error("Failed to read server state on main thread: {}", e.getMessage());
            return fallback;
        }
    }

    @Override
    public List<PlayerInfo> players() {
        MinecraftServer server = serverSupplier.get();
        if (server == null) {
            return List.of();
        }
        return onMainThread(server, () -> {
            List<PlayerInfo> result = new ArrayList<>();
            for (ServerPlayer player : server.getPlayerList().getPlayers()) {
                if (player instanceof EntityPlayerMPFake) {
                    continue;
                }
                BlockPos pos = player.blockPosition();
                result.add(new PlayerInfo(
                        player.getGameProfile().name(),
                        player.level().dimension().identifier().toString(),
                        new Position(pos.getX(), pos.getY(), pos.getZ()),
                        player.gameMode().getSerializedName()));
            }
            return result;
        }, List.of());
    }

    @Override
    public List<DimensionState> worldState() {
        MinecraftServer server = serverSupplier.get();
        if (server == null) {
            return List.of();
        }
        return onMainThread(server, () -> {
            List<DimensionState> result = new ArrayList<>();
            for (ServerLevel level : server.getAllLevels()) {
                long dayTime = level.getDayTime();
                result.add(new DimensionState(
                        level.dimension().identifier().toString(),
                        dayTime % DAY_LENGTH_TICKS,
                        dayTime / DAY_LENGTH_TICKS,
                        level.isRaining(),
                        level.isThundering(),
                        level.getLevelData().getDifficulty().getKey(),
                        level.getChunkSource().getLoadedChunksCount()));
            }
            return result;
        }, List.of());
    }

    @Override
    public PerformanceInfo performance() {
        MinecraftServer server = serverSupplier.get();
        if (server == null) {
            return new PerformanceInfo(0.0, 0.0, 0);
        }
        return onMainThread(server, () -> {
            double meanTickTimeMs = server.getAverageTickTimeNanos() / 1_000_000.0;
            double tps = meanTickTimeMs <= 0.0 ? 20.0 : Math.min(20.0, 1000.0 / meanTickTimeMs);
            return new PerformanceInfo(tps, meanTickTimeMs, server.getTickTimesNanos().length);
        }, new PerformanceInfo(0.0, 0.0, 0));
    }

    @Override
    public StatusInfo status(int farmCount) {
        MinecraftServer server = serverSupplier.get();
        String minecraftVersion = server == null ? "unknown" : server.getServerVersion();
        String modVersion = FabricLoader.getInstance().getModContainer("mcfarmmanager")
                .map(mod -> mod.getMetadata().getVersion().getFriendlyString())
                .orElse("unknown");
        long uptimeSeconds = (System.currentTimeMillis() - startTimeMillis) / 1000;
        return new StatusInfo(modVersion, minecraftVersion, CarpetSettings.carpetVersion, uptimeSeconds, farmCount);
    }
}

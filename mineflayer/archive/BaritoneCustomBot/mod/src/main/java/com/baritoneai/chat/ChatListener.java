package com.baritoneai.chat;

import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.minecraft.client.Minecraft;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.function.BiConsumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ChatListener {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-ChatListener");

    // Extracts sender + full message from chat formats:
    // <PlayerName> message text
    // [PlayerName] message text
    // PlayerName: message text
    private static final Pattern SENDER_PATTERN = Pattern.compile(
            "^(?:<(\\w+)>|\\[(\\w+)\\]|(\\w+):)\\s+(.+)$"
    );

    private volatile String botName = "Bot";
    private BiConsumer<String, String> onBotCommand;

    // Deduplication: prevent dual CHAT+GAME event from processing same message twice
    private String lastMessageText = "";
    private long lastMessageTime = 0;

    /**
     * Set the bot name used for mention detection.
     */
    public void setBotName(String name) {
        if (name != null && !name.isEmpty()) {
            this.botName = name;
            LOGGER.info("Bot name set to: {}", name);
        }
    }

    /**
     * Register the chat listener. The callback receives (senderName, fullMessage).
     */
    public void register(BiConsumer<String, String> onBotCommand) {
        this.onBotCommand = onBotCommand;

        ClientReceiveMessageEvents.CHAT.register((message, signedMessage, sender, params, timestamp) -> {
            String text = message.getString();
            handleChatMessage(text);
        });

        ClientReceiveMessageEvents.GAME.register((message, overlay) -> {
            if (!overlay) {
                String text = message.getString();
                handleChatMessage(text);
            }
        });

        LOGGER.info("Chat listener registered");
    }

    private void handleChatMessage(String text) {
        if (text == null || text.isEmpty()) return;

        // Deduplicate: skip if same message processed within 500ms (dual CHAT+GAME event)
        long now = System.currentTimeMillis();
        if (text.equals(lastMessageText) && now - lastMessageTime < 500) {
            return;
        }
        lastMessageText = text;
        lastMessageTime = now;

        Matcher matcher = SENDER_PATTERN.matcher(text);
        if (!matcher.matches()) return;

        // Extract sender from whichever capture group matched
        String senderName = matcher.group(1); // <Player>
        if (senderName == null) senderName = matcher.group(2); // [Player]
        if (senderName == null) senderName = matcher.group(3); // Player:

        if (senderName == null) return;

        // Skip messages from ourselves
        Minecraft mc = Minecraft.getInstance();
        if (mc.player != null && senderName.equals(mc.player.getName().getString())) {
            return;
        }

        String fullMessage = matcher.group(4).trim();

        // Check if bot name is mentioned anywhere in the message
        if (!containsBotName(fullMessage)) return;

        LOGGER.info("Bot mention from '{}': '{}'", senderName, fullMessage);

        if (onBotCommand != null) {
            onBotCommand.accept(senderName, fullMessage);
        }
    }

    /**
     * Check if the bot name appears in the message as a whole word (case-insensitive).
     */
    private boolean containsBotName(String message) {
        String lower = message.toLowerCase();
        String nameLower = botName.toLowerCase();
        int idx = lower.indexOf(nameLower);
        if (idx < 0) return false;

        // Check word boundaries
        boolean startOk = idx == 0 || !Character.isLetterOrDigit(lower.charAt(idx - 1));
        boolean endOk = idx + nameLower.length() >= lower.length()
                || !Character.isLetterOrDigit(lower.charAt(idx + nameLower.length()));
        return startOk && endOk;
    }
}

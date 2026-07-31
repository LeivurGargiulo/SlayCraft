package com.baritoneai.chat;

import net.minecraft.client.Minecraft;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ChatSender {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-Chat");
    private static final int MAX_CHAT_LENGTH = 256;

    public static void sendChat(String message) {
        if (message == null || message.isEmpty()) return;

        Minecraft mc = Minecraft.getInstance();
        mc.execute(() -> {
            if (mc.player != null && mc.player.connection != null) {
                // Split long messages into chunks
                String[] chunks = splitMessage(message, MAX_CHAT_LENGTH);
                for (String chunk : chunks) {
                    mc.player.connection.sendChat(chunk);
                }
            }
        });
    }

    public static void sendCommand(String command) {
        if (command == null || command.isEmpty()) return;

        Minecraft mc = Minecraft.getInstance();
        mc.execute(() -> {
            if (mc.player != null && mc.player.connection != null) {
                // Remove leading slash if present
                if (command.startsWith("/")) {
                    mc.player.connection.sendCommand(command.substring(1));
                } else {
                    mc.player.connection.sendCommand(command);
                }
            }
        });
    }

    private static String[] splitMessage(String message, int maxLength) {
        if (message.length() <= maxLength) {
            return new String[]{message};
        }

        int chunks = (message.length() + maxLength - 1) / maxLength;
        String[] result = new String[chunks];
        for (int i = 0; i < chunks; i++) {
            int start = i * maxLength;
            int end = Math.min(start + maxLength, message.length());
            result[i] = message.substring(start, end);
        }
        return result;
    }
}

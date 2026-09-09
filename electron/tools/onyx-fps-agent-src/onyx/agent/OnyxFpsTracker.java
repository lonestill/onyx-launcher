package onyx.agent;

import java.io.*;
import java.util.Locale;

public class OnyxFpsTracker {
    private static volatile PrintWriter writer = null;
    private static volatile long startNano = 0;
    private static volatile long lastNano = 0;
    private static volatile int frameCount = 0;
    private static final Object lock = new Object();

    public static void init(String path) {
        if (path == null || path.trim().isEmpty()) return;
        try {
            File file = new File(path.trim());
            File parent = file.getParentFile();
            if (parent != null) parent.mkdirs();
            writer = new PrintWriter(new BufferedWriter(new FileWriter(file, false), 65536));
            writer.println("TimeInSeconds,MsBetweenPresents,FPS");
            writer.flush();
            startNano = System.nanoTime();
            lastNano = startNano;

            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                synchronized (lock) {
                    if (writer != null) {
                        try {
                            writer.flush();
                            writer.close();
                        } catch (Exception ignored) {}
                        writer = null;
                    }
                }
            }));
        } catch (Exception e) {
            System.err.println("[OnyxFpsAgent] Failed to initialize: " + e.getMessage());
        }
    }

    public static void onFrame() {
        if (writer == null) return;
        long now = System.nanoTime();
        long last = lastNano;
        lastNano = now;

        if (last > 0) {
            long delta = now - last;
            if (delta > 0) {
                double frameTimeMs = delta / 1_000_000.0;
                double seconds = (now - startNano) / 1_000_000_000.0;
                double fps = 1_000_000_000.0 / delta;
                synchronized (lock) {
                    if (writer != null) {
                        writer.printf(Locale.US, "%.3f,%.2f,%.1f\n", seconds, frameTimeMs, fps);
                        frameCount++;
                        if ((frameCount & 63) == 0) {
                            writer.flush();
                        }
                    }
                }
            }
        }
    }
}

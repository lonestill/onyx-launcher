package onyx.agent;

import net.bytebuddy.asm.Advice;

public class OnyxFpsAdvice {
    @Advice.OnMethodEnter
    public static void onEnter() {
        OnyxFpsTracker.onFrame();
    }
}

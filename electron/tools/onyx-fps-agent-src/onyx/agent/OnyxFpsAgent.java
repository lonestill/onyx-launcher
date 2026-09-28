package onyx.agent;

import java.io.File;
import java.lang.instrument.Instrumentation;
import java.util.jar.JarFile;
import net.bytebuddy.agent.builder.AgentBuilder;
import net.bytebuddy.matcher.ElementMatchers;
import net.bytebuddy.asm.Advice;

public class OnyxFpsAgent {
    public static void premain(String agentArgs, Instrumentation inst) {
        try {
            File agentJar = new File(OnyxFpsAgent.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            if (agentJar.exists()) {
                inst.appendToBootstrapClassLoaderSearch(new JarFile(agentJar));
                inst.appendToSystemClassLoaderSearch(new JarFile(agentJar));
            }
        } catch (Throwable ignored) {
        }

        OnyxFpsTracker.init(agentArgs);

        new AgentBuilder.Default()
            .with(AgentBuilder.RedefinitionStrategy.DISABLED)
            .type(ElementMatchers.named("org.lwjgl.glfw.GLFW").or(ElementMatchers.named("org.lwjgl.opengl.Display")))
            .transform((builder, typeDescription, classLoader, module, protectionDomain) ->
                builder.visit(Advice.to(OnyxFpsAdvice.class).on(
                    ElementMatchers.named("glfwSwapBuffers").or(
                        ElementMatchers.named("update").and(ElementMatchers.takesNoArguments())
                    )
                ))
            )
            .installOn(inst);
    }
}

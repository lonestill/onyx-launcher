# Onyx FPS Agent

A lightweight JVM agent that hooks GLFW/LWJGL frame presentation (`glfwSwapBuffers` / `Display.update`) to record exact frame-times and FPS metrics without external OS tools.

## Build Instructions

Requirements:
- Java JDK 8 or higher
- Byte Buddy JAR (e.g. `byte-buddy-1.14.12.jar`)

```bash
# Download byte-buddy if needed
curl -sLO https://repo1.maven.org/maven2/net/bytebuddy/byte-buddy/1.14.12/byte-buddy-1.14.12.jar

# Compile sources
javac --release 8 -cp byte-buddy-1.14.12.jar onyx/agent/*.java

# Create manifest
echo "Premain-Class: onyx.agent.OnyxFpsAgent
Can-Redefine-Classes: true
Can-Retransform-Classes: true" > manifest.txt

# Extract byte-buddy classes to merge into fat JAR
mkdir -p build && cd build
jar -xf ../byte-buddy-1.14.12.jar
cp -r ../onyx .
jar -cfm ../../onyx-fps-agent.jar ../manifest.txt .
cd .. && rm -rf build manifest.txt
```

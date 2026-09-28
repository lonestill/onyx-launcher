import React, { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import {
  Box,
  Check,
  Download,
  Layers,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Search,
  Swords,
  Trash2,
  X,
} from "lucide-react";
import type {
  GameInstance,
  ResourcePackInspectResult,
} from "../types";

interface ResourcePack3DViewerProps {
  packData: ResourcePackInspectResult;
  instances?: GameInstance[];
  onInstall?: (instanceId: string, tempFilePath: string) => Promise<void>;
  onClose: () => void;
}

function disposeHierarchy(obj: THREE.Object3D | null) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            if ("map" in mat && mat.map && typeof (mat.map as THREE.Texture).dispose === "function") {
              (mat.map as THREE.Texture).dispose();
            }
            mat.dispose();
          });
        } else {
          if (
            "map" in child.material &&
            child.material.map &&
            typeof (child.material.map as THREE.Texture).dispose === "function"
          ) {
            (child.material.map as THREE.Texture).dispose();
          }
          child.material.dispose();
        }
      }
    }
  });
}

export function ResourcePack3DViewer({
  packData,
  instances = [],
  onInstall,
  onClose,
}: ResourcePack3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const currentMeshRef = useRef<THREE.Object3D | null>(null);

  const guiList = useMemo(() => packData.gui || [], [packData.gui]);

  const [activeTab, setActiveTab] = useState<"blocks" | "items" | "gui">(() => {
    if (packData.blocks.length > 0) return "blocks";
    if (packData.items.length > 0) return "items";
    if ((packData.gui?.length || 0) > 0) return "gui";
    return "blocks";
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState<string>(
    packData.blocks[0]?.id || "",
  );
  const [selectedItemId, setSelectedItemId] = useState<string>(
    packData.items[0]?.id || "",
  );
  const [selectedGuiId, setSelectedGuiId] = useState<string>(
    packData.gui?.[0]?.id || "",
  );

  const [autoRotate, setAutoRotate] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(
    instances[0]?.id || "",
  );
  const [installedSuccess, setInstalledSuccess] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  // Active Tab and on-demand rendering refs
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const renderCountRef = useRef(15);
  const markNeedsRender = (frames = 5) => {
    renderCountRef.current = Math.max(renderCountRef.current, frames);
  };

  // Rotation & Drag state
  const isDraggingRef = useRef(false);
  const prevMousePosRef = useRef({ x: 0, y: 0 });
  const rotationVelocityRef = useRef({ x: 0, y: 0.006 });
  const autoRotateRef = useRef(autoRotate);
  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  const searchQueryLower = searchQuery.trim().toLowerCase();

  const filteredBlocks = useMemo(() => {
    if (!searchQueryLower) return packData.blocks;
    return packData.blocks.filter(
      (b) =>
        b.name.toLowerCase().includes(searchQueryLower) ||
        b.id.toLowerCase().includes(searchQueryLower),
    );
  }, [packData.blocks, searchQueryLower]);

  const filteredItems = useMemo(() => {
    if (!searchQueryLower) return packData.items;
    return packData.items.filter(
      (i) =>
        i.name.toLowerCase().includes(searchQueryLower) ||
        i.id.toLowerCase().includes(searchQueryLower),
    );
  }, [packData.items, searchQueryLower]);

  const filteredGui = useMemo(() => {
    if (!searchQueryLower) return guiList;
    return guiList.filter(
      (g) =>
        g.name.toLowerCase().includes(searchQueryLower) ||
        g.id.toLowerCase().includes(searchQueryLower) ||
        g.category.toLowerCase().includes(searchQueryLower),
    );
  }, [guiList, searchQueryLower]);

  const currentBlock = useMemo(
    () =>
      filteredBlocks.find((b) => b.id === selectedBlockId) ||
      filteredBlocks[0] ||
      packData.blocks.find((b) => b.id === selectedBlockId) ||
      packData.blocks[0],
    [filteredBlocks, packData.blocks, selectedBlockId],
  );

  const currentItem = useMemo(
    () =>
      filteredItems.find((i) => i.id === selectedItemId) ||
      filteredItems[0] ||
      packData.items.find((i) => i.id === selectedItemId) ||
      packData.items[0],
    [filteredItems, packData.items, selectedItemId],
  );

  const currentGui = useMemo(
    () =>
      filteredGui.find((g) => g.id === selectedGuiId) ||
      filteredGui[0] ||
      guiList.find((g) => g.id === selectedGuiId) ||
      guiList[0],
    [filteredGui, guiList, selectedGuiId],
  );

  // Three.js Scene Setup
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 420;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 1.2, 3.8);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
      precision: "mediump",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight1.position.set(3, 6, 4);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xaaccff, 0.6);
    dirLight2.position.set(-3, -2, -3);
    scene.add(dirLight2);

    // Subtle floor shadow circle
    const shadowGeo = new THREE.CircleGeometry(1.2, 32);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.1;
    scene.add(shadow);

    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (activeTabRef.current === "gui") {
        return;
      }

      let shouldRender = renderCountRef.current > 0;
      if (renderCountRef.current > 0) {
        renderCountRef.current--;
      }

      if (currentMeshRef.current) {
        if (autoRotateRef.current && !isDraggingRef.current) {
          currentMeshRef.current.rotation.y += 0.008;
          shouldRender = true;
        } else if (!isDraggingRef.current) {
          const vx = rotationVelocityRef.current.x;
          const vy = rotationVelocityRef.current.y;
          if (Math.abs(vx) > 0.0001 || Math.abs(vy) > 0.0001) {
            currentMeshRef.current.rotation.y += vy;
            currentMeshRef.current.rotation.x += vx;
            rotationVelocityRef.current.x *= 0.92;
            rotationVelocityRef.current.y *= 0.92;
            shouldRender = true;
          }
        } else {
          shouldRender = true;
        }
      }

      if (shouldRender) {
        renderer.render(scene, camera);
      }
    };

    animate();

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      markNeedsRender(4);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      if (currentMeshRef.current) {
        scene.remove(currentMeshRef.current);
        disposeHierarchy(currentMeshRef.current);
        currentMeshRef.current = null;
      }
      shadowGeo.dispose();
      shadowMat.dispose();
      renderer.dispose();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    if (rendererRef.current?.domElement) {
      rendererRef.current.domElement.style.display = activeTab === "gui" ? "none" : "block";
    }
    if (activeTab === "gui" && currentMeshRef.current && sceneRef.current) {
      sceneRef.current.remove(currentMeshRef.current);
      disposeHierarchy(currentMeshRef.current);
      currentMeshRef.current = null;
    } else {
      markNeedsRender(5);
    }
  }, [activeTab]);

  // Texture Loader helper with Minecraft NearestFilter and animation strip cropping
  const loadPixelTexture = (dataUrl: string, onTextureLoaded?: () => void): THREE.Texture => {
    const loader = new THREE.TextureLoader();
    const texture = loader.load(dataUrl, (loadedTex) => {
      const img = loadedTex.image;
      if (img && img.height > img.width && img.height % img.width === 0) {
        const frames = img.height / img.width;
        // Show first frame: repeat = (1, 1/frames), offset = (0, 1 - 1/frames) for WebGL bottom-left UV origin
        loadedTex.repeat.set(1, 1 / frames);
        loadedTex.offset.set(0, 1 - 1 / frames);
        loadedTex.needsUpdate = true;
      }
      if (onTextureLoaded) {
        onTextureLoaded();
      }
    });
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  // Build Block Mesh
  useEffect(() => {
    if (activeTab !== "blocks" || !sceneRef.current) return;
    const scene = sceneRef.current;

    if (currentMeshRef.current) {
      scene.remove(currentMeshRef.current);
      disposeHierarchy(currentMeshRef.current);
      currentMeshRef.current = null;
      markNeedsRender(2);
    }

    if (!currentBlock) return;

    const { textures, transparent } = currentBlock;
    const onTexLoad = () => markNeedsRender(4);
    const texRight = loadPixelTexture(textures.right || textures.sides || textures.top, onTexLoad);
    const texLeft = loadPixelTexture(textures.left || textures.sides || textures.top, onTexLoad);
    const texTop = loadPixelTexture(textures.top, onTexLoad);
    const texBottom = loadPixelTexture(textures.bottom || textures.top, onTexLoad);
    const texFront = loadPixelTexture(textures.front || textures.sides || textures.top, onTexLoad);
    const texBack = loadPixelTexture(textures.back || textures.sides || textures.top, onTexLoad);

    const makeMat = (map: THREE.Texture) =>
      new THREE.MeshStandardMaterial({
        map,
        roughness: 0.85,
        metalness: 0.05,
        transparent: Boolean(transparent),
        opacity: transparent ? 0.75 : 1.0,
      });

    // Materials order for BoxGeometry: [right, left, top, bottom, front, back]
    const materials = [
      makeMat(texRight),
      makeMat(texLeft),
      makeMat(texTop),
      makeMat(texBottom),
      makeMat(texFront),
      makeMat(texBack),
    ];

    const geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.position.set(0, 0, 0);
    mesh.rotation.x = 0.35;
    mesh.rotation.y = 0.55;

    scene.add(mesh);
    currentMeshRef.current = mesh;
    markNeedsRender(6);
  }, [activeTab, currentBlock]);

  // Build 3D Extruded Voxel Item Mesh using high-performance InstancedMesh
  useEffect(() => {
    if (activeTab !== "items" || !sceneRef.current) return;
    const scene = sceneRef.current;

    if (currentMeshRef.current) {
      scene.remove(currentMeshRef.current);
      disposeHierarchy(currentMeshRef.current);
      currentMeshRef.current = null;
      markNeedsRender(2);
    }

    if (!currentItem) return;

    let isCurrent = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = currentItem.texture;

    img.onload = () => {
      if (!isCurrent || !sceneRef.current) return;

      const rawWidth = img.width || 16;
      let rawHeight = img.height || 16;

      // Handle vertical animation strips (e.g. 16x512)
      if (rawHeight > rawWidth && rawHeight % rawWidth === 0) {
        rawHeight = rawWidth;
      }

      // Limit resolution to 32x32 max to prevent lag on 64x / 128x / 512x HD texture packs
      const maxDim = 32;
      let targetW = rawWidth;
      let targetH = rawHeight;
      if (targetW > maxDim || targetH > maxDim) {
        const scale = maxDim / Math.max(targetW, targetH);
        targetW = Math.max(1, Math.round(targetW * scale));
        targetH = Math.max(1, Math.round(targetH * scale));
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.imageSmoothingEnabled = false;
      // Draw first frame onto canvas (downscaled if HD)
      ctx.drawImage(img, 0, 0, rawWidth, rawHeight, 0, 0, targetW, targetH);
      const imgData = ctx.getImageData(0, 0, targetW, targetH).data;

      // Count solid pixels
      let solidCount = 0;
      for (let i = 3; i < imgData.length; i += 4) {
        if (imgData[i] > 25) {
          solidCount++;
        }
      }

      if (solidCount === 0) return;

      const pixelSize = 1.8 / Math.max(targetW, targetH);
      const thickness = pixelSize * 0.85;
      const boxGeo = new THREE.BoxGeometry(pixelSize, pixelSize, thickness);
      const sharedMat = new THREE.MeshStandardMaterial({
        roughness: 0.65,
        metalness: 0.08,
      });

      const instancedMesh = new THREE.InstancedMesh(boxGeo, sharedMat, solidCount);
      const dummy = new THREE.Object3D();
      const tempColor = new THREE.Color();

      let instanceIdx = 0;
      for (let y = 0; y < targetH; y++) {
        for (let x = 0; x < targetW; x++) {
          const idx = (y * targetW + x) * 4;
          const alpha = imgData[idx + 3];
          if (alpha > 25) {
            dummy.position.set(
              (x - targetW / 2 + 0.5) * pixelSize,
              (targetH / 2 - y - 0.5) * pixelSize,
              0,
            );
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(instanceIdx, dummy.matrix);

            tempColor.setRGB(imgData[idx] / 255, imgData[idx + 1] / 255, imgData[idx + 2] / 255);
            instancedMesh.setColorAt(instanceIdx, tempColor);
            instanceIdx++;
          }
        }
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
      if (instancedMesh.instanceColor) {
        instancedMesh.instanceColor.needsUpdate = true;
      }

      // Tilt like in Minecraft hand
      instancedMesh.rotation.z = -Math.PI / 4;
      instancedMesh.rotation.x = 0.2;
      instancedMesh.position.set(0, 0, 0);

      sceneRef.current.add(instancedMesh);
      currentMeshRef.current = instancedMesh;
      markNeedsRender(6);
    };

    return () => {
      isCurrent = false;
    };
  }, [activeTab, currentItem]);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    prevMousePosRef.current = { x: e.clientX, y: e.clientY };
    markNeedsRender(4);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !currentMeshRef.current) return;
    const deltaX = e.clientX - prevMousePosRef.current.x;
    const deltaY = e.clientY - prevMousePosRef.current.y;

    currentMeshRef.current.rotation.y += deltaX * 0.012;
    currentMeshRef.current.rotation.x += deltaY * 0.012;

    rotationVelocityRef.current = {
      x: deltaY * 0.005,
      y: deltaX * 0.005,
    };

    prevMousePosRef.current = { x: e.clientX, y: e.clientY };
    markNeedsRender(4);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!cameraRef.current) return;
    cameraRef.current.position.z = Math.min(
      Math.max(cameraRef.current.position.z + e.deltaY * 0.003, 1.8),
      6.0,
    );
    markNeedsRender(4);
  };

  const handleResetCamera = () => {
    if (cameraRef.current) cameraRef.current.position.set(0, 1.2, 3.8);
    if (currentMeshRef.current) {
      currentMeshRef.current.rotation.set(0.35, 0.55, 0);
    }
    markNeedsRender(4);
  };

  const handleCloseAndCleanup = async () => {
    if (packData.tempFilePath) {
      try {
        await window.onyx.resourcepack.cleanupPreview(packData.tempFilePath);
      } catch {
        // Ignored
      }
    }
    onClose();
  };

  const handleApplyInstall = async () => {
    if (!packData.tempFilePath || !selectedInstanceId) return;
    setIsInstalling(true);
    setInstallError(null);
    try {
      if (onInstall) {
        await onInstall(selectedInstanceId, packData.tempFilePath);
      } else {
        await window.onyx.resourcepack.installPreview({
          tempFilePath: packData.tempFilePath,
          instanceId: selectedInstanceId,
          filename: `${packData.name}.zip`,
        });
      }
      setInstalledSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err) {
      console.error("Failed to install resource pack preview:", err);
      setInstallError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="rpack-preview-modal-overlay">
      <div className="rpack-preview-modal glass-panel">
        {/* Header */}
        <div className="rpack-preview-header">
          <div className="rpack-preview-title-box">
            <div className="rpack-preview-icon-frame">
              {packData.iconDataUrl ? (
                <img src={packData.iconDataUrl} alt="" />
              ) : (
                <Box size={22} color="#38d68f" />
              )}
            </div>
            <div>
              <div className="rpack-badge-row">
                <span className="rpack-tag rpack-tag--green">3D WebGL Engine</span>
                {packData.packFormat ? (
                  <span className="rpack-tag">Формат {packData.packFormat}</span>
                ) : null}
                <span className="rpack-tag">{packData.totalTextures} текстур</span>
              </div>
              <h2>{packData.name}</h2>
            </div>
          </div>

          <button
            type="button"
            className="icon-button rpack-close-btn"
            onClick={handleCloseAndCleanup}
            title="Закрыть и очистить кэш"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Grid: 3D Stage + Texture Selector */}
        <div className="rpack-preview-body">
          {/* Left: Interactive 3D Canvas */}
          <div
            className="rpack-3d-stage"
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            {/* View Controls Toolbar (only for 3D tabs) */}
            {activeTab !== "gui" && (
              <div className="rpack-stage-toolbar">
                <button
                  type="button"
                  className={`rpack-tool-btn ${autoRotate ? "is-active" : ""}`}
                  onClick={() => setAutoRotate(!autoRotate)}
                  title={autoRotate ? "Пауза вращения" : "Включить авто-вращение"}
                >
                  {autoRotate ? <Pause size={13} /> : <Play size={13} />}
                  <span>{autoRotate ? "Вращение" : "Стоп"}</span>
                </button>

                <button
                  type="button"
                  className="rpack-tool-btn"
                  onClick={handleResetCamera}
                  title="Сбросить камеру"
                >
                  <RotateCcw size={13} />
                  <span>Сброс</span>
                </button>
              </div>
            )}

            {/* Hint overlay (only for 3D tabs) */}
            {activeTab !== "gui" && (
              <div className="rpack-stage-hint">
                <span>Крути мышью · Колесико — зум</span>
              </div>
            )}

            {/* Dedicated 2D GUI Stage */}
            {activeTab === "gui" && (
              <div className="rpack-gui-stage">
                {currentGui ? (
                  <div className="rpack-gui-viewport">
                    <div className="rpack-gui-checker">
                      <img
                        src={currentGui.texture}
                        alt={currentGui.name}
                        className="rpack-gui-img"
                      />
                    </div>
                    <div className="rpack-gui-meta-bar">
                      <span className="rpack-tag rpack-tag--green">
                        {currentGui.category === "container"
                          ? "Контейнер"
                          : currentGui.category === "hud"
                            ? "Хотбар / HUD"
                            : currentGui.category === "title"
                              ? "Логотип"
                              : "Интерфейс"}
                      </span>
                      <code className="rpack-gui-id">{currentGui.id}</code>
                    </div>
                  </div>
                ) : (
                  <div className="rpack-empty-list">
                    <span>
                      {searchQuery
                        ? `Ничего не найдено по запросу «${searchQuery}»`
                        : "В этом ресурспаке нет текстур интерфейса"}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="rpack-stage-current-label">
              <strong>
                {activeTab === "blocks"
                  ? currentBlock?.name ||
                    (filteredBlocks.length === 0 ? "Блоки не найдены" : "Выберите блок")
                  : activeTab === "items"
                    ? currentItem?.name ||
                      (filteredItems.length === 0 ? "Предметы не найдены" : "Выберите предмет")
                    : currentGui?.name ||
                      (filteredGui.length === 0 ? "Интерфейс не найден" : "Выберите элемент")}
              </strong>
            </div>
          </div>

          {/* Right: Category Tabs & Selectable Items */}
          <div className="rpack-selector-sidebar">
            {/* Search bar */}
            <div className="rpack-search-bar">
              <div className="rpack-search-input-wrap">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Поиск по названию или id..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rpack-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="rpack-search-clear"
                    onClick={() => setSearchQuery("")}
                    title="Очистить"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="rpack-tab-switch">
              <button
                type="button"
                className={`rpack-tab-btn ${activeTab === "blocks" ? "is-active" : ""}`}
                onClick={() => setActiveTab("blocks")}
                disabled={packData.blocks.length === 0}
              >
                <Box size={14} />
                <span>Блоки ({filteredBlocks.length})</span>
              </button>
              <button
                type="button"
                className={`rpack-tab-btn ${activeTab === "items" ? "is-active" : ""}`}
                onClick={() => setActiveTab("items")}
                disabled={packData.items.length === 0}
              >
                <Swords size={14} />
                <span>Предметы ({filteredItems.length})</span>
              </button>
              <button
                type="button"
                className={`rpack-tab-btn ${activeTab === "gui" ? "is-active" : ""}`}
                onClick={() => setActiveTab("gui")}
                disabled={guiList.length === 0}
              >
                <Layers size={14} />
                <span>Интерфейс ({filteredGui.length})</span>
              </button>
            </div>

            {/* List of items/blocks/gui */}
            <div className="rpack-elements-scroll">
              {activeTab === "blocks" ? (
                <>
                  {filteredBlocks.map((block) => (
                    <button
                      key={block.id}
                      type="button"
                      className={`rpack-thumb-card ${
                        selectedBlockId === block.id ? "is-selected" : ""
                      }`}
                      onClick={() => {
                        setSelectedBlockId(block.id);
                        markNeedsRender(6);
                      }}
                    >
                      <div className="rpack-thumb-img">
                        <img src={block.textures.top} alt={block.name} loading="lazy" decoding="async" />
                      </div>
                      <div className="rpack-thumb-info">
                        <span className="rpack-thumb-name">{block.name}</span>
                        <span className="rpack-thumb-id">{block.id}</span>
                      </div>
                    </button>
                  ))}
                  {filteredBlocks.length === 0 && (
                    <div className="rpack-empty-list">
                      <span>
                        {searchQuery
                          ? `Ничего не найдено по запросу «${searchQuery}»`
                          : "В этом ресурспаке нет текстур блоков"}
                      </span>
                    </div>
                  )}
                </>
              ) : activeTab === "items" ? (
                <>
                  {filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`rpack-thumb-card ${
                        selectedItemId === item.id ? "is-selected" : ""
                      }`}
                      onClick={() => {
                        setSelectedItemId(item.id);
                        markNeedsRender(6);
                      }}
                    >
                      <div className="rpack-thumb-img">
                        <img src={item.texture} alt={item.name} loading="lazy" decoding="async" />
                      </div>
                      <div className="rpack-thumb-info">
                        <span className="rpack-thumb-name">{item.name}</span>
                        <span className="rpack-thumb-id">{item.id}</span>
                      </div>
                    </button>
                  ))}
                  {filteredItems.length === 0 && (
                    <div className="rpack-empty-list">
                      <span>
                        {searchQuery
                          ? `Ничего не найдено по запросу «${searchQuery}»`
                          : "В этом ресурспаке нет текстур предметов"}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {filteredGui.map((guiItem) => (
                    <button
                      key={guiItem.id}
                      type="button"
                      className={`rpack-thumb-card ${
                        selectedGuiId === guiItem.id ? "is-selected" : ""
                      }`}
                      onClick={() => setSelectedGuiId(guiItem.id)}
                    >
                      <div className="rpack-thumb-img rpack-thumb-img--gui">
                        <img src={guiItem.texture} alt={guiItem.name} loading="lazy" decoding="async" />
                      </div>
                      <div className="rpack-thumb-info">
                        <span className="rpack-thumb-name">{guiItem.name}</span>
                        <span className="rpack-thumb-id">{guiItem.id}</span>
                      </div>
                    </button>
                  ))}
                  {filteredGui.length === 0 && (
                    <div className="rpack-empty-list">
                      <span>
                        {searchQuery
                          ? `Ничего не найдено по запросу «${searchQuery}»`
                          : "В этом ресурспаке нет текстур интерфейса"}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer: Install or Discard */}
        <div className="rpack-preview-footer">
          <div className="rpack-footer-left">
            {packData.tempFilePath && (
              <span className="rpack-temp-note">
                <Trash2 size={12} />
                При закрытии временный файл скачивания удалится без следа
              </span>
            )}
          </div>

          <div className="rpack-footer-actions">
            {installError && (
              <span style={{ color: "#ef4444", fontSize: "12px", marginRight: "auto" }}>
                {installError}
              </span>
            )}

            <button
              type="button"
              className="button button--ghost"
              onClick={handleCloseAndCleanup}
              disabled={isInstalling}
            >
              Отмена
            </button>

            {packData.tempFilePath && instances.length > 0 && (
              <div className="rpack-install-combo">
                <select
                  value={selectedInstanceId}
                  onChange={(e) => setSelectedInstanceId(e.target.value)}
                  className="rpack-instance-select"
                >
                  {instances.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name} ({inst.version})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="button button--primary"
                  onClick={handleApplyInstall}
                  disabled={isInstalling || installedSuccess}
                >
                  {isInstalling ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : installedSuccess ? (
                    <Check size={14} />
                  ) : (
                    <Download size={14} />
                  )}
                  <span>
                    {installedSuccess
                      ? "Установлено!"
                      : isInstalling
                        ? "Установка..."
                        : "Установить в сборку"}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Users2,
  ArrowRight,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Box,
  ChevronDown,
} from "lucide-react";
import { useI18n } from "../i18n";
import type { GameInstance, PartyDiffResult, PartyRoomState } from "../types";

interface JoinPartyModalProps {
  open: boolean;
  initialCode?: string | null;
  instances: GameInstance[];
  onClose: () => void;
  onJoinSuccess: (instance: GameInstance, room: PartyRoomState) => void;
  onNotify: (tone: "success" | "warning" | "info", title: string, message: string) => void;
}

function extractRoomCode(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const match = trimmed.match(/^onyx:\/\/party\/([a-zA-Z0-9_-]+)/i) || trimmed.match(/\/party\/([a-zA-Z0-9_-]+)/i);
  if (match) return match[1].toUpperCase();
  return trimmed.toUpperCase();
}

export function JoinPartyModal({
  open,
  initialCode,
  instances,
  onClose,
  onJoinSuccess,
  onNotify,
}: JoinPartyModalProps) {
  const { t, locale } = useI18n();
  const isRu = locale === "ru";

  const [inputVal, setInputVal] = useState("");
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<PartyRoomState | null>(null);
  const [diff, setDiff] = useState<PartyDiffResult | null>(null);

  useEffect(() => {
    if (instances.length > 0 && !selectedInstanceId) {
      setSelectedInstanceId(instances[0].id);
    }
  }, [instances, selectedInstanceId]);

  useEffect(() => {
    if (initialCode) {
      const code = extractRoomCode(initialCode);
      setInputVal(code);
    } else {
      setInputVal("");
      setRoom(null);
      setDiff(null);
      setError(null);
    }
  }, [initialCode, open]);

  const selectedInstance = useMemo(
    () => instances.find((i) => i.id === selectedInstanceId) || null,
    [instances, selectedInstanceId]
  );

  // Re-calculate diff whenever selected instance changes and room is active
  useEffect(() => {
    if (room && selectedInstanceId) {
      void window.onyx.party.diffManifest({ instanceId: selectedInstanceId })
        .then(setDiff)
        .catch(() => setDiff(null));
    }
  }, [room, selectedInstanceId]);

  const handleJoin = useCallback(async () => {
    const code = extractRoomCode(inputVal);
    if (!code) {
      setError(isRu ? "Введите код комнаты" : "Enter a room code");
      return;
    }
    setJoining(true);
    setError(null);
    try {
      const roomData = await window.onyx.party.join({ code });
      setRoom(roomData);

      // Try auto-selecting matching local instance if host manifest provides version info
      let targetInstanceId = selectedInstanceId;
      if (roomData.instanceManifest) {
        const hostVer = roomData.instanceManifest.minecraftVersion;
        const hostLoader = (roomData.instanceManifest.loader || "").toLowerCase();
        const matching = instances.find(
          (i) => i.version === hostVer && i.loader.toLowerCase().includes(hostLoader)
        );
        if (matching) {
          targetInstanceId = matching.id;
          setSelectedInstanceId(matching.id);
        }
      }

      if (targetInstanceId) {
        const diffData = await window.onyx.party.diffManifest({ instanceId: targetInstanceId }).catch(() => null);
        setDiff(diffData);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || (isRu ? "Не удалось подключиться к комнате" : "Failed to join room"));
      setRoom(null);
      setDiff(null);
    } finally {
      setJoining(false);
    }
  }, [inputVal, selectedInstanceId, instances, isRu]);

  const handleLaunch = () => {
    if (!selectedInstance || !room) return;
    onJoinSuccess(selectedInstance, room);
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="modal-backdrop" onClick={onClose}>
        <motion.div
          className="modal modal--medium party-join-modal"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        >
          <button className="modal__close" onClick={onClose} aria-label={t("common.close")}>
            <X size={18} />
          </button>

          <div className="modal__eyebrow">
            <Users2 size={14} />
            <span>ONYX ROOM · P2P MULTIPLAYER</span>
          </div>

          <h2>{isRu ? "Подключение к комнате" : "Join Onyx Room"}</h2>
          <p className="modal__subtitle">
            {isRu
              ? "Введите 6-значный код комнаты хоста (например, ARC-451) или вставьте ссылку."
              : "Enter the 6-character room code (e.g. ARC-451) or paste the room link."}
          </p>

          <label className="field" style={{ marginTop: 0, marginBottom: 16 }}>
            <span>{isRu ? "Код комнаты или ссылка" : "Room Code or Link"}</span>
            <div className="field__control" style={{ paddingRight: 4 }}>
              <Users2 size={16} />
              <input
                autoFocus
                placeholder="ARC-451 или onyx://party/..."
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !joining) void handleJoin();
                }}
                style={{ fontFamily: "var(--font-mono)", fontSize: 13, textTransform: "uppercase" }}
              />
              <button
                type="button"
                className="button button--secondary"
                disabled={joining || !inputVal.trim()}
                onClick={() => void handleJoin()}
                style={{ height: 31, padding: "0 14px", fontSize: 12 }}
              >
                {joining ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <>
                    <span>{isRu ? "Найти" : "Connect"}</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </label>

          {instances.length > 0 && (
            <label className="field" style={{ marginBottom: 16 }}>
              <span>{isRu ? "Сборка для игры" : "Local instance to play"}</span>
              <div className="field__control field__control--select">
                <Box size={16} />
                <select
                  value={selectedInstanceId}
                  onChange={(e) => setSelectedInstanceId(e.target.value)}
                >
                  {instances.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name} ({inst.version} · {inst.loader})
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} className="field__chevron" />
              </div>
            </label>
          )}

          {error && (
            <div className="auth-error" style={{ marginBottom: 16 }}>
              <AlertCircle size={15} style={{ marginRight: 6, flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {room && (
            <div className="party-join-result" style={{ marginBottom: 16 }}>
              <div className="instance-preview instance-preview--lime" style={{ marginBottom: 12 }}>
                <div className="instance-preview__glow" />
                <span>{room.code.slice(0, 3)}</span>
                <div>
                  <strong>{isRu ? `Комната ${room.code}` : `Room ${room.code}`}</strong>
                  <small>
                    {isRu ? "Статус: " : "Status: "}
                    {room.status === "hosting" ? (isRu ? "Мир запущен" : "Hosting") : (isRu ? "Ожидание хоста" : "Waiting")} ·{" "}
                    {room.peers.length} {isRu ? "игроков" : "players"}
                  </small>
                </div>
              </div>

              {diff && (
                <div
                  className={`party-diff-box ${diff.identical ? "is-identical" : "is-mismatch"}`}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "8px",
                    border: diff.identical || diff.compatible
                      ? "1px solid rgba(163, 230, 53, 0.3)"
                      : "1px solid rgba(239, 68, 68, 0.3)",
                    background: diff.identical || diff.compatible
                      ? "rgba(163, 230, 53, 0.05)"
                      : "rgba(239, 68, 68, 0.05)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    fontSize: "12px",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {diff.identical || diff.compatible ? (
                      <CheckCircle2 size={16} color="#a3e635" style={{ flexShrink: 0 }} />
                    ) : (
                      <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
                    )}
                    <span style={{ fontWeight: 600 }}>
                      {diff.identical
                        ? (isRu ? "Сборка полностью совпадает с хостом!" : "Instance matches host perfectly!")
                        : diff.compatible
                          ? (isRu ? "Сборка совместима (отличаются только клиентские моды)" : "Compatible (only client-side mods differ)")
                          : (diff.loaderMismatch
                              ? (isRu ? "Несовпадение версий игры или загрузчика!" : "Minecraft or loader version mismatch!")
                              : (isRu
                                  ? `Несовпадение модов: ${(diff.criticalMissing || diff.missing).length} отсутствует.`
                                  : `Mod mismatch: ${(diff.criticalMissing || diff.missing).length} missing.`))}
                    </span>
                  </div>

                  {diff.hostManifest && selectedInstance && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "8px",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        background: "rgba(0, 0, 0, 0.25)",
                        fontSize: "11px",
                      }}
                    >
                      <div>
                        <span style={{ color: "var(--text-soft)", display: "block" }}>{isRu ? "У хоста:" : "Host:"}</span>
                        <strong style={{ color: "#a3e635" }}>
                          {diff.hostManifest.minecraftVersion} ({diff.hostManifest.loader})
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: "var(--text-soft)", display: "block" }}>{isRu ? "Выбрано у вас:" : "Selected instance:"}</span>
                        <strong style={{ color: diff.loaderMismatch ? "#ef4444" : "#a3e635" }}>
                          {selectedInstance.version} ({selectedInstance.loader})
                        </strong>
                      </div>
                    </div>
                  )}

                  {diff.loaderMismatch && (
                    <span style={{ color: "var(--text-soft)", fontSize: "11px", lineHeight: "1.4" }}>
                      {isRu
                        ? "Выберите сборку с такой же версией Minecraft и тем же загрузчиком (Fabric/Forge) в выпадающем списке выше."
                        : "Select a local instance with the same Minecraft version and loader (Fabric/Forge) from the dropdown above."}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button type="button" className="button button--secondary" onClick={onClose}>
              {t("common.close")}
            </button>
            {room && (
              <button
                type="button"
                className="button button--primary"
                onClick={handleLaunch}
                disabled={!selectedInstance}
              >
                <Play size={15} fill="currentColor" />
                <span>{isRu ? "Войти в игру" : "Launch & Play"}</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

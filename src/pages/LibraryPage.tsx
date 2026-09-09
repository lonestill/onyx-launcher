import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArchiveRestore,
  ArrowDownAZ,
  Grid2X2,
  List,
  PackageOpen,
  PackagePlus,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
} from "lucide-react";
import { InstanceCard } from "../components/InstanceCard";
import { useI18n } from "../i18n";
import type { GameInstance } from "../types";

interface LibraryPageProps {
  instances: GameInstance[];
  onCreate: () => void;
  onPlay: (instance: GameInstance) => void;
  onFavorite: (instance: GameInstance) => void;
  onMenu: (instance: GameInstance) => void;
  onCheck: (instance: GameInstance) => void;
  onOpen: (instance: GameInstance) => void;
  onImport: () => void;
  onImportBackup: () => void;
  onImportSync: () => void;
}

type Filter = "all" | "fabric" | "forge" | "neoforge" | "quilt" | "vanilla" | "favorite";

export function LibraryPage({
  instances,
  onCreate,
  onPlay,
  onFavorite,
  onMenu,
  onCheck,
  onOpen,
  onImport,
  onImportBackup,
  onImportSync,
}: LibraryPageProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [compact, setCompact] = useState(false);
  const [sortAscending, setSortAscending] = useState(true);

  const filtered = useMemo(() => {
    return instances
      .filter((instance) => {
        if (filter === "favorite") return instance.favorite;
        if (filter === "all") return true;
        if (filter === "forge") {
          return /forge/i.test(instance.loader) && !/neoforge/i.test(instance.loader);
        }
        if (filter === "neoforge") {
          return /neoforge/i.test(instance.loader);
        }
        if (filter === "quilt") {
          return /quilt/i.test(instance.loader);
        }
        return instance.loader.toLowerCase().includes(filter);
      })
      .filter((instance) =>
        `${instance.name} ${instance.version} ${instance.loader}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .sort((left, right) => {
        const result = left.name.localeCompare(right.name, "en");
        return sortAscending ? result : -result;
      });
  }, [filter, instances, query, sortAscending]);

  return (
    <motion.div
      className="page"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22 }}
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("library.eyebrow")}</p>
          <h1>{t("library.title")}</h1>
          <p>{t("library.count", { count: instances.length })}</p>
        </div>
        <div className="page-heading__actions">
          <button className="button button--secondary" onClick={onImportSync}>
            <Share2 size={16} />
            {t("library.syncImport")}
          </button>
          <button className="button button--secondary" onClick={onImportBackup}>
            <ArchiveRestore size={16} />
            {t("library.restore")}
          </button>
          <button className="button button--secondary" onClick={onImport}>
            <PackagePlus size={16} />
            {t("library.import")}
          </button>
          <button className="button button--primary" onClick={onCreate}>
            <Plus size={17} />
            {t("library.create")}
          </button>
        </div>
      </div>

      <div className="library-toolbar">
        <label className="input-shell input-shell--search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("library.search")}
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label={t("library.clear")}>
              ×
            </button>
          )}
        </label>
        <div className="filter-tabs">
          {(
            [
              ["all", t("library.filter.all")],
              ["favorite", t("library.filter.favorite")],
              ["fabric", "Fabric"],
              ["forge", "Forge"],
              ["neoforge", "NeoForge"],
              ["quilt", "Quilt"],
              ["vanilla", "Vanilla"],
            ] as Array<[Filter, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "is-active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="toolbar-icon"
          title={sortAscending ? t("library.sortAsc") : t("library.sortDesc")}
          onClick={() => setSortAscending((value) => !value)}
        >
          <ArrowDownAZ size={17} />
        </button>
        <button
          className="toolbar-icon"
          title={t("library.reset")}
          onClick={() => {
            setFilter("all");
            setQuery("");
          }}
        >
          <SlidersHorizontal size={17} />
        </button>
        <div className="view-toggle">
          <button
            className={!compact ? "is-active" : ""}
            onClick={() => setCompact(false)}
            aria-label={t("library.grid")}
          >
            <Grid2X2 size={15} />
          </button>
          <button
            className={compact ? "is-active" : ""}
            onClick={() => setCompact(true)}
            aria-label={t("library.compact")}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {filtered.length ? (
        <div
          className={`instance-grid ${compact ? "instance-grid--compact" : ""}`}
        >
          {filtered.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              compact={compact}
              onPlay={onPlay}
              onFavorite={onFavorite}
              onMenu={onMenu}
              onCheck={onCheck}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span>
            <PackageOpen size={28} />
          </span>
          <h2>{t("library.empty")}</h2>
          <p>{t("library.emptyHint")}</p>
          <button className="button button--secondary" onClick={onCreate}>
            <Plus size={16} /> {t("library.create")}
          </button>
        </div>
      )}
    </motion.div>
  );
}

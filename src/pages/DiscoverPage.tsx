import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Download,
  ExternalLink,
  Flame,
  Gamepad2,
  LoaderCircle,
  PackagePlus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  WandSparkles,
} from "lucide-react";
import { fallbackProjects } from "../data";
import { useI18n } from "../i18n";
import type {
  CatalogProject,
  DownloadTask,
  RouteId,
  MinecraftVersion,
} from "../types";
import { compactNumber } from "../utils";

interface DiscoverPageProps {
  downloads: DownloadTask[];
  onInstall: (project: CatalogProject) => void;
  onNavigate: (route: RouteId) => void;
  versions: MinecraftVersion[];
}

type ProjectType = "modpack" | "mod";

export function DiscoverPage({
  downloads,
  onInstall,
  onNavigate,
  versions,
}: DiscoverPageProps) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("modpack");
  const [projects, setProjects] = useState<CatalogProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [gameVersion, setGameVersion] = useState("");
  const [loader, setLoader] = useState("");
  const [sort, setSort] = useState<
    "relevance" | "downloads" | "follows" | "newest" | "updated"
  >("downloads");
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await window.onyx.catalog.search(query, projectType, {
          version: gameVersion || undefined,
          loader: loader || undefined,
          index: query && sort === "downloads" ? "relevance" : sort,
        });
        if (!cancelled) {
          setProjects(response.hits);
          setTotal(response.total_hits);
          setOffline(false);
        }
      } catch {
        if (!cancelled) {
          setProjects(
            projectType === "modpack"
              ? fallbackProjects
              : fallbackProjects.map((project) => ({
                  ...project,
                  project_type: "mod" as const,
                })),
          );
          setOffline(true);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query ? 360 : 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [gameVersion, loader, projectType, query, sort]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const response = await window.onyx.catalog.search(query, projectType, {
        version: gameVersion || undefined,
        loader: loader || undefined,
        index: query && sort === "downloads" ? "relevance" : sort,
        offset: projects.length,
      });
      setProjects((current) => [
        ...current,
        ...response.hits.filter(
          (project) =>
            !current.some((item) => item.project_id === project.project_id),
        ),
      ]);
      setTotal(response.total_hits);
    } finally {
      setLoadingMore(false);
    }
  };

  const featured = projects[0];
  const list = useMemo(() => projects.slice(featured ? 1 : 0), [featured, projects]);

  const projectDescription = (project: CatalogProject) => {
    if (!project.project_id.endsWith("-fallback")) return project.description;
    if (project.project_id.startsWith("prominence")) return t("discover.fallback.prominence");
    if (project.project_id.startsWith("cobblemon")) return t("discover.fallback.cobblemon");
    if (project.project_id.startsWith("create")) return t("discover.fallback.create");
    return t("discover.fallback.vanilla");
  };

  const installState = (projectId: string) =>
    downloads.find((download) => download.projectId === projectId);

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
          <p className="eyebrow">{t("discover.eyebrow")}</p>
          <h1>{t("discover.title")}</h1>
          <p>{t("discover.subtitle")}</p>
        </div>
        <div className="source-pill">
          <ShieldCheck size={14} />
          {t("discover.source")}
        </div>
      </div>

      <div className="discover-toolbar">
        <label className="discover-search">
          <Search size={20} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              projectType === "modpack"
                ? t("discover.searchPacks")
                : t("discover.searchMods")
            }
          />
          {loading && <LoaderCircle className="spin" size={18} />}
          <kbd>Enter</kbd>
        </label>
        <div className="segmented-control">
          <button
            className={projectType === "modpack" ? "is-active" : ""}
            onClick={() => setProjectType("modpack")}
          >
            <Gamepad2 size={15} /> {t("discover.modpacks")}
          </button>
          <button
            className={projectType === "mod" ? "is-active" : ""}
            onClick={() => setProjectType("mod")}
          >
            <PackagePlus size={15} /> {t("discover.mods")}
          </button>
        </div>
      </div>

      <div className="discover-filters">
        <span>
          <SlidersHorizontal size={14} /> {t("discover.filters")}
        </span>
        <label>
          <small>Minecraft</small>
          <select
            value={gameVersion}
            onChange={(event) => setGameVersion(event.target.value)}
          >
            <option value="">{t("discover.allVersions")}</option>
            {versions.slice(0, 28).map((version) => (
              <option value={version.id} key={version.id}>
                {version.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          <small>{t("discover.loader")}</small>
          <select
            value={loader}
            onChange={(event) => setLoader(event.target.value)}
          >
            <option value="">{t("discover.any")}</option>
            <option value="fabric">Fabric</option>
            <option value="neoforge">NeoForge</option>
            <option value="forge">Forge</option>
            <option value="quilt">Quilt</option>
          </select>
        </label>
        <label>
          <small>{t("discover.sort")}</small>
          <select
            value={sort}
            onChange={(event) =>
              setSort(
                event.target.value as
                  | "relevance"
                  | "downloads"
                  | "follows"
                  | "newest"
                  | "updated",
              )
            }
          >
            {query && <option value="relevance">{t("discover.sort.relevance")}</option>}
            <option value="downloads">{t("discover.sort.downloads")}</option>
            <option value="follows">{t("discover.sort.follows")}</option>
            <option value="updated">{t("discover.sort.updated")}</option>
            <option value="newest">{t("discover.sort.newest")}</option>
          </select>
        </label>
        {(gameVersion || loader) && (
          <button
            className="text-button"
            onClick={() => {
              setGameVersion("");
              setLoader("");
            }}
          >
            {t("discover.reset")}
          </button>
        )}
      </div>

      {offline && (
        <div className="offline-banner">
          <WandSparkles size={16} />
          {t("discover.offline")}
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="empty-state">
          <span>
            <Search size={28} />
          </span>
          <h2>{t("discover.empty")}</h2>
          <p>{t("discover.emptyHint")}</p>
        </div>
      )}

      {featured && (
        <section className="catalog-feature">
          <div className="catalog-feature__art">
            {featured.icon_url ? (
              <img
                src={featured.icon_url}
                alt=""
                decoding="async"
                fetchPriority="high"
              />
            ) : (
              <span>{featured.title.slice(0, 2).toUpperCase()}</span>
            )}
            <div />
          </div>
          <div className="catalog-feature__copy">
            <div className="catalog-feature__label">
              <Flame size={14} />
              {t("discover.trending")}
            </div>
            <h2>{featured.title}</h2>
            <p>{projectDescription(featured)}</p>
            <div className="catalog-feature__meta">
              <span>
                <Download size={14} /> {compactNumber(featured.downloads, locale)}
              </span>
              <span>
                <Star size={14} /> {compactNumber(featured.follows, locale)}
              </span>
              <span>{t("discover.by", { author: featured.author })}</span>
            </div>
            <div className="catalog-feature__actions">
              <InstallButton
                task={installState(featured.project_id)}
                onClick={() => onInstall(featured)}
                unavailable={offline}
              />
              <button
                className="button button--glass"
                onClick={() =>
                  window.open(
                    `https://modrinth.com/${featured.project_type}/${featured.slug}`,
                    "_blank",
                  )
                }
              >
                <ExternalLink size={15} /> {t("discover.details")}
              </button>
            </div>
          </div>
          <div className="catalog-feature__chips">
            {featured.categories.slice(0, 3).map((category) => (
              <span key={category}>{category}</span>
            ))}
          </div>
        </section>
      )}

      {list.length > 0 && (
        <section className="dashboard-section">
          <div className="section-heading">
            <div>
              <h2>{query ? t("discover.results", { query }) : t("discover.popular")}</h2>
              <p>
                {projectType === "modpack"
                  ? t("discover.packsHint")
                  : t("discover.modsHint")}
                {total > 0 && ` · ${t("discover.found", { count: total.toLocaleString(locale) })}`}
              </p>
            </div>
            <button className="text-button" onClick={() => onNavigate("downloads")}>
              {t("discover.queue")}
            </button>
          </div>

          <div className="catalog-grid">
            {list.map((project, index) => {
              const task = installState(project.project_id);
              return (
                <motion.article
                  className="project-card"
                  key={project.project_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.025, 0.2) }}
                >
                  <div className="project-card__head">
                    <span className="project-card__icon">
                      {project.icon_url ? (
                        <img
                          src={project.icon_url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        project.title.slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <div>
                      <h3 title={project.title}>{project.title}</h3>
                      <p>{t("discover.by", { author: project.author })}</p>
                    </div>
                  </div>
                  <p className="project-card__description">
                    {projectDescription(project)}
                  </p>
                  <div className="project-card__tags">
                    {project.categories.slice(0, 3).map((category) => (
                      <span key={category}>{category}</span>
                    ))}
                  </div>
                  <div className="project-card__footer">
                    <div>
                      <span>
                        <Download size={13} />
                        {compactNumber(project.downloads, locale)}
                      </span>
                      <span>
                        <Star size={13} />
                        {compactNumber(project.follows, locale)}
                      </span>
                    </div>
                    <button
                      className={`project-install ${
                        task?.status === "done" ? "is-done" : ""
                      }`}
                      onClick={() => onInstall(project)}
                      disabled={
                        offline ||
                        task?.status === "downloading" ||
                        task?.status === "installing" ||
                        task?.status === "queued" ||
                        task?.status === "done"
                      }
                    >
                      {task?.status === "done" ? (
                        <Check size={16} />
                      ) : task?.status === "downloading" ||
                        task?.status === "installing" ||
                        task?.status === "queued" ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <Download size={16} />
                      )}
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </div>
          {!offline && projects.length < total && (
            <button
              className="catalog-load-more"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Download size={16} />
              )}
              {t("discover.more")}
            </button>
          )}
        </section>
      )}
    </motion.div>
  );
}

function InstallButton({
  task,
  onClick,
  unavailable,
}: {
  task?: DownloadTask;
  onClick: () => void;
  unavailable?: boolean;
}) {
  const { t } = useI18n();
  const active =
    task?.status === "downloading" ||
    task?.status === "installing" ||
    task?.status === "queued";
  const done = task?.status === "done";
  return (
    <button
      className="button button--primary"
      onClick={onClick}
      disabled={active || done || unavailable}
    >
      {unavailable ? (
        <>{t("discover.offlineInstall")}</>
      ) : done ? (
        <>
          <Check size={16} /> {t("discover.inLibrary")}
        </>
      ) : active ? (
        <>
          <LoaderCircle className="spin" size={16} />
          {task.progress}%
        </>
      ) : (
        <>
          <Download size={16} /> {t("discover.install")}
        </>
      )}
    </button>
  );
}

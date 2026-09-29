import { motion } from "framer-motion";
import {
  ChevronDown,
  CircleUserRound,
  ExternalLink,
  MessageSquareHeart,
  Settings,
  Users2,
} from "lucide-react";
import { DiscordIcon } from "./DiscordIcon";
import { navigation } from "../data";
import { useI18n } from "../i18n";
import type { DownloadTask, Profile, RouteId } from "../types";

interface SidebarProps {
  activeRoute: RouteId;
  profile: Profile;
  downloads: DownloadTask[];
  onNavigate: (route: RouteId) => void;
  onAccount: () => void;
  onJoinParty?: () => void;
}

export function Sidebar({
  activeRoute,
  profile,
  downloads,
  onNavigate,
  onAccount,
  onJoinParty,
}: SidebarProps) {
  const { t } = useI18n();
  const activeDownloads = downloads.filter(
    (download) =>
      download.status === "downloading" ||
      download.status === "installing" ||
      download.status === "queued",
  ).length;

  return (
    <aside className="sidebar">
      <div className="sidebar__nav">
        <p className="sidebar__label">{t("nav.label")}</p>
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = activeRoute === item.id;
          return (
            <button
              className={`nav-item ${active ? "is-active" : ""}`}
              key={item.id}
              onClick={() => onNavigate(item.id)}
            >
              {active && (
                <motion.span
                  layoutId="active-nav"
                  className="nav-item__active"
                  transition={{ type: "spring", stiffness: 420, damping: 35 }}
                />
              )}
              <Icon size={18} strokeWidth={active ? 2.5 : 2} />
              <span>{t(item.labelKey)}</span>
              {item.id === "downloads" && activeDownloads > 0 && (
                <span className="nav-item__badge">{activeDownloads}</span>
              )}
            </button>
          );
        })}
        {onJoinParty && (
          <button
            className="nav-item nav-item--party"
            onClick={onJoinParty}
            title={t("library.joinPartyTitle")}
          >
            <Users2 size={18} />
            <span>{t("nav.party")}</span>
          </button>
        )}
      </div>

      <div className="sidebar__footer">
        <a
          href="https://discord.gg/qHZCehveYp"
          target="_blank"
          rel="noreferrer"
          className="nav-item nav-item--external"
          title={t("nav.discord")}
        >
          <DiscordIcon size={18} />
          <span>{t("nav.discord")}</span>
          <ExternalLink size={12} className="nav-item__ext" />
        </a>

        <button
          className={`nav-item ${activeRoute === "community" ? "is-active" : ""}`}
          onClick={() => onNavigate("community")}
        >
          {activeRoute === "community" && (
            <motion.span
              layoutId="active-nav"
              className="nav-item__active"
              transition={{ type: "spring", stiffness: 420, damping: 35 }}
            />
          )}
          <MessageSquareHeart size={18} strokeWidth={activeRoute === "community" ? 2.5 : 2} />
          <span>{t("nav.community")}</span>
        </button>

        <button
          className={`nav-item ${activeRoute === "settings" ? "is-active" : ""}`}
          onClick={() => onNavigate("settings")}
        >
          {activeRoute === "settings" && (
            <motion.span
              layoutId="active-nav"
              className="nav-item__active"
              transition={{ type: "spring", stiffness: 420, damping: 35 }}
            />
          )}
          <Settings size={18} />
          <span>{t("nav.settings")}</span>
        </button>

        <button className="profile-card" onClick={onAccount}>
          <span className="profile-card__avatar">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" />
            ) : (
              <CircleUserRound size={21} />
            )}
            <i />
          </span>
          <span className="profile-card__copy">
            <strong>{profile.name === "Player" ? t("profile.player") : profile.name}</strong>
            <small>
              {profile.kind === "microsoft"
                ? t("profile.microsoft")
                : profile.kind === 'offline'
                  ? t('profile.offline')
                  : t('profile.local')}
            </small>
          </span>
          <ChevronDown size={15} />
        </button>
      </div>
    </aside>
  );
}

import { useEffect, useRef, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  Footprints,
  Hand,
  ImagePlus,
  LoaderCircle,
  Pause,
  RefreshCw,
  Sparkles,
  Upload,
  UserRound,
  Wind,
  Zap,
} from 'lucide-react';
import { useI18n } from '../i18n';
import type { Profile } from '../types';
import {
  SkinViewer3D,
  type SkinAnimationName,
  type SkinLayers,
} from '../components/SkinViewer3D';
import { CAPE_PRESETS, createVanillaElytraTexture } from '../components/capePresets';

const DEFAULT_STEVE_URL =
  'https://textures.minecraft.net/texture/1a4af718455d2aab528e7a61f86fa25e6a369d1768dcb13f7df319a713eb810b';
const DEFAULT_ALEX_URL =
  'https://textures.minecraft.net/texture/e5d848149818815fb5f891b0c0f8653245f78ffef1bc5c8065a7df4cf95cb7fd';

interface SkinsPageProps {
  profile: Profile;
  onAccount: () => void;
  onNotify: (
    tone: 'success' | 'warning' | 'info',
    title: string,
    message: string,
  ) => void;
}

export function SkinsPage({ profile, onAccount, onNotify }: SkinsPageProps) {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<Profile[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    profile.uuid || null,
  );
  const [skinVariant, setSkinVariant] = useState<'classic' | 'slim'>('classic');
  const [animationMode, setAnimationMode] = useState<SkinAnimationName>('idle');
  const [equipmentType, setEquipmentType] = useState<'cape' | 'elytra'>('cape');
  const [selectedCapeId, setSelectedCapeId] = useState<string>('onyx');
  const [customCapeUrl, setCustomCapeUrl] = useState<string | null>(null);
  const [layers, setLayers] = useState<SkinLayers>({
    hat: true,
    jacket: true,
    leftSleeve: true,
    rightSleeve: true,
    leftPants: true,
    rightPants: true,
  });

  const [skinBusy, setSkinBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const refreshedAccountIds = useRef(new Set<string>());
  const capeFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    void window.onyx.auth.list().then((result) => {
      if (!mounted) return;
      setAccounts(result.profiles);
      setSelectedAccountId((current) =>
        result.profiles.some((account) => account.uuid === current)
          ? current
          : profile.uuid || result.profiles[0]?.uuid || null,
      );
    });
    return () => {
      mounted = false;
    };
  }, [profile.uuid]);

  useEffect(
    () =>
      window.onyx.onAuthChanged((updated) => {
        setAccounts((current) =>
          current.some((account) => account.uuid === updated.uuid)
            ? current.map((account) =>
                account.uuid === updated.uuid ? updated : account,
              )
            : current,
        );
      }),
    [],
  );

  const selectedAccount = accounts.find(
    (account) => account.uuid === selectedAccountId,
  );
  const selectedSkin =
    selectedAccount?.skins?.find((skin) => skin.state === 'ACTIVE') ||
    selectedAccount?.skins?.[0];

  useEffect(() => {
    setSkinVariant(
      selectedSkin?.variant?.toLowerCase() === 'slim' ? 'slim' : 'classic',
    );
  }, [selectedAccountId, selectedSkin?.id, selectedSkin?.variant]);

  useEffect(() => {
    if (
      selectedAccount?.kind !== 'microsoft' ||
      !selectedAccount.uuid ||
      refreshedAccountIds.current.has(selectedAccount.uuid)
    ) {
      return;
    }
    refreshedAccountIds.current.add(selectedAccount.uuid);
    let mounted = true;
    setProfileBusy(true);
    void window.onyx.auth
      .refreshProfile(selectedAccount.uuid)
      .then((updated) => {
        if (!mounted) return;
        setAccounts((current) =>
          current.map((account) =>
            account.uuid === updated.uuid ? updated : account,
          ),
        );
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setProfileBusy(false);
      });
    return () => {
      mounted = false;
    };
  }, [selectedAccount?.kind, selectedAccount?.uuid]);

  const refreshSelectedProfile = async () => {
    if (selectedAccount?.kind !== 'microsoft' || !selectedAccount.uuid) return;
    setProfileBusy(true);
    try {
      const updated = await window.onyx.auth.refreshProfile(selectedAccount.uuid);
      refreshedAccountIds.current.add(updated.uuid || selectedAccount.uuid);
      setAccounts((current) =>
        current.map((account) =>
          account.uuid === updated.uuid ? updated : account,
        ),
      );
      onNotify(
        'success',
        t('settings.skins.synced'),
        t('settings.skins.syncedHint', { name: updated.name }),
      );
    } catch (error) {
      onNotify(
        'warning',
        t('settings.skins.failed'),
        error instanceof Error ? error.message : t('auth.error.finish'),
      );
    } finally {
      setProfileBusy(false);
    }
  };

  const chooseSkin = async () => {
    if (!selectedAccount?.uuid) return;
    setSkinBusy(true);
    try {
      const updated = await window.onyx.auth.chooseSkin(
        selectedAccount.uuid,
        skinVariant,
      );
      if (!updated) return;
      setAccounts((current) =>
        current.map((account) =>
          account.uuid === updated.uuid ? updated : account,
        ),
      );
      onNotify(
        'success',
        t('settings.skins.updated'),
        t('settings.skins.updatedHint', { name: updated.name }),
      );
    } catch (error) {
      onNotify(
        'warning',
        t('settings.skins.failed'),
        error instanceof Error ? error.message : t('auth.error.finish'),
      );
    } finally {
      setSkinBusy(false);
    }
  };

  const handleCustomCapeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      if (url) {
        setCustomCapeUrl(url);
        setSelectedCapeId('custom');
        onNotify('success', t('settings.skins.capeLoaded'), file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  // Determine current active cape texture URL and back equipment type
  const { activeCapeUrl, backEquipment } = useMemo(() => {
    if (equipmentType === 'elytra') {
      if (selectedCapeId === 'none' || selectedCapeId === 'elytra') {
        return {
          activeCapeUrl: createVanillaElytraTexture(),
          backEquipment: 'elytra' as const,
        };
      }
      if (selectedCapeId === 'custom') {
        return {
          activeCapeUrl: customCapeUrl || createVanillaElytraTexture(),
          backEquipment: 'elytra' as const,
        };
      }
      if (selectedCapeId.startsWith('account-')) {
        const capeId = selectedCapeId.replace('account-', '');
        const cape = selectedAccount?.capes?.find((c) => c.id === capeId);
        return {
          activeCapeUrl: cape?.url || createVanillaElytraTexture(),
          backEquipment: 'elytra' as const,
        };
      }
      const preset = CAPE_PRESETS.find((p) => p.id === selectedCapeId);
      return {
        activeCapeUrl: preset?.getDataUrl
          ? preset.getDataUrl()
          : createVanillaElytraTexture(),
        backEquipment: 'elytra' as const,
      };
    }

    // Cape mode
    if (selectedCapeId === 'none') {
      return { activeCapeUrl: null, backEquipment: null };
    }
    if (selectedCapeId === 'elytra') {
      return {
        activeCapeUrl: createVanillaElytraTexture(),
        backEquipment: 'elytra' as const,
      };
    }
    if (selectedCapeId === 'custom') {
      return { activeCapeUrl: customCapeUrl, backEquipment: 'cape' as const };
    }
    if (selectedCapeId.startsWith('account-')) {
      const capeId = selectedCapeId.replace('account-', '');
      const cape = selectedAccount?.capes?.find((c) => c.id === capeId);
      return { activeCapeUrl: cape?.url || null, backEquipment: 'cape' as const };
    }

    const preset = CAPE_PRESETS.find((p) => p.id === selectedCapeId);
    if (preset?.getDataUrl) {
      return { activeCapeUrl: preset.getDataUrl(), backEquipment: 'cape' as const };
    }

    return { activeCapeUrl: null, backEquipment: null };
  }, [equipmentType, selectedCapeId, customCapeUrl, selectedAccount?.capes]);

  const toggleLayer = (layerKey: keyof SkinLayers) => {
    setLayers((prev) => {
      if (layerKey === 'leftSleeve' || layerKey === 'rightSleeve') {
        const next = !prev.leftSleeve;
        return { ...prev, leftSleeve: next, rightSleeve: next };
      }
      if (layerKey === 'leftPants' || layerKey === 'rightPants') {
        const next = !prev.leftPants;
        return { ...prev, leftPants: next, rightPants: next };
      }
      return { ...prev, [layerKey]: !prev[layerKey] };
    });
  };

  return (
    <motion.div
      className='page skins-page'
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22 }}
    >
      <div className='page-heading'>
        <div>
          <p className='eyebrow'>{t('nav.skins')}</p>
          <h1>{t('settings.skins.title')}</h1>
          <p>{t('settings.skins.subtitle')}</p>
        </div>
      </div>

      {accounts.length ? (
        <div className='skin-manager'>
          {/* Account Selector Column */}
          <div className='skin-manager__accounts'>
            <div className='skin-manager__accounts-heading'>
              <strong>{t('auth.savedAccounts')}</strong>
              <button className='button button--ghost' onClick={onAccount}>
                {t('settings.skins.add')}
              </button>
            </div>
            <div className='skin-manager__account-list'>
              {accounts.map((account) => {
                const accountSkin =
                  account.skins?.find((skin) => skin.state === 'ACTIVE') ||
                  account.skins?.[0];
                const selected = account.uuid === selectedAccountId;
                const active = account.uuid === profile.uuid;
                return (
                  <button
                    className={`skin-manager__account ${selected ? 'is-selected' : ''}`}
                    key={account.uuid || account.name}
                    type='button'
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedAccountId(account.uuid || null);
                      setSkinVariant(
                        accountSkin?.variant?.toLowerCase() === 'slim'
                          ? 'slim'
                          : 'classic',
                      );
                    }}
                  >
                    <span>
                      {account.avatarUrl ? (
                        <img src={account.avatarUrl} alt='' />
                      ) : accountSkin ? (
                        <img
                          src={accountSkin.url.replace(/^http:/i, 'https:')}
                          alt=''
                        />
                      ) : (
                        <UserRound size={20} />
                      )}
                    </span>
                    <div>
                      <strong>{account.name}</strong>
                      <small>
                        {account.kind === 'microsoft'
                          ? t('profile.microsoft')
                          : t('profile.offline')}
                      </small>
                    </div>
                    {active && <Check size={15} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3D Showcase & Wardrobe Editor */}
          {selectedAccount ? (
            <div className='skin-manager__editor'>
              {/* 3D Viewport Showcase */}
              <div className='skin-manager__preview'>
                <SkinViewer3D
                  skinUrl={
                    selectedSkin?.url ||
                    (skinVariant === 'slim' ? DEFAULT_ALEX_URL : DEFAULT_STEVE_URL)
                  }
                  variant={skinVariant}
                  capeUrl={activeCapeUrl}
                  backEquipment={backEquipment}
                  animationMode={animationMode}
                  layers={layers}
                  playerName={selectedAccount.name}
                  onNotify={onNotify}
                />
              </div>

              {/* Wardrobe Controls & Customization */}
              <div className='skin-manager__details'>
                <div className='wardrobe-header'>
                  <div>
                    <p className='eyebrow'>{t('auth.skin')}</p>
                    <h3>{selectedAccount.name}</h3>
                  </div>
                  <span className='wardrobe-badge'>
                    <Sparkles size={13} /> 3D Studio
                  </span>
                </div>

                {/* Model Variant Selector */}
                <div className='wardrobe-section'>
                  <label className='wardrobe-label'>
                    {t('auth.skin.variant')}
                  </label>
                  <div className='wardrobe-pills'>
                    <button
                      type='button'
                      className={`wardrobe-pill ${skinVariant === 'classic' ? 'is-active' : ''}`}
                      onClick={() => setSkinVariant('classic')}
                      disabled={skinBusy}
                    >
                      {t('auth.skin.classic')}
                    </button>
                    <button
                      type='button'
                      className={`wardrobe-pill ${skinVariant === 'slim' ? 'is-active' : ''}`}
                      onClick={() => setSkinVariant('slim')}
                      disabled={skinBusy}
                    >
                      {t('auth.skin.slim')}
                    </button>
                  </div>
                </div>

                {/* Animation Selector */}
                <div className='wardrobe-section'>
                  <label className='wardrobe-label'>
                    {t('settings.skins.animation')}
                  </label>
                  <div className='wardrobe-pills wardrobe-pills--wrap'>
                    {[
                      { id: 'idle', icon: Sparkles, label: t('settings.skins.anim.idle') },
                      { id: 'walk', icon: Footprints, label: t('settings.skins.anim.walk') },
                      { id: 'run', icon: Zap, label: t('settings.skins.anim.run') },
                      { id: 'fly', icon: Wind, label: t('settings.skins.anim.fly') },
                      { id: 'wave', icon: Hand, label: t('settings.skins.anim.wave') },
                      { id: 'none', icon: Pause, label: t('settings.skins.anim.none') },
                    ].map(({ id, icon: Icon, label }) => (
                      <button
                        key={id}
                        type='button'
                        className={`wardrobe-pill ${animationMode === id ? 'is-active' : ''}`}
                        onClick={() => setAnimationMode(id as SkinAnimationName)}
                      >
                        <Icon size={13} /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cape & Wings Selector */}
                <div className='wardrobe-section'>
                  <div className='wardrobe-section__title-row'>
                    <label className='wardrobe-label'>
                      {t('settings.skins.capes')}
                    </label>
                    <div className='wardrobe-equipment-pills'>
                      <button
                        type='button'
                        className={`wardrobe-equipment-pill ${equipmentType === 'cape' ? 'is-active' : ''}`}
                        onClick={() => setEquipmentType('cape')}
                      >
                        ✦ Cape
                      </button>
                      <button
                        type='button'
                        className={`wardrobe-equipment-pill ${equipmentType === 'elytra' ? 'is-active' : ''}`}
                        onClick={() => {
                          setEquipmentType('elytra');
                          if (selectedCapeId === 'none') {
                            setSelectedCapeId('elytra');
                          }
                        }}
                      >
                        Elytra
                      </button>
                    </div>
                  </div>
                  <div className='wardrobe-cape-row'>
                    <select
                      className='wardrobe-select'
                      value={selectedCapeId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedCapeId(val);
                        if (val === 'elytra') {
                          setEquipmentType('elytra');
                        }
                      }}
                    >
                      {/* Account Capes */}
                      {selectedAccount.capes?.map((cape) => (
                        <option key={cape.id} value={`account-${cape.id}`}>
                          ✦ {cape.alias || 'Account Cape'}
                        </option>
                      ))}

                      {/* Built-in Presets */}
                      {CAPE_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}

                      {/* Custom Cape if loaded */}
                      {customCapeUrl && (
                        <option value='custom'>Custom Uploaded Cape</option>
                      )}
                    </select>

                    <button
                      type='button'
                      className='button button--ghost wardrobe-upload-btn'
                      title={t('settings.skins.customCape')}
                      onClick={() => capeFileInputRef.current?.click()}
                    >
                      <Upload size={14} />
                    </button>
                    <input
                      ref={capeFileInputRef}
                      type='file'
                      accept='image/png'
                      hidden
                      onChange={handleCustomCapeUpload}
                    />
                  </div>
                </div>

                {/* Outer Layers Checkboxes */}
                <div className='wardrobe-section'>
                  <label className='wardrobe-label'>
                    {t('settings.skins.layers')}
                  </label>
                  <div className='wardrobe-layers'>
                    {[
                      { key: 'hat', label: t('settings.skins.layer.hat'), checked: layers.hat },
                      { key: 'jacket', label: t('settings.skins.layer.jacket'), checked: layers.jacket },
                      { key: 'leftSleeve', label: t('settings.skins.layer.sleeves'), checked: layers.leftSleeve },
                      { key: 'leftPants', label: t('settings.skins.layer.pants'), checked: layers.leftPants },
                    ].map(({ key, label, checked }) => (
                      <button
                        key={key}
                        type='button'
                        className={`wardrobe-chip ${checked ? 'is-active' : ''}`}
                        onClick={() => toggleLayer(key as keyof SkinLayers)}
                      >
                        <span className='wardrobe-chip__dot' />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Primary Actions */}
                <div className='skin-manager__actions'>
                  <button
                    className='button button--primary'
                    type='button'
                    onClick={() => void chooseSkin()}
                    disabled={skinBusy || profileBusy}
                  >
                    {skinBusy ? (
                      <LoaderCircle className='spin' size={16} />
                    ) : (
                      <ImagePlus size={16} />
                    )}
                    {skinBusy
                      ? t('settings.skins.uploading')
                      : t('auth.skin.change')}
                  </button>

                  {selectedAccount.kind === 'microsoft' && (
                    <button
                      className='button button--secondary'
                      type='button'
                      onClick={() => void refreshSelectedProfile()}
                      disabled={skinBusy || profileBusy}
                    >
                      <RefreshCw
                        className={profileBusy ? 'spin' : undefined}
                        size={16}
                      />
                      {profileBusy
                        ? t('settings.skins.refreshing')
                        : t('settings.skins.refresh')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className='skin-manager__empty'>
          <ImagePlus size={30} />
          <h3>{t('settings.skins.empty')}</h3>
          <p>{t('settings.skins.emptyHint')}</p>
          <button className='button button--primary' type='button' onClick={onAccount}>
            {t('settings.skins.add')}
          </button>
        </div>
      )}
    </motion.div>
  );
}

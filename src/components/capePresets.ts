export interface CapePreset {
  id: string;
  name: string;
  type: 'custom' | 'account' | 'elytra' | 'preset';
  getDataUrl?: () => string;
}

export interface ElytraPalette {
  base: string;
  rim: string;
  ribs: string;
  highlight: string;
  backBase?: string;
}

export const VANILLA_ELYTRA_PALETTE: ElytraPalette = {
  base: '#4a4a54',
  rim: '#22222a',
  ribs: '#32323a',
  highlight: '#686878',
  backBase: '#3c3c46',
};

export function drawElytraWings(
  ctx: CanvasRenderingContext2D,
  palette: ElytraPalette = VANILLA_ELYTRA_PALETTE,
) {
  // Top edge (x: 24..34, y: 0..2)
  ctx.fillStyle = palette.rim;
  ctx.fillRect(24, 0, 10, 2);

  // Bottom tip (x: 34..44, y: 0..2)
  ctx.fillStyle = palette.rim;
  ctx.fillRect(34, 0, 10, 2);

  // Spine edge (x: 22..24, y: 2..22)
  ctx.fillStyle = palette.rim;
  ctx.fillRect(22, 2, 2, 20);

  // Inner seam (x: 34..36, y: 2..22)
  ctx.fillStyle = palette.rim;
  ctx.fillRect(34, 2, 2, 20);

  // Outer wing face (x: 24..34, y: 2..22)
  ctx.fillStyle = palette.base;
  ctx.fillRect(24, 2, 10, 20);

  // Ribs & accents on outer wing
  ctx.fillStyle = palette.ribs;
  ctx.fillRect(24, 2, 1, 20);
  ctx.fillRect(33, 2, 1, 20);
  ctx.fillRect(25, 6, 8, 1);
  ctx.fillRect(26, 11, 7, 1);
  ctx.fillRect(27, 16, 6, 1);

  // Wing highlight streak
  ctx.fillStyle = palette.highlight;
  ctx.fillRect(25, 3, 2, 2);
  ctx.fillRect(26, 7, 3, 1);
  ctx.fillRect(27, 12, 3, 1);

  // Inner wing face (x: 36..46, y: 2..22)
  ctx.fillStyle = palette.backBase || palette.base;
  ctx.fillRect(36, 2, 10, 20);

  // Inner wing rib lines
  ctx.fillStyle = palette.ribs;
  ctx.fillRect(36, 2, 1, 20);
  ctx.fillRect(45, 2, 1, 20);
  ctx.fillRect(37, 7, 8, 1);
  ctx.fillRect(38, 12, 7, 1);
  ctx.fillRect(39, 17, 6, 1);
}

export const VANILLA_ELYTRA_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgBAMAAABQs2O3AAAAIVBMVEUAAAB/j593iJptf5JneIpfb4BYZnVPXGpKVmNGUV1CTFgLTatUAAAAAXRSTlMAQObYZgAAAKFJREFUeNrtzbENwjAQBVArigTpuExAvEG4BQL2ABSYmiaMYG+AU1Jy3sBMCRLQIOunoeQ3V9zT/+orjRCRQhE1F8mSMLiLXBFoniDNAYEgZwkYpBj2ACzzbfIQTCFcTgAsYvRuKL7Wr+PPzm0RGN146Itg9QFH26MGZ5h3qMFYZjhRszWEJmrDG40aqpaIEFCkuzIY3rejVkNQdUTqn1/nAThNI5j05ZvKAAAAAElFTkSuQmCC';

export function createVanillaElytraTexture(): string {
  return VANILLA_ELYTRA_DATA_URL;
}

function createCapeCanvas(
  bgColor: string,
  edgeColor: string,
  drawEmblem: (ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number) => void,
  elytraPalette?: ElytraPalette,
): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, 64, 32);

  // Cape layout dimensions in 64x32:
  // Top: x=1, y=0, w=10, h=1
  // Bottom: x=11, y=0, w=10, h=1
  // Left: x=0, y=1, w=1, h=16
  // Back face (main visible): x=1, y=1, w=10, h=16
  // Right: x=11, y=1, w=1, h=16
  // Front face: x=12, y=1, w=10, h=16

  // Base background fill
  ctx.fillStyle = bgColor;
  ctx.fillRect(1, 0, 10, 1);   // top
  ctx.fillRect(11, 0, 10, 1);  // bottom
  ctx.fillRect(0, 1, 1, 16);   // left
  ctx.fillRect(1, 1, 10, 16);  // back
  ctx.fillRect(11, 1, 1, 16);  // right
  ctx.fillRect(12, 1, 10, 16); // front

  // Edges
  ctx.fillStyle = edgeColor;
  ctx.fillRect(0, 1, 1, 16);
  ctx.fillRect(11, 1, 1, 16);

  // Back emblem (x=1, y=1, w=10, h=16)
  drawEmblem(ctx, 1, 1);

  // Front emblem (x=12, y=1, w=10, h=16)
  drawEmblem(ctx, 12, 1);

  // Matching themed Elytra wings
  drawElytraWings(ctx, elytraPalette || VANILLA_ELYTRA_PALETTE);

  return canvas.toDataURL('image/png');
}

export const CAPE_PRESETS: CapePreset[] = [
  {
    id: 'none',
    name: 'No Cape',
    type: 'preset',
  },
  {
    id: 'elytra',
    name: 'Vanilla Elytra',
    type: 'elytra',
    getDataUrl: () => createVanillaElytraTexture(),
  },
  {
    id: 'onyx',
    name: 'Scope Obsidian',
    type: 'preset',
    getDataUrl: () =>
      createCapeCanvas(
        '#090b0e',
        '#161b22',
        (ctx, ox, oy) => {
          // Neon lime Onyx crystal emblem
          ctx.fillStyle = '#84cc16';
          ctx.fillRect(ox + 4, oy + 4, 2, 8);
          ctx.fillRect(ox + 3, oy + 6, 4, 4);
          ctx.fillStyle = '#bef264';
          ctx.fillRect(ox + 4, oy + 7, 2, 2);
          ctx.fillStyle = '#4d7c0f';
          ctx.fillRect(ox + 2, oy + 7, 1, 2);
          ctx.fillRect(ox + 7, oy + 7, 1, 2);
        },
        {
          base: '#0b0e14',
          rim: '#161b22',
          ribs: '#1e293b',
          highlight: '#84cc16',
          backBase: '#090b0e',
        },
      ),
  },
  {
    id: 'minecon2011',
    name: 'Minecon 2011',
    type: 'preset',
    getDataUrl: () =>
      createCapeCanvas(
        '#8b0000',
        '#5c0000',
        (ctx, ox, oy) => {
          // Classic Iron Pickaxe on Red
          ctx.fillStyle = '#78350f'; // handle
          ctx.fillRect(ox + 4, oy + 10, 1, 1);
          ctx.fillRect(ox + 5, oy + 9, 1, 1);
          ctx.fillRect(ox + 6, oy + 8, 1, 1);
          ctx.fillRect(ox + 7, oy + 7, 1, 1);

          ctx.fillStyle = '#e2e8f0'; // pickaxe iron head
          ctx.fillRect(ox + 3, oy + 4, 4, 2);
          ctx.fillRect(ox + 2, oy + 5, 2, 2);
          ctx.fillRect(ox + 6, oy + 3, 2, 2);
        },
        {
          base: '#8b0000',
          rim: '#500000',
          ribs: '#660000',
          highlight: '#e2e8f0',
          backBase: '#700000',
        },
      ),
  },
  {
    id: 'anniversary15',
    name: '15th Anniversary Creeper',
    type: 'preset',
    getDataUrl: () =>
      createCapeCanvas(
        '#14532d',
        '#052e16',
        (ctx, ox, oy) => {
          // Creeper Face
          ctx.fillStyle = '#0a0a0a';
          ctx.fillRect(ox + 2, oy + 4, 2, 2); // left eye
          ctx.fillRect(ox + 6, oy + 4, 2, 2); // right eye
          ctx.fillRect(ox + 4, oy + 6, 2, 3); // nose
          ctx.fillRect(ox + 3, oy + 8, 4, 2); // mouth top
          ctx.fillRect(ox + 3, oy + 10, 1, 2); // mouth left
          ctx.fillRect(ox + 6, oy + 10, 1, 2); // mouth right
        },
        {
          base: '#15803d',
          rim: '#14532d',
          ribs: '#052e16',
          highlight: '#4ade80',
          backBase: '#166534',
        },
      ),
  },
  {
    id: 'migrator',
    name: 'Migrator Cape',
    type: 'preset',
    getDataUrl: () =>
      createCapeCanvas(
        '#0f172a',
        '#1e293b',
        (ctx, ox, oy) => {
          // Golden compass
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(ox + 4, oy + 5, 2, 6);
          ctx.fillRect(ox + 2, oy + 7, 6, 2);
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(ox + 4, oy + 7, 2, 2);
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(ox + 4, oy + 4, 2, 1); // red north pointer
        },
        {
          base: '#1e293b',
          rim: '#0f172a',
          ribs: '#334155',
          highlight: '#f59e0b',
          backBase: '#0f172a',
        },
      ),
  },
];

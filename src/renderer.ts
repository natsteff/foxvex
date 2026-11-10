import Phaser from 'phaser';
import { sizes } from './puzzle';
import type { Side, Tile, TileMark } from './puzzle';

const palette = [
  ['#4c595c', '#69777b', '#bfcbcd'],
  ['#925f18', '#c68a21', '#f6cf65'],
  ['#095961', '#087d83', '#46c6bd'],
  ['#12602f', '#16863d', '#69d67d'],
  ['#782338', '#ad3049', '#f37d89'],
  ['#642e8a', '#8840b9', '#cd8cf0'],
  ['#843f23', '#b05a2d', '#f4a16c'],
  ['#24518c', '#2f69b4', '#74b8fa'],
  ['#772858', '#a03479', '#e776b5'],
  ['#3a397a', '#4d4b9e', '#9999e4'],
];
const textureSize = 160;
const atlasColumns = Math.max(...sizes);
const corners = [[0, 0], [textureSize, 0], [textureSize, textureSize], [0, textureSize]] as const;
const numberPositions = [[.5, .215], [.785, .5], [.5, .785], [.215, .5]] as const;

function paintMetalTile(context: CanvasRenderingContext2D, x: number, y: number, digits: number[]) {
  context.save();
  context.translate(x, y);
  context.fillStyle = '#111513';
  context.fillRect(0, 0, textureSize, textureSize);
  const middle = textureSize / 2;
  digits.forEach((digit, index) => {
    const [edge, base, sheen] = palette[digit];
    const [labelX, labelY] = numberPositions[index];
    const centerX = labelX * textureSize;
    const centerY = labelY * textureSize;
    // End the sheen inside all three sides so matching faces share one edge color.
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, textureSize * .195);
    gradient.addColorStop(0, sheen);
    gradient.addColorStop(.18, sheen);
    gradient.addColorStop(.61, base);
    gradient.addColorStop(1, edge);
    const [startX, startY] = corners[index];
    const [endX, endY] = corners[(index + 1) % corners.length];
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.lineTo(middle, middle);
    context.fill();
  });
  context.restore();
}

export type TilePosition = { x: number; y: number; size: number };
type TileView = {
  root: Phaser.GameObjects.Container;
  art: Phaser.GameObjects.Image;
  face: Phaser.GameObjects.Graphics;
  labels: Phaser.GameObjects.Text[];
  size: number;
  outlineColor?: number;
  edgeHints?: readonly Side[];
  mark?: TileMark;
};

function drawTileMark(face: Phaser.GameObjects.Graphics, size: number, mark: TileMark) {
  const center = size / 2;
  const diameter = Math.min(size * .44, Phaser.Math.Clamp(size * .28, 20, 30));
  face.fillStyle(0x111827, .85).fillCircle(center, center, diameter / 2);
  face.lineStyle(Math.max(1, diameter * .065), 0xffffff);
  if (mark === 'pencil') {
    const curveY = center - diameter * .11;
    const curveRadius = diameter * .14;
    face.beginPath();
    face.arc(center, curveY, curveRadius, Math.PI, 2.5 * Math.PI);
    face.lineTo(center, center + diameter * .10);
    face.strokePath();
    face.fillStyle(0xffffff).fillCircle(center, center + diameter * .23, diameter * .04);
    return;
  }
  const shackleRadius = diameter * .15;
  const shackleY = center - diameter * .09;
  face.beginPath();
  face.arc(center, shackleY, shackleRadius, Math.PI, 2 * Math.PI);
  face.strokePath();
  face.fillStyle(0xffffff).fillRoundedRect(
    center - diameter * .24, shackleY, diameter * .48, diameter * .32, diameter * .05,
  );
}

function drawEdgeHint(face: Phaser.GameObjects.Graphics, size: number, sides: readonly Side[]) {
  const cyan = 0x00f6ff;
  const stroke = 6;
  const near = stroke / 2;
  const span = size - stroke;
  const radius = Phaser.Math.Clamp(size * .06, 4, 8);
  face.lineStyle(12, cyan, .19).strokeRoundedRect(stroke, stroke, size - 2 * stroke, size - 2 * stroke, radius);
  face.lineStyle(stroke, cyan, .92).strokeRoundedRect(near, near, span, span, radius);
  face.lineStyle(2.5, 0xe5ffff).strokeRoundedRect(near, near, span, span, radius);

  const length = Phaser.Math.Clamp(size * .31, 11, 33);
  const thickness = Phaser.Math.Clamp(size * .065, 4.5, 7);
  const start = (size - length) / 2;
  const far = size - thickness;
  const notches = {
    north: { x: start, y: 0, width: length, height: thickness },
    east: { x: far, y: start, width: thickness, height: length },
    south: { x: start, y: far, width: length, height: thickness },
    west: { x: 0, y: start, width: thickness, height: length },
  };
  for (const side of sides) {
    const { x, y, width, height } = notches[side];
    const cap = thickness / 2;
    const keyX = Math.max(0, x - 1);
    const keyY = Math.max(0, y - 1);
    const keyWidth = Math.min(size, x + width + 1) - keyX;
    const keyHeight = Math.min(size, y + height + 1) - keyY;
    face.fillStyle(0x17312b).fillRoundedRect(keyX, keyY, keyWidth, keyHeight, cap + .5);
    face.fillStyle(0xc8fa55).fillRoundedRect(x, y, width, height, cap);
  }
}

export class TileRenderer extends Phaser.Scene {
  private views: TileView[] = [];
  private tiles: Tile[] = [];
  private atlas!: Phaser.Textures.CanvasTexture;

  constructor(private readonly onReady: () => void) {
    super('tiles');
  }

  create() {
    const dimension = textureSize * atlasColumns;
    this.atlas = this.textures.createCanvas('metal-tile-faces', dimension, dimension)!;
    for (let id = 0; id < atlasColumns ** 2; id++) {
      const x = id % atlasColumns * textureSize;
      const y = Math.floor(id / atlasColumns) * textureSize;
      this.atlas.add(String(id), 0, x, y, textureSize, textureSize);
    }
    this.onReady();
  }

  resize(width: number, height: number) {
    if (this.scale.width !== width || this.scale.height !== height) {
      this.scale.resize(width, height);
    }
  }

  showTiles(tiles: Tile[]) {
    if (this.tiles === tiles) return;
    this.views.forEach(view => view.root.destroy());
    this.tiles = tiles;
    this.views = tiles.map((tile, id) => {
      const digits = [tile.north, tile.east, tile.south, tile.west];
      const frame = this.atlas.get(String(id));
      paintMetalTile(this.atlas.context, frame.cutX, frame.cutY, digits);
      const art = this.add.image(0, 0, this.atlas, frame.name).setOrigin(0);
      const face = this.add.graphics();
      const labels = digits.map(number =>
        this.add.text(0, 0, String(number), {
          fontFamily: 'system-ui, sans-serif',
          fontStyle: 'bold',
          color: '#fff8e9',
          stroke: '#111513',
          strokeThickness: 2.5,
        }).setOrigin(.5),
      );
      const root = this.add.container(0, 0, [art, face, ...labels]);
      return { root, art, face, labels, size: 0 };
    });
    this.atlas.refresh();
  }

  place(id: number, { x, y, size }: TilePosition, { raised = false, outlineColor, edgeHints, mark }: {
    raised?: boolean;
    outlineColor?: number;
    edgeHints?: readonly Side[];
    mark?: TileMark;
  } = {}) {
    const view = this.views[id];
    view.root.setPosition(x, y).setDepth(raised ? 2 : 0).setVisible(size > 0);
    if (size <= 0 || (view.size === size && view.outlineColor === outlineColor &&
        view.edgeHints === edgeHints && view.mark === mark)) return;
    view.size = size;
    view.outlineColor = outlineColor;
    view.edgeHints = edgeHints;
    view.mark = mark;

    const { art, face, labels } = view;
    art.setDisplaySize(size, size);
    face.clear();
    if (mark === 'pencil') face.fillStyle(0xc4cbd4, .42).fillRect(0, 0, size, size);
    face.lineStyle(1, 0x111513, .72)
      .lineBetween(0, 0, size, size).lineBetween(size, 0, 0, size);
    if (edgeHints) drawEdgeHint(face, size, edgeHints);
    if (outlineColor !== undefined) {
      const inset = edgeHints ? 7.5 : 1.5;
      face.lineStyle(3, outlineColor).strokeRect(inset, inset, size - 2 * inset, size - 2 * inset);
    }
    if (mark) drawTileMark(face, size, mark);
    labels.forEach((label, index) => {
      const [labelX, labelY] = numberPositions[index];
      label.setPosition(labelX * size, labelY * size)
        .setFontSize(Math.min(28, Math.max(11, Math.floor(size * .23))));
    });
  }
}

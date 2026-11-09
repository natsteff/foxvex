import Phaser from 'phaser';
import type { Side, Tile } from './puzzle';

const palette = [
  0xffd480, 0x8fd9e4, 0xb9df93, 0xf6a8be, 0xc2b1f6,
  0xffb993, 0x9ec0ff, 0x8fdbc0, 0xf5a49b, 0xd5de91,
];

export type TilePosition = { x: number; y: number; size: number };
type TileView = {
  root: Phaser.GameObjects.Container;
  face: Phaser.GameObjects.Graphics;
  labels: Phaser.GameObjects.Text[];
  size: number;
  outlineColor?: number;
  edgeHints?: readonly Side[];
};

function drawEdgeHint(face: Phaser.GameObjects.Graphics, size: number, sides: readonly Side[]) {
  const cyan = 0x00f6ff;
  const near = -.5;
  const far = size - near;
  const span = far - near;
  const radius = Phaser.Math.Clamp(size * .06, 4, 8);
  face.lineStyle(5, 0x072b35).strokeRoundedRect(near, near, span, span, radius);
  face.lineStyle(12, cyan, .10).strokeRoundedRect(near, near, span, span, radius);
  face.lineStyle(8, cyan, .24).strokeRoundedRect(near, near, span, span, radius);
  face.lineStyle(4.5, cyan, .86).strokeRoundedRect(near, near, span, span, radius);
  face.lineStyle(1.75, 0xe5ffff).strokeRoundedRect(near, near, span, span, radius);

  const length = Phaser.Math.Clamp(size * .31, 11, 33);
  const thickness = Phaser.Math.Clamp(size * .065, 4.5, 7);
  const middle = size / 2;
  const centers = {
    north: [middle, near],
    east: [far, middle],
    south: [middle, far],
    west: [near, middle],
  };
  for (const side of sides) {
    const [centerX, centerY] = centers[side];
    const vertical = side === 'east' || side === 'west';
    const width = vertical ? thickness : length;
    const height = vertical ? length : thickness;
    const x = centerX - width / 2;
    const y = centerY - height / 2;
    const cap = thickness / 2;
    face.fillStyle(cyan, .23).fillRoundedRect(x - 3, y - 3, width + 6, height + 6, cap + 3);
    face.fillStyle(cyan).fillRoundedRect(x - 1, y - 1, width + 2, height + 2, cap + 1);
    face.fillStyle(0xf4ffff).fillRoundedRect(x, y, width, height, cap);
  }
}

export class TileRenderer extends Phaser.Scene {
  private views: TileView[] = [];
  private tiles: Tile[] = [];

  constructor(private readonly onReady: () => void) {
    super('tiles');
  }

  create() {
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
    this.views = tiles.map(tile => {
      const face = this.add.graphics();
      const labels = [tile.north, tile.east, tile.south, tile.west].map(number =>
        this.add.text(0, 0, String(number), {
          fontFamily: 'system-ui, sans-serif',
          fontStyle: 'bold',
          color: '#242639',
        }).setOrigin(.5),
      );
      const root = this.add.container(0, 0, [face, ...labels]);
      return { root, face, labels, size: 0 };
    });
  }

  place(id: number, { x, y, size }: TilePosition, { raised = false, outlineColor, edgeHints }: {
    raised?: boolean;
    outlineColor?: number;
    edgeHints?: readonly Side[];
  } = {}) {
    const view = this.views[id];
    view.root.setPosition(x, y).setDepth(raised ? 2 : 0).setVisible(size > 0);
    if (size <= 0 || (view.size === size && view.outlineColor === outlineColor && view.edgeHints === edgeHints)) return;
    view.size = size;
    view.outlineColor = outlineColor;
    view.edgeHints = edgeHints;

    const { face, labels } = view;
    const { north, east, south, west } = this.tiles[id];
    const middle = size / 2;
    face.clear();
    face.fillStyle(palette[north - 1]).fillTriangle(0, 0, size, 0, middle, middle);
    face.fillStyle(palette[east - 1]).fillTriangle(size, 0, size, size, middle, middle);
    face.fillStyle(palette[south - 1]).fillTriangle(size, size, 0, size, middle, middle);
    face.fillStyle(palette[west - 1]).fillTriangle(0, size, 0, 0, middle, middle);
    face.lineStyle(1, 0x131826, .33)
      .lineBetween(0, 0, size, size).lineBetween(size, 0, 0, size);
    if (outlineColor !== undefined) face.lineStyle(3, outlineColor).strokeRect(1.5, 1.5, size - 3, size - 3);
    if (edgeHints) drawEdgeHint(face, size, edgeHints);
    const positions = [[.5, .215], [.785, .5], [.5, .785], [.215, .5]];
    labels.forEach((label, index) => {
      const [labelX, labelY] = positions[index];
      label.setPosition(labelX * size, labelY * size)
        .setFontSize(Math.min(28, Math.max(11, Math.floor(size * .23))));
    });
  }

  hideAll() {
    this.views.forEach(view => view.root.setVisible(false));
  }
}

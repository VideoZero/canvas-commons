import {BBox, Vector2} from '@canvas-commons/core';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useScene2D} from '../../scenes';
import {
  attributionConfig,
  configureAttribution,
  drawAttribution,
  getAttribution,
  getAttributions,
  onAttributionsChanged,
  parseAttributionFromUrl,
  registerAttribution,
  registerAttributionForSource,
  resetAttributions,
  sanitizeAttributionHtml,
} from '../../utils';
import {Img} from '../Img';
import {Node} from '../Node';
import {mockScene2D} from './mockScene2D';

function withCredit(src: string, credit: unknown, param = 'attribution') {
  return `${src}?${param}=${encodeURIComponent(JSON.stringify(credit))}`;
}

interface DrawnText {
  text: string;
  font: string;
  fillStyle: string;
}

class FakeContext {
  public readonly fills: DrawnText[] = [];
  public readonly rotations: number[] = [];
  public font = '';
  public fillStyle = '';
  public strokeStyle = '';
  public lineWidth = 1;
  public lineJoin = '';
  public lineCap = '';
  public textAlign = '';
  public textBaseline = '';
  public luminance = 0;
  public readonly canvas: {width: number; height: number};

  public constructor(
    private transform: DOMMatrix,
    width = 1920,
    height = 1080,
  ) {
    this.canvas = {width, height};
  }

  public getTransform() {
    return this.transform;
  }

  public setTransform() {
    this.transform = new DOMMatrix();
  }

  public measureText(text: string) {
    const size = parseFloat(this.font);
    return {
      width: text.length * size * 0.5,
      actualBoundingBoxAscent: size * 0.8,
      actualBoundingBoxDescent: size * 0.2,
    };
  }

  public getImageData(_x: number, _y: number, width: number, height: number) {
    return {
      data: new Uint8ClampedArray(width * height * 4).fill(this.luminance),
    };
  }

  public rotate(angle: number) {
    this.rotations.push(angle);
  }

  public fillText(text: string) {
    this.fills.push({text, font: this.font, fillStyle: this.fillStyle});
  }

  public save() {}
  public restore() {}
  public clip() {}
  public translate() {}
  public strokeText() {}

  public asContext() {
    return this as unknown as CanvasRenderingContext2D;
  }
}

const SOURCE = withCredit('/photo.jpg', {text: 'Jane Doe / Example'});
const BOX = BBox.fromSizeCentered(new Vector2(1600, 900));

function draw(node: Node, context: FakeContext, box = BOX, src = SOURCE) {
  drawAttribution(context.asContext(), box, src, node);
  return context.fills;
}

describe('attribution', () => {
  mockScene2D();

  beforeEach(() => resetAttributions());
  afterEach(() => {
    vi.restoreAllMocks();
    configureAttribution({
      enabled: true,
      queryParam: 'attribution',
      render: {position: 'bottom-left'},
    });
  });

  describe('parsing', () => {
    it('reads the credit from the query of the source', () => {
      const src = withCredit('/photo.jpg', {
        text: 'Jane Doe / Example',
        html: '<a href="https://example.com/jane">Jane Doe</a> / Example',
        ['download_notification']: {url: 'https://example.com/track'},
      });

      expect(parseAttributionFromUrl(src)).toEqual({
        text: 'Jane Doe / Example',
        html: '<a href="https://example.com/jane" target="_blank" rel="noopener noreferrer nofollow">Jane Doe</a> / Example',
        downloadNotification: {
          url: 'https://example.com/track',
          method: 'POST',
        },
        sourceUrl: src,
      });
    });

    it('reads a credit that was encoded twice', () => {
      const credit = encodeURIComponent(JSON.stringify({text: '100% Jane'}));
      const src = `/photo.jpg?attribution=${encodeURIComponent(credit)}`;

      expect(parseAttributionFromUrl(src)?.text).toBe('100% Jane');
    });

    it('uses the configured query parameter', () => {
      const src = withCredit('/photo.jpg', {text: 'Jane'}, 'vz_attribution');
      expect(parseAttributionFromUrl(src)).toBeNull();

      configureAttribution({queryParam: 'vz_attribution'});
      expect(parseAttributionFromUrl(src)?.text).toBe('Jane');
    });

    it('ignores sources without a usable credit', () => {
      expect(parseAttributionFromUrl('/photo.jpg')).toBeNull();
      expect(parseAttributionFromUrl('/photo.jpg?attribution=%7Bnope')).toBe(
        null,
      );
      expect(parseAttributionFromUrl(withCredit('/a.jpg', {text: 3}))).toBe(
        null,
      );
      expect(parseAttributionFromUrl(withCredit('/a.jpg', 'Jane'))).toBe(null);
    });
  });

  describe('sanitizing', () => {
    it('keeps only secure links', () => {
      expect(
        sanitizeAttributionHtml(
          '<b>Jane</b> <a href="javascript:alert(1)">Doe</a> <img src=x>',
        ),
      ).toBe('Jane <a>Doe</a> ');
    });

    it('escapes text between tags', () => {
      expect(sanitizeAttributionHtml('Jane & Doe > 1')).toBe(
        'Jane &amp; Doe &gt; 1',
      );
    });

    it('does not let a link break out of its href', () => {
      expect(
        sanitizeAttributionHtml(
          `<a href='https://example.com/" onclick="alert(1)'>Jane</a>`,
        ),
      ).toBe(
        '<a href="https://example.com/&quot; onclick=&quot;alert(1)" target="_blank" rel="noopener noreferrer nofollow">Jane</a>',
      );
    });
  });

  describe('registry', () => {
    it('registers each source once', () => {
      const listener = vi.fn();
      const unsubscribe = onAttributionsChanged(listener);

      registerAttributionForSource(SOURCE);
      registerAttributionForSource(SOURCE);
      registerAttributionForSource('/plain.jpg');
      registerAttributionForSource(null);
      unsubscribe();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(getAttributions().map(({text}) => text)).toEqual([
        'Jane Doe / Example',
      ]);
    });

    it('registers explicit credits', () => {
      registerAttribution('/music.mp3', {
        text: 'Jane Doe',
        downloadNotification: {url: 'https://example.com', method: 'GET'},
      });

      expect(getAttribution('/music.mp3')?.downloadNotification).toEqual({
        url: 'https://example.com',
        method: 'GET',
      });
    });

    it('does nothing while disabled', () => {
      configureAttribution({enabled: false});
      registerAttributionForSource(SOURCE);

      expect(getAttributions()).toEqual([]);
      expect(attributionConfig.render.position).toBe('bottom-left');
    });

    it('is cleared by a reset', () => {
      registerAttributionForSource(SOURCE);
      resetAttributions();

      expect(getAttribution(SOURCE)).toBeUndefined();
    });

    it('is filled by images', () => {
      vi.spyOn(
        HTMLImageElement.prototype,
        'naturalWidth',
        'get',
      ).mockReturnValue(240);
      vi.spyOn(
        HTMLImageElement.prototype,
        'naturalHeight',
        'get',
      ).mockReturnValue(180);
      vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(
        true,
      );
      const image = new Img({src: SOURCE, width: 240});
      useScene2D().getView().add(image);

      expect(image.size().y).toBe(180);
      expect(getAttribution(SOURCE)?.text).toBe('Jane Doe / Example');
    });
  });

  describe('drawing', () => {
    beforeEach(() => registerAttributionForSource(SOURCE));

    it('draws the credit at the reference size', () => {
      const node = new Node({});
      useScene2D().getView().add(node);

      const fills = draw(node, new FakeContext(node.localToWorld()));

      expect(fills).toHaveLength(1);
      expect(fills[0].text).toBe('Jane Doe / Example');
      expect(parseFloat(fills[0].font)).toBeCloseTo(14);
    });

    it('keeps the font size independent of the node scale', () => {
      const node = new Node({scale: 0.5});
      useScene2D().getView().add(node);

      const fills = draw(node, new FakeContext(node.localToWorld()));

      expect(parseFloat(fills[0].font)).toBeCloseTo(14);
    });

    it('keeps the font size when drawn into a small cache', () => {
      const node = new Node({scale: 0.25});
      useScene2D().getView().add(node);
      const cache = node.localToWorld();
      cache.e -= 800;
      cache.f -= 400;

      const fills = draw(node, new FakeContext(cache, 420, 240));

      expect(parseFloat(fills[0].font)).toBeCloseTo(14);
    });

    it('scales with the resolution of the view', () => {
      const view = useScene2D().getView();
      view.scale(2);
      const node = new Node({});
      view.add(node);

      const fills = draw(node, new FakeContext(node.localToWorld()));
      view.scale(1);

      expect(parseFloat(fills[0].font)).toBeCloseTo(28);
    });

    it('breaks a long credit into lines that fit the media', () => {
      const src = withCredit('/long.jpg', {
        text: 'Photo by Jane Doe on Example, licensed under the Example License',
      });
      registerAttributionForSource(src);
      const node = new Node({});
      useScene2D().getView().add(node);
      const box = BBox.fromSizeCentered(new Vector2(300, 1000));

      const fills = draw(node, new FakeContext(node.localToWorld()), box, src);

      expect(fills.length).toBeGreaterThan(1);
      expect(fills.map(({text}) => text).join(' ')).toBe(
        'Photo by Jane Doe on Example, licensed under the Example License',
      );
      for (const {text} of fills) {
        expect(text.length * 14 * 0.5).toBeLessThanOrEqual(300 - 2 * 24);
      }
    });

    it('skips the credit when it would cover too much of the media', () => {
      const node = new Node({});
      useScene2D().getView().add(node);

      const fills = draw(
        node,
        new FakeContext(node.localToWorld()),
        BBox.fromSizeCentered(new Vector2(150, 60)),
      );

      expect(fills).toEqual([]);
    });

    it('follows the rotation of the node', () => {
      const node = new Node({rotation: 30});
      useScene2D().getView().add(node);
      const context = new FakeContext(node.localToWorld());

      draw(node, context);

      expect(context.rotations[0]).toBeCloseTo(Math.PI / 6, 2);
    });

    it('picks a color that contrasts with the media', () => {
      const node = new Node({});
      useScene2D().getView().add(node);
      const bright = new FakeContext(node.localToWorld());
      bright.luminance = 240;
      const dark = new FakeContext(node.localToWorld());
      dark.luminance = 10;

      expect(draw(node, bright)[0].fillStyle).toBe('rgba(17, 17, 17, 0.650)');
      expect(draw(node, dark)[0].fillStyle).toBe('rgba(255, 255, 255, 0.650)');
    });

    it('skips media without a credit', () => {
      const node = new Node({});
      useScene2D().getView().add(node);

      expect(
        draw(node, new FakeContext(node.localToWorld()), BOX, '/plain.jpg'),
      ).toEqual([]);
    });
  });
});

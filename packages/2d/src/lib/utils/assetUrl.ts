import {viaProxy} from '@canvas-commons/core';

/**
 * Resolve the url of a media asset and the key to pool it under.
 */
export function resolveAssetUrl(
  rawSrc: string | null,
  assetHash: () => string,
): {key: string; src: string} {
  if (!rawSrc) {
    return {key: '', src: ''};
  }

  const key = viaProxy(rawSrc);
  const origin = window.origin;
  let url: URL;
  try {
    url = new URL(key, origin === 'null' ? undefined : origin);
  } catch {
    return {key, src: key};
  }

  // Blob and data urls can share the origin of the page but break when a
  // query is appended to them.
  if (
    url.origin === origin &&
    (url.protocol === 'http:' || url.protocol === 'https:')
  ) {
    url.searchParams.set('asset-hash', assetHash());
  }

  return {key, src: url.toString()};
}

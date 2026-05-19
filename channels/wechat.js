(function () {
  const t = (key, params) => (globalThis.DogeclawI18n?.t ? globalThis.DogeclawI18n.t(key, params) : key);
  const CONFIG = globalThis.DogeclawConfig || {};
  const PLATFORM = globalThis.DogeclawPlatform || {};
  const WECHAT_CONFIG = CONFIG.wechat || {};
  const CDN_BASE_URL = WECHAT_CONFIG.cdnBaseUrl || "https://novac2c.cdn.weixin.qq.com/c2c";
  const MEDIA_MAX_BYTES = WECHAT_CONFIG.mediaMaxBytes || 100 * 1024 * 1024;
  const UPLOAD_MAX_RETRIES = WECHAT_CONFIG.mediaUploadMaxRetries || 3;

  const UploadMediaType = {
    IMAGE: 1,
    VIDEO: 2,
    FILE: 3,
    VOICE: 4
  };

  const MessageType = {
    USER: 1,
    BOT: 2
  };

  const MessageState = {
    FINISH: 2
  };

  const MessageItemType = {
    TEXT: 1,
    IMAGE: 2,
    VOICE: 3,
    FILE: 4,
    VIDEO: 5
  };

  const EXTENSION_TO_MIME = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.ms-powerpoint",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp"
  };

  const MIME_TO_EXTENSION = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-matroska": ".mkv",
    "video/x-msvideo": ".avi",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "application/x-tar": ".tar",
    "application/gzip": ".gz",
    "text/plain": ".txt",
    "text/csv": ".csv"
  };

  function buildCdnDownloadUrl(encryptedQueryParam, cdnBaseUrl = CDN_BASE_URL) {
    return `${cdnBaseUrl}/download?encrypted_query_param=${encodeURIComponent(encryptedQueryParam)}`;
  }

  function buildCdnUploadUrl({ cdnBaseUrl = CDN_BASE_URL, uploadParam, filekey }) {
    return `${cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(filekey)}`;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function asciiToBase64(value) {
    return btoa(String(value || ""));
  }

  function base64ToBytes(base64) {
    const binary = atob(String(base64 || ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function hexToBytes(hex) {
    const clean = String(hex || "").trim();
    if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
      throw new Error("invalid hex bytes");
    }
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  function randomHex(length) {
    return bytesToHex(randomBytes(length));
  }

  function add32(a, b) {
    return (a + b) | 0;
  }

  function rol(num, cnt) {
    return (num << cnt) | (num >>> (32 - cnt));
  }

  function cmn(q, a, b, x, s, t) {
    return add32(rol(add32(add32(a, q), add32(x, t)), s), b);
  }

  function ff(a, b, c, d, x, s, t) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }

  function gg(a, b, c, d, x, s, t) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }

  function hh(a, b, c, d, x, s, t) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a, b, c, d, x, s, t) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function md5Hex(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
    const paddedLength = (((bytes.length + 8) >>> 6) + 1) * 64;
    const data = new Uint8Array(paddedLength);
    data.set(bytes);
    data[bytes.length] = 0x80;
    const bitLength = bytes.length * 8;
    for (let i = 0; i < 8; i += 1) {
      data[paddedLength - 8 + i] = Math.floor(bitLength / 2 ** (8 * i)) & 0xff;
    }

    let a = 1732584193;
    let b = -271733879;
    let c = -1732584194;
    let d = 271733878;
    const x = new Array(16);

    for (let i = 0; i < data.length; i += 64) {
      for (let j = 0; j < 16; j += 1) {
        const k = i + j * 4;
        x[j] = data[k] | (data[k + 1] << 8) | (data[k + 2] << 16) | (data[k + 3] << 24);
      }

      const olda = a;
      const oldb = b;
      const oldc = c;
      const oldd = d;

      a = ff(a, b, c, d, x[0], 7, -680876936);
      d = ff(d, a, b, c, x[1], 12, -389564586);
      c = ff(c, d, a, b, x[2], 17, 606105819);
      b = ff(b, c, d, a, x[3], 22, -1044525330);
      a = ff(a, b, c, d, x[4], 7, -176418897);
      d = ff(d, a, b, c, x[5], 12, 1200080426);
      c = ff(c, d, a, b, x[6], 17, -1473231341);
      b = ff(b, c, d, a, x[7], 22, -45705983);
      a = ff(a, b, c, d, x[8], 7, 1770035416);
      d = ff(d, a, b, c, x[9], 12, -1958414417);
      c = ff(c, d, a, b, x[10], 17, -42063);
      b = ff(b, c, d, a, x[11], 22, -1990404162);
      a = ff(a, b, c, d, x[12], 7, 1804603682);
      d = ff(d, a, b, c, x[13], 12, -40341101);
      c = ff(c, d, a, b, x[14], 17, -1502002290);
      b = ff(b, c, d, a, x[15], 22, 1236535329);

      a = gg(a, b, c, d, x[1], 5, -165796510);
      d = gg(d, a, b, c, x[6], 9, -1069501632);
      c = gg(c, d, a, b, x[11], 14, 643717713);
      b = gg(b, c, d, a, x[0], 20, -373897302);
      a = gg(a, b, c, d, x[5], 5, -701558691);
      d = gg(d, a, b, c, x[10], 9, 38016083);
      c = gg(c, d, a, b, x[15], 14, -660478335);
      b = gg(b, c, d, a, x[4], 20, -405537848);
      a = gg(a, b, c, d, x[9], 5, 568446438);
      d = gg(d, a, b, c, x[14], 9, -1019803690);
      c = gg(c, d, a, b, x[3], 14, -187363961);
      b = gg(b, c, d, a, x[8], 20, 1163531501);
      a = gg(a, b, c, d, x[13], 5, -1444681467);
      d = gg(d, a, b, c, x[2], 9, -51403784);
      c = gg(c, d, a, b, x[7], 14, 1735328473);
      b = gg(b, c, d, a, x[12], 20, -1926607734);

      a = hh(a, b, c, d, x[5], 4, -378558);
      d = hh(d, a, b, c, x[8], 11, -2022574463);
      c = hh(c, d, a, b, x[11], 16, 1839030562);
      b = hh(b, c, d, a, x[14], 23, -35309556);
      a = hh(a, b, c, d, x[1], 4, -1530992060);
      d = hh(d, a, b, c, x[4], 11, 1272893353);
      c = hh(c, d, a, b, x[7], 16, -155497632);
      b = hh(b, c, d, a, x[10], 23, -1094730640);
      a = hh(a, b, c, d, x[13], 4, 681279174);
      d = hh(d, a, b, c, x[0], 11, -358537222);
      c = hh(c, d, a, b, x[3], 16, -722521979);
      b = hh(b, c, d, a, x[6], 23, 76029189);
      a = hh(a, b, c, d, x[9], 4, -640364487);
      d = hh(d, a, b, c, x[12], 11, -421815835);
      c = hh(c, d, a, b, x[15], 16, 530742520);
      b = hh(b, c, d, a, x[2], 23, -995338651);

      a = ii(a, b, c, d, x[0], 6, -198630844);
      d = ii(d, a, b, c, x[7], 10, 1126891415);
      c = ii(c, d, a, b, x[14], 15, -1416354905);
      b = ii(b, c, d, a, x[5], 21, -57434055);
      a = ii(a, b, c, d, x[12], 6, 1700485571);
      d = ii(d, a, b, c, x[3], 10, -1894986606);
      c = ii(c, d, a, b, x[10], 15, -1051523);
      b = ii(b, c, d, a, x[1], 21, -2054922799);
      a = ii(a, b, c, d, x[8], 6, 1873313359);
      d = ii(d, a, b, c, x[15], 10, -30611744);
      c = ii(c, d, a, b, x[6], 15, -1560198380);
      b = ii(b, c, d, a, x[13], 21, 1309151649);
      a = ii(a, b, c, d, x[4], 6, -145523070);
      d = ii(d, a, b, c, x[11], 10, -1120210379);
      c = ii(c, d, a, b, x[2], 15, 718787259);
      b = ii(b, c, d, a, x[9], 21, -343485551);

      a = add32(a, olda);
      b = add32(b, oldb);
      c = add32(c, oldc);
      d = add32(d, oldd);
    }

    return [a, b, c, d]
      .map((word) => {
        let text = "";
        for (let i = 0; i < 4; i += 1) {
          text += ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
        }
        return text;
      })
      .join("");
  }

  function gfMul(a, b) {
    let p = 0;
    let x = a;
    let y = b;
    for (let i = 0; i < 8; i += 1) {
      if (y & 1) p ^= x;
      const hi = x & 0x80;
      x = (x << 1) & 0xff;
      if (hi) x ^= 0x1b;
      y >>>= 1;
    }
    return p;
  }

  function gfPow(a, power) {
    let result = 1;
    let base = a;
    let exp = power;
    while (exp > 0) {
      if (exp & 1) result = gfMul(result, base);
      base = gfMul(base, base);
      exp >>>= 1;
    }
    return result;
  }

  function rotl8(value, shift) {
    return ((value << shift) | (value >>> (8 - shift))) & 0xff;
  }

  function createAesTables() {
    const sbox = new Uint8Array(256);
    const invSbox = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) {
      const inv = i === 0 ? 0 : gfPow(i, 254);
      const value = inv ^ rotl8(inv, 1) ^ rotl8(inv, 2) ^ rotl8(inv, 3) ^ rotl8(inv, 4) ^ 0x63;
      sbox[i] = value & 0xff;
      invSbox[value & 0xff] = i;
    }
    return { sbox, invSbox };
  }

  const AES = createAesTables();
  const AES_RCON = [0, 1, 2, 4, 8, 16, 32, 64, 128, 27, 54];

  function expandAes128Key(key) {
    if (!(key instanceof Uint8Array) || key.length !== 16) {
      throw new Error("AES-128 key must be 16 bytes");
    }
    const expanded = new Uint8Array(176);
    expanded.set(key);
    const temp = new Uint8Array(4);
    let bytesGenerated = 16;
    let rconIteration = 1;

    while (bytesGenerated < 176) {
      temp.set(expanded.subarray(bytesGenerated - 4, bytesGenerated));
      if (bytesGenerated % 16 === 0) {
        const first = temp[0];
        temp[0] = AES.sbox[temp[1]] ^ AES_RCON[rconIteration];
        temp[1] = AES.sbox[temp[2]];
        temp[2] = AES.sbox[temp[3]];
        temp[3] = AES.sbox[first];
        rconIteration += 1;
      }
      for (let i = 0; i < 4; i += 1) {
        expanded[bytesGenerated] = expanded[bytesGenerated - 16] ^ temp[i];
        bytesGenerated += 1;
      }
    }
    return expanded;
  }

  function addRoundKey(state, expandedKey, round) {
    const offset = round * 16;
    for (let i = 0; i < 16; i += 1) {
      state[i] ^= expandedKey[offset + i];
    }
  }

  function subBytes(state) {
    for (let i = 0; i < 16; i += 1) state[i] = AES.sbox[state[i]];
  }

  function invSubBytes(state) {
    for (let i = 0; i < 16; i += 1) state[i] = AES.invSbox[state[i]];
  }

  function shiftRows(state) {
    let t = state[1];
    state[1] = state[5]; state[5] = state[9]; state[9] = state[13]; state[13] = t;
    t = state[2];
    state[2] = state[10]; state[10] = t; t = state[6]; state[6] = state[14]; state[14] = t;
    t = state[15];
    state[15] = state[11]; state[11] = state[7]; state[7] = state[3]; state[3] = t;
  }

  function invShiftRows(state) {
    let t = state[13];
    state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = t;
    t = state[2];
    state[2] = state[10]; state[10] = t; t = state[6]; state[6] = state[14]; state[14] = t;
    t = state[3];
    state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = t;
  }

  function mixColumns(state) {
    for (let c = 0; c < 4; c += 1) {
      const i = c * 4;
      const a0 = state[i];
      const a1 = state[i + 1];
      const a2 = state[i + 2];
      const a3 = state[i + 3];
      state[i] = gfMul(a0, 2) ^ gfMul(a1, 3) ^ a2 ^ a3;
      state[i + 1] = a0 ^ gfMul(a1, 2) ^ gfMul(a2, 3) ^ a3;
      state[i + 2] = a0 ^ a1 ^ gfMul(a2, 2) ^ gfMul(a3, 3);
      state[i + 3] = gfMul(a0, 3) ^ a1 ^ a2 ^ gfMul(a3, 2);
    }
  }

  function invMixColumns(state) {
    for (let c = 0; c < 4; c += 1) {
      const i = c * 4;
      const a0 = state[i];
      const a1 = state[i + 1];
      const a2 = state[i + 2];
      const a3 = state[i + 3];
      state[i] = gfMul(a0, 14) ^ gfMul(a1, 11) ^ gfMul(a2, 13) ^ gfMul(a3, 9);
      state[i + 1] = gfMul(a0, 9) ^ gfMul(a1, 14) ^ gfMul(a2, 11) ^ gfMul(a3, 13);
      state[i + 2] = gfMul(a0, 13) ^ gfMul(a1, 9) ^ gfMul(a2, 14) ^ gfMul(a3, 11);
      state[i + 3] = gfMul(a0, 11) ^ gfMul(a1, 13) ^ gfMul(a2, 9) ^ gfMul(a3, 14);
    }
  }

  function encryptAesBlock(block, expandedKey) {
    const state = new Uint8Array(block);
    addRoundKey(state, expandedKey, 0);
    for (let round = 1; round < 10; round += 1) {
      subBytes(state);
      shiftRows(state);
      mixColumns(state);
      addRoundKey(state, expandedKey, round);
    }
    subBytes(state);
    shiftRows(state);
    addRoundKey(state, expandedKey, 10);
    return state;
  }

  function decryptAesBlock(block, expandedKey) {
    const state = new Uint8Array(block);
    addRoundKey(state, expandedKey, 10);
    for (let round = 9; round > 0; round -= 1) {
      invShiftRows(state);
      invSubBytes(state);
      addRoundKey(state, expandedKey, round);
      invMixColumns(state);
    }
    invShiftRows(state);
    invSubBytes(state);
    addRoundKey(state, expandedKey, 0);
    return state;
  }

  function aesEcbPaddedSize(plaintextSize) {
    return Math.ceil((Number(plaintextSize) + 1) / 16) * 16;
  }

  function encryptAesEcb(plaintext, key) {
    const input = plaintext instanceof Uint8Array ? plaintext : new Uint8Array(plaintext || []);
    const expandedKey = expandAes128Key(key);
    const paddedLength = aesEcbPaddedSize(input.length);
    const padded = new Uint8Array(paddedLength);
    padded.set(input);
    padded.fill(paddedLength - input.length, input.length);
    const output = new Uint8Array(paddedLength);
    for (let i = 0; i < padded.length; i += 16) {
      output.set(encryptAesBlock(padded.subarray(i, i + 16), expandedKey), i);
    }
    return output;
  }

  function decryptAesEcb(ciphertext, key) {
    const input = ciphertext instanceof Uint8Array ? ciphertext : new Uint8Array(ciphertext || []);
    if (input.length % 16 !== 0) {
      throw new Error("AES-ECB ciphertext length must be a multiple of 16");
    }
    const expandedKey = expandAes128Key(key);
    const output = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i += 16) {
      output.set(decryptAesBlock(input.subarray(i, i + 16), expandedKey), i);
    }
    const pad = output[output.length - 1];
    if (pad < 1 || pad > 16) {
      throw new Error("invalid AES-ECB PKCS7 padding");
    }
    for (let i = output.length - pad; i < output.length; i += 1) {
      if (output[i] !== pad) {
        throw new Error("invalid AES-ECB PKCS7 padding");
      }
    }
    return output.slice(0, output.length - pad);
  }

  function parseAesKey(aesKeyBase64, label = "media") {
    const decoded = base64ToBytes(aesKeyBase64);
    if (decoded.length === 16) {
      return decoded;
    }
    if (decoded.length === 32) {
      const ascii = String.fromCharCode(...decoded);
      if (/^[0-9a-fA-F]{32}$/.test(ascii)) {
        return hexToBytes(ascii);
      }
    }
    throw new Error(`${label}: aes_key must decode to 16 raw bytes or 32-char hex string`);
  }

  function getExtensionFromFilename(filename) {
    const match = String(filename || "").toLowerCase().match(/(\.[a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function getMimeFromFilename(filename) {
    return EXTENSION_TO_MIME[getExtensionFromFilename(filename)] || "application/octet-stream";
  }

  function getExtensionFromMime(mimeType) {
    return MIME_TO_EXTENSION[String(mimeType || "").split(";")[0].trim().toLowerCase()] || ".bin";
  }

  function detectMimeType(bytes, fallback = "application/octet-stream") {
    if (bytes?.length >= 12) {
      if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
      if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
      if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
      if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "video/mp4";
      if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "application/zip";
    }
    return fallback;
  }

  function buildDataUrl(bytes, mimeType) {
    return `data:${mimeType || "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
  }

  function assertMediaSize(bytes, label = "media") {
    if (bytes.length > MEDIA_MAX_BYTES) {
      throw new Error(`${label} is too large: ${bytes.length} bytes`);
    }
  }

  async function fetchBytes(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`fetch media failed: ${response.status}`);
    }
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") || ""
    };
  }

  async function sourceToMediaData(media = {}) {
    if (media.bytes instanceof Uint8Array) {
      assertMediaSize(media.bytes);
      const mimeType = media.mimeType || detectMimeType(media.bytes);
      return {
        bytes: media.bytes,
        mimeType,
        fileName: media.fileName || `media${getExtensionFromMime(mimeType)}`
      };
    }

    const dataUrl = String(media.dataUrl || media.data_url || "");
    if (dataUrl.startsWith("data:")) {
      const match = dataUrl.match(/^data:([^;,]+)?(?:;[^,]*)?,(.*)$/);
      if (!match) throw new Error("invalid data URL media");
      const mimeType = match[1] || media.mimeType || "application/octet-stream";
      const bytes = base64ToBytes(match[2]);
      assertMediaSize(bytes);
      return {
        bytes,
        mimeType,
        fileName: media.fileName || media.filename || `media${getExtensionFromMime(mimeType)}`
      };
    }

    const url = String(media.url || media.mediaUrl || media.src || "").trim();
    if (url) {
      const fetched = await fetchBytes(url);
      assertMediaSize(fetched.bytes);
      const mimeType = media.mimeType || fetched.contentType || detectMimeType(fetched.bytes);
      return {
        bytes: fetched.bytes,
        mimeType,
        fileName: media.fileName || media.filename || `media${getExtensionFromMime(mimeType)}`
      };
    }

    throw new Error("media source is required");
  }

  async function uploadBufferToCdn({ bytes, uploadFullUrl, uploadParam, filekey, cdnBaseUrl, aeskey }) {
    const ciphertext = encryptAesEcb(bytes, aeskey);
    const cdnUrl = uploadFullUrl?.trim()
      ? uploadFullUrl.trim()
      : buildCdnUploadUrl({ cdnBaseUrl, uploadParam, filekey });
    let lastError = null;

    for (let attempt = 1; attempt <= UPLOAD_MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetch(cdnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream"
          },
          body: ciphertext
        });
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`CDN upload client error ${response.status}: ${await response.text().catch(() => "")}`);
        }
        if (response.status !== 200) {
          throw new Error(`CDN upload server error ${response.status}`);
        }
        const downloadParam = response.headers.get("x-encrypted-param") || "";
        if (!downloadParam) {
          throw new Error("CDN upload response missing x-encrypted-param header");
        }
        return { downloadParam };
      } catch (error) {
        lastError = error;
        if (String(error?.message || error).includes("client error")) {
          throw error;
        }
      }
    }

    throw lastError || new Error("CDN upload failed");
  }

  async function uploadMedia({ request, config, toUserId, media, mediaType }) {
    const data = await sourceToMediaData(media);
    if (data.bytes.length > MEDIA_MAX_BYTES) {
      throw new Error(`media is too large: ${data.bytes.length} bytes`);
    }
    const filekey = randomHex(16);
    const aeskey = randomBytes(16);
    const uploadUrlResp = await request("getuploadurl", {
      filekey,
      media_type: mediaType,
      to_user_id: toUserId,
      rawsize: data.bytes.length,
      rawfilemd5: md5Hex(data.bytes),
      filesize: aesEcbPaddedSize(data.bytes.length),
      no_need_thumb: true,
      aeskey: bytesToHex(aeskey),
      base_info: {
        channel_version: config.channelVersion || "2.1.8"
      }
    });
    const uploadFullUrl = String(uploadUrlResp?.upload_full_url || "").trim();
    const uploadParam = uploadUrlResp?.upload_param || "";
    if (!uploadFullUrl && !uploadParam) {
      throw new Error("getUploadUrl returned no upload URL");
    }
    const { downloadParam } = await uploadBufferToCdn({
      bytes: data.bytes,
      uploadFullUrl,
      uploadParam,
      filekey,
      cdnBaseUrl: config.cdnBaseUrl || CDN_BASE_URL,
      aeskey
    });

    return {
      filekey,
      downloadEncryptedQueryParam: downloadParam,
      aeskeyHex: bytesToHex(aeskey),
      // Strictly match openclaw-weixin: CDNMedia.aes_key is base64(hex string),
      // not base64(raw 16-byte key). We still accept both encodings inbound.
      aeskeyBase64: asciiToBase64(bytesToHex(aeskey)),
      aeskeyRawBase64: bytesToBase64(aeskey),
      fileSize: data.bytes.length,
      fileSizeCiphertext: aesEcbPaddedSize(data.bytes.length),
      mimeType: data.mimeType,
      fileName: data.fileName
    };
  }

  function buildTextItem(text) {
    return {
      type: MessageItemType.TEXT,
      text_item: {
        text: String(text || "")
      }
    };
  }

  function buildMediaItem(uploaded, kind) {
    const media = {
      encrypt_query_param: uploaded.downloadEncryptedQueryParam,
      aes_key: uploaded.aeskeyBase64,
      encrypt_type: 1
    };
    if (kind === "image") {
      return {
        type: MessageItemType.IMAGE,
        image_item: {
          media,
          mid_size: uploaded.fileSizeCiphertext
        }
      };
    }
    if (kind === "video") {
      return {
        type: MessageItemType.VIDEO,
        video_item: {
          media,
          video_size: uploaded.fileSizeCiphertext
        }
      };
    }
    return {
      type: MessageItemType.FILE,
      file_item: {
        media,
        file_name: uploaded.fileName || "file.bin",
        len: String(uploaded.fileSize)
      }
    };
  }

  function inferMediaKind(media, mimeType) {
    const kind = String(media.kind || media.type || "").toLowerCase();
    if (["image", "video", "file"].includes(kind)) return kind;
    const mime = String(mimeType || media.mimeType || "").toLowerCase();
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    return "file";
  }

  function getUploadMediaType(kind) {
    if (kind === "image") return UploadMediaType.IMAGE;
    if (kind === "video") return UploadMediaType.VIDEO;
    return UploadMediaType.FILE;
  }

  async function fetchCdnBytes(cdnMedia, config, label) {
    const fullUrl = cdnMedia?.full_url || "";
    const encryptQueryParam = cdnMedia?.encrypt_query_param || "";
    if (!fullUrl && !encryptQueryParam) {
      throw new Error(`${label}: CDN media URL is missing`);
    }
    const url = fullUrl || buildCdnDownloadUrl(encryptQueryParam, config.cdnBaseUrl || CDN_BASE_URL);
    return (await fetchBytes(url)).bytes;
  }

  async function downloadAndDecryptMedia(cdnMedia, config, label, aesKeyBase64) {
    const encrypted = await fetchCdnBytes(cdnMedia, config, label);
    assertMediaSize(encrypted, label);
    if (!aesKeyBase64) {
      return encrypted;
    }
    const decrypted = decryptAesEcb(encrypted, parseAesKey(aesKeyBase64, label));
    assertMediaSize(decrypted, label);
    return decrypted;
  }

  function mediaItemText(item) {
    if (item.type === MessageItemType.IMAGE) return t("media.image");
    if (item.type === MessageItemType.VIDEO) return t("media.video");
    if (item.type === MessageItemType.FILE) return t("media.file", { name: item.file_item?.file_name || t("media.unnamedFile") });
    if (item.type === MessageItemType.VOICE) return item.voice_item?.text || t("media.voice");
    return t("media.generic");
  }

  function isMediaItem(item) {
    return [MessageItemType.IMAGE, MessageItemType.VIDEO, MessageItemType.FILE, MessageItemType.VOICE].includes(item?.type);
  }

  function bodyFromItemList(itemList) {
    if (!Array.isArray(itemList) || !itemList.length) return "";
    for (const item of itemList) {
      if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
        const text = String(item.text_item.text);
        const ref = item.ref_msg;
        if (!ref) return text;
        if (ref.message_item && isMediaItem(ref.message_item)) return text;
        const parts = [];
        if (ref.title) parts.push(ref.title);
        if (ref.message_item) {
          const refBody = bodyFromItemList([ref.message_item]);
          if (refBody) parts.push(refBody);
        }
        return parts.length ? t("media.quote", { text: parts.join(" | "), body: text }) : text;
      }
      if (item.type === MessageItemType.VOICE && item.voice_item?.text) {
        return String(item.voice_item.text);
      }
    }
    return "";
  }

  async function downloadMediaItem(item, config, label) {
    if (item.type === MessageItemType.IMAGE) {
      const image = item.image_item || {};
      const aesKeyBase64 = image.aeskey ? bytesToBase64(hexToBytes(image.aeskey)) : image.media?.aes_key || "";
      const bytes = await downloadAndDecryptMedia(image.media || {}, config, `${label} image`, aesKeyBase64);
      const mimeType = detectMimeType(bytes, "image/jpeg");
      return {
        type: "image",
        mimeType,
        fileName: `image${getExtensionFromMime(mimeType)}`,
        size: bytes.length,
        dataUrl: buildDataUrl(bytes, mimeType),
        text: t("media.image")
      };
    }
    if (item.type === MessageItemType.VIDEO) {
      const video = item.video_item || {};
      if (!video.media?.aes_key) {
        throw new Error("video aes_key is missing");
      }
      const bytes = await downloadAndDecryptMedia(video.media || {}, config, `${label} video`, video.media?.aes_key || "");
      const mimeType = detectMimeType(bytes, "video/mp4");
      return {
        type: "video",
        mimeType,
        fileName: `video${getExtensionFromMime(mimeType)}`,
        size: bytes.length,
        dataUrl: buildDataUrl(bytes, mimeType),
        text: t("media.video")
      };
    }
    if (item.type === MessageItemType.FILE) {
      const file = item.file_item || {};
      if (!file.media?.aes_key) {
        throw new Error("file aes_key is missing");
      }
      const bytes = await downloadAndDecryptMedia(file.media || {}, config, `${label} file`, file.media?.aes_key || "");
      const fileName = file.file_name || "file.bin";
      const mimeType = detectMimeType(bytes, getMimeFromFilename(fileName));
      return {
        type: "file",
        mimeType,
        fileName,
        size: bytes.length,
        dataUrl: buildDataUrl(bytes, mimeType),
        text: t("media.file", { name: fileName })
      };
    }
    if (item.type === MessageItemType.VOICE) {
      const voice = item.voice_item || {};
      if (!voice.media?.encrypt_query_param && !voice.media?.full_url) {
        return {
          type: "voice",
          mimeType: "",
          fileName: "",
          size: 0,
          text: voice.text || t("media.voice")
        };
      }
      if (!voice.media?.aes_key) {
        throw new Error("voice aes_key is missing");
      }
      const bytes = await downloadAndDecryptMedia(voice.media || {}, config, `${label} voice`, voice.media?.aes_key || "");
      return {
        type: "voice",
        mimeType: "audio/silk",
        fileName: "voice.silk",
        size: bytes.length,
        dataUrl: buildDataUrl(bytes, "audio/silk"),
        text: voice.text || t("media.voice")
      };
    }
    return null;
  }

  async function prepareIncomingMessage(message, config, options = {}) {
    const itemList = Array.isArray(message?.item_list) ? message.item_list : [];
    const text = bodyFromItemList(itemList);
    const mediaItems = itemList.filter(isMediaItem);
    const attachments = [];

    for (const item of mediaItems) {
      try {
        const attachment = await downloadMediaItem(item, config, options.label || "inbound");
        if (attachment) attachments.push(attachment);
      } catch (error) {
        attachments.push({
          type: String(mediaItemText(item)).replace(/[[\]]/g, "") || t("media.genericBare"),
          text: t("media.downloadFailed", { label: mediaItemText(item), error: error?.message || String(error) }),
          error: error?.message || String(error)
        });
      }
    }

    const mediaText = attachments.map((attachment) => attachment.text || `[${attachment.type || t("media.genericBare")}]`).filter(Boolean);
    const content = [text, ...mediaText].filter(Boolean).join("\n").trim();
    return {
      text,
      content,
      attachments
    };
  }

  globalThis.DogeclawWechatMedia = {
    CDN_BASE_URL,
    UploadMediaType,
    MessageType,
    MessageState,
    MessageItemType,
    buildCdnDownloadUrl,
    buildCdnUploadUrl,
    buildTextItem,
    buildMediaItem,
    bodyFromItemList,
    prepareIncomingMessage,
    uploadMedia,
    inferMediaKind,
    getUploadMediaType,
    getMimeFromFilename,
    getExtensionFromMime,
    detectMimeType,
    sourceToMediaData,
    md5Hex,
    aesEcbPaddedSize,
    encryptAesEcb,
    decryptAesEcb,
    bytesToHex,
    hexToBytes,
    bytesToBase64,
    base64ToBytes
  };
})();

(function () {
  const t = (key, params) => (globalThis.DogeclawI18n?.t ? globalThis.DogeclawI18n.t(key, params) : key);
  const CONFIG = globalThis.DogeclawConfig || {};
  const STORAGE_CONFIG = CONFIG.storage || {};
  const WECHAT_CONFIG = CONFIG.wechat || {};
  const MEDIA = globalThis.DogeclawWechatMedia || {};
  const CONFIG_KEY = STORAGE_CONFIG.wechatConfigKey || "dogeclaw-channel-wechat-config";
  const STATE_KEY = STORAGE_CONFIG.wechatStateKey || "dogeclaw-channel-wechat-state";
  const LOGIN_KEY = STORAGE_CONFIG.wechatLoginKey || "dogeclaw-channel-wechat-login";
  const DEFAULT_TIMEOUT_MS = WECHAT_CONFIG.defaultTimeoutMs || 30000;
  const QR_LONG_POLL_TIMEOUT_MS = WECHAT_CONFIG.qrLongPollTimeoutMs || 35000;
  const ACTIVE_LOGIN_TTL_MS = WECHAT_CONFIG.activeLoginTtlMs || 5 * 60 * 1000;
  const DEFAULT_LOGIN_WAIT_TIMEOUT_MS = WECHAT_CONFIG.defaultLoginWaitTimeoutMs || 480000;
  const MAX_QR_REFRESH_COUNT = WECHAT_CONFIG.maxQrRefreshCount || 3;
  const DEFAULT_ILINK_BOT_TYPE = WECHAT_CONFIG.defaultBotType || "3";
  const FIXED_QR_BASE_URL = WECHAT_CONFIG.fixedQrBaseUrl || "https://ilinkai.weixin.qq.com";
  const DEFAULT_CDN_BASE_URL = WECHAT_CONFIG.cdnBaseUrl || MEDIA.CDN_BASE_URL || "https://novac2c.cdn.weixin.qq.com/c2c";
  const DEFAULT_ILINK_APP_ID = WECHAT_CONFIG.defaultAppId || "bot";
  const DEFAULT_ILINK_APP_CLIENT_VERSION = WECHAT_CONFIG.defaultClientVersion || "131336";
  const CHANNEL_VERSION = WECHAT_CONFIG.channelVersion || "2.1.8";
  const CONFIG_TIMEOUT_MS = WECHAT_CONFIG.configTimeoutMs || 10000;
  const TYPING_STATUS = {
    TYPING: WECHAT_CONFIG.typingStatus?.typing || 1,
    CANCEL: WECHAT_CONFIG.typingStatus?.cancel || 2
  };
  const MESSAGE_TYPE = {
    USER: 1,
    BOT: 2
  };
  const MESSAGE_STATE = {
    FINISH: 2
  };
  const MESSAGE_ITEM_TYPE = {
    TEXT: MEDIA.MessageItemType?.TEXT || 1,
    IMAGE: MEDIA.MessageItemType?.IMAGE || 2,
    VOICE: MEDIA.MessageItemType?.VOICE || 3,
    FILE: MEDIA.MessageItemType?.FILE || 4,
    VIDEO: MEDIA.MessageItemType?.VIDEO || 5
  };
  const DEFAULT_CONFIG = {
    ...(WECHAT_CONFIG.defaultConfig || {}),
    enabled: false,
    apiBase: WECHAT_CONFIG.defaultConfig?.apiBase || "https://ilinkai.weixin.qq.com",
    cdnBaseUrl: WECHAT_CONFIG.defaultConfig?.cdnBaseUrl || DEFAULT_CDN_BASE_URL,
    token: "",
    appId: WECHAT_CONFIG.defaultConfig?.appId || DEFAULT_ILINK_APP_ID,
    clientVersion: WECHAT_CONFIG.defaultConfig?.clientVersion || DEFAULT_ILINK_APP_CLIENT_VERSION,
    accountId: "",
    uin: ""
  };

  function normalizeBaseUrl(value) {
    const raw = String(value || DEFAULT_CONFIG.apiBase).trim().replace(/\/+$/g, "") || DEFAULT_CONFIG.apiBase;
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  }

  function normalizeCdnBaseUrl(value) {
    const raw = String(value || DEFAULT_CONFIG.cdnBaseUrl).trim().replace(/\/+$/g, "") || DEFAULT_CONFIG.cdnBaseUrl;
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  }

  function normalizePath(pathname) {
    const raw = String(pathname || "").replace(/^\/+/, "");
    return raw.startsWith("ilink/bot/") ? raw : `ilink/bot/${raw}`;
  }

  function maskSecret(value) {
    const text = String(value || "");
    if (!text) {
      return "";
    }
    return text.length <= 8 ? "configured" : `${text.slice(0, 4)}...${text.slice(-4)}`;
  }

  function createUin() {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const value =
      ((bytes[0] << 24) >>> 0) +
      ((bytes[1] << 16) >>> 0) +
      ((bytes[2] << 8) >>> 0) +
      bytes[3];
    return btoa(String(value >>> 0));
  }

  function isValidUin(value) {
    try {
      return /^\d+$/.test(atob(String(value || "")));
    } catch {
      return false;
    }
  }

  function withTimeout(timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);
    return {
      signal: controller.signal,
      clear() {
        clearTimeout(timerId);
      }
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isLoginFresh(login) {
    return Boolean(login?.startedAt && Date.now() - login.startedAt < ACTIVE_LOGIN_TTL_MS);
  }

  function createQrcodeDataUrl(qrcodeImgContent) {
    if (!globalThis.DogeclawQrCode) {
      throw new Error(t("channel.qrGeneratorMissing"));
    }

    const qr = globalThis.DogeclawQrCode(0, "M");
    qr.addData(String(qrcodeImgContent || ""), "Byte");
    qr.make();
    const svg = qr.createSvgTag({
      cellSize: 6,
      margin: 18,
      scalable: true,
      title: t("channel.qrAlt"),
      alt: t("channel.qrAlt")
    });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function getLocalStorage() {
    const storage = PLATFORM.storage?.local;
    if (!storage?.get || !storage?.set) {
      throw new Error(t("runtime.storageApiUnavailable"));
    }
    return storage;
  }

  async function getConfig({ masked = false } = {}) {
    const result = await getLocalStorage().get(CONFIG_KEY);
    const stored = result[CONFIG_KEY] && typeof result[CONFIG_KEY] === "object" ? result[CONFIG_KEY] : {};
    const storedAppId = String(stored.appId || "").trim();
    const legacyAccountId = storedAppId && storedAppId !== DEFAULT_ILINK_APP_ID && !stored.accountId ? storedAppId : "";
    const config = {
      ...DEFAULT_CONFIG,
      ...stored,
      apiBase: normalizeBaseUrl(stored.apiBase || DEFAULT_CONFIG.apiBase),
      cdnBaseUrl: normalizeCdnBaseUrl(stored.cdnBaseUrl || DEFAULT_CONFIG.cdnBaseUrl),
      token: String(stored.token || ""),
      appId: storedAppId === DEFAULT_ILINK_APP_ID ? storedAppId : DEFAULT_CONFIG.appId,
      clientVersion: String(stored.clientVersion || DEFAULT_CONFIG.clientVersion),
      accountId: String(stored.accountId || legacyAccountId),
      uin: isValidUin(stored.uin) ? String(stored.uin) : createUin()
    };

    if (!stored.uin || !isValidUin(stored.uin) || legacyAccountId) {
      await getLocalStorage().set({ [CONFIG_KEY]: config });
    }

    return masked
      ? {
          ...config,
          token: maskSecret(config.token)
        }
      : config;
  }

  async function setConfig(config = {}) {
    const current = await getConfig();
    const next = {
      ...current,
      ...(config && typeof config === "object" ? config : {})
    };

    next.enabled = Boolean(next.enabled);
    next.apiBase = normalizeBaseUrl(next.apiBase);
    next.cdnBaseUrl = normalizeCdnBaseUrl(next.cdnBaseUrl);
    next.token = String(next.token || "").trim();
    next.appId = String(next.appId || DEFAULT_CONFIG.appId).trim();
    if (next.appId !== DEFAULT_ILINK_APP_ID) {
      next.accountId = String(next.accountId || next.appId || "").trim();
      next.appId = DEFAULT_ILINK_APP_ID;
    }
    next.clientVersion = String(next.clientVersion || DEFAULT_CONFIG.clientVersion).trim();
    next.accountId = String(next.accountId || "").trim();
    next.uin = String(next.uin || "").trim() || current.uin || createUin();

    await getLocalStorage().set({ [CONFIG_KEY]: next });
    return getConfig({ masked: true });
  }

  async function getState() {
    const result = await getLocalStorage().get(STATE_KEY);
    const state = result[STATE_KEY] && typeof result[STATE_KEY] === "object" ? result[STATE_KEY] : {};
    return {
      getUpdatesBuf: state.getUpdatesBuf || state.cursor || "",
      lastUpdateAt: Number(state.lastUpdateAt || 0)
    };
  }

  async function setState(state = {}) {
    const current = await getState();
    const next = {
      ...current,
      ...state,
      getUpdatesBuf: state.getUpdatesBuf ?? state.get_updates_buf ?? state.cursor ?? current.getUpdatesBuf ?? "",
      lastUpdateAt: Date.now()
    };
    delete next.cursor;
    delete next.get_updates_buf;
    await getLocalStorage().set({ [STATE_KEY]: next });
    return next;
  }

  async function getLoginState() {
    const result = await getLocalStorage().get(LOGIN_KEY);
    const state = result[LOGIN_KEY] && typeof result[LOGIN_KEY] === "object" ? result[LOGIN_KEY] : {};
    const login = {
      qrcode: state.qrcode || "",
      qrcodeUrl: state.qrcodeUrl || "",
      qrcodeImgContent: state.qrcodeImgContent || "",
      currentApiBaseUrl: state.currentApiBaseUrl || "",
      status: state.status || "",
      message: state.message || "",
      lastStatusPayload: state.lastStatusPayload || null,
      startedAt: Number(state.startedAt || 0),
      updatedAt: Number(state.updatedAt || 0)
    };
    return {
      ...login,
      fresh: !login.qrcode || login.status === "confirmed" || isLoginFresh(login)
    };
  }

  async function setLoginState(state = {}) {
    const current = await getLoginState();
    const next = {
      ...current,
      ...state,
      updatedAt: Date.now()
    };
    await getLocalStorage().set({ [LOGIN_KEY]: next });
    return next;
  }

  async function loginRequest(pathname, params = {}, options = {}) {
    const config = await getConfig();
    const timeout = withTimeout(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    const baseUrl = normalizeBaseUrl(options.apiBase || config.apiBase);
    const url = new URL(`${baseUrl}/${normalizePath(pathname)}`);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    try {
      const response = await fetch(url.href, {
        method: "GET",
        headers: {
          "iLink-App-Id": config.appId || DEFAULT_ILINK_APP_ID,
          "iLink-App-ClientVersion": String(config.clientVersion || DEFAULT_ILINK_APP_CLIENT_VERSION)
        },
        signal: timeout.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.errmsg || payload?.message || t("channel.wechatLoginRequestFailed", { status: response.status }));
      }
      return payload;
    } finally {
      timeout.clear();
    }
  }

  async function request(pathname, body = {}, options = {}) {
    const config = await getConfig();
    if (!config.enabled) {
      throw new Error(t("channel.wechatDisabled"));
    }
    if (!config.token) {
      throw new Error(t("channel.wechatTokenMissing"));
    }

    const timeout = withTimeout(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    const url = `${config.apiBase}/${normalizePath(pathname)}`;
    const headers = {
      "Content-Type": "application/json",
      AuthorizationType: "ilink_bot_token",
      Authorization: `Bearer ${config.token}`,
      "X-WECHAT-UIN": createUin(),
      "iLink-App-Id": config.appId || DEFAULT_ILINK_APP_ID,
      "iLink-App-ClientVersion": String(config.clientVersion || DEFAULT_ILINK_APP_CLIENT_VERSION)
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body || {}),
        signal: timeout.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.errmsg || payload?.message || t("channel.wechatRequestFailed", { status: response.status }));
      }
      return payload;
    } finally {
      timeout.clear();
    }
  }

  async function getUpdates(options = {}) {
    const state = await getState();
    const rawTimeoutMs = Number(options.timeoutMs);
    const timeoutMs = rawTimeoutMs > 1000
      ? rawTimeoutMs
      : (Number(options.timeoutSeconds || options.timeout) || rawTimeoutMs || 35) * 1000;
    const payload = await request(
      "getupdates",
      {
        get_updates_buf: options.getUpdatesBuf ?? options.get_updates_buf ?? state.getUpdatesBuf ?? "",
        base_info: {
          channel_version: CHANNEL_VERSION
        }
      },
      {
        timeoutMs
      }
    ).catch((error) => {
      if (error?.name === "AbortError") {
        return {
          ret: 0,
          msgs: [],
          get_updates_buf: state.getUpdatesBuf || ""
        };
      }
      throw error;
    });

    const nextBuf = payload.get_updates_buf || payload.sync_buf || "";
    if (nextBuf) {
      await setState({ getUpdatesBuf: nextBuf });
    }

    return payload;
  }

  async function prepareIncomingMessage(rawMessage, options = {}) {
    if (!MEDIA?.prepareIncomingMessage) {
      const itemList = Array.isArray(rawMessage?.item_list) ? rawMessage.item_list : [];
      const textItem = itemList.find((item) => item?.type === MESSAGE_ITEM_TYPE.TEXT && item?.text_item?.text != null);
      return {
        text: String(textItem?.text_item?.text || ""),
        content: String(textItem?.text_item?.text || ""),
        attachments: []
      };
    }

    const config = await getConfig();
    return MEDIA.prepareIncomingMessage(
      rawMessage,
      {
        cdnBaseUrl: config.cdnBaseUrl || DEFAULT_CDN_BASE_URL
      },
      {
        label: options.label || "inbound"
      }
    );
  }

  function pickQrcode(payload = {}) {
    return {
      qrcode: String(payload.qrcode || ""),
      qrcodeImgContent: String(payload.qrcode_img_content || "")
    };
  }

  function pickLoginToken(payload = {}) {
    return {
      token: payload.bot_token || "",
      accountId: payload.ilink_bot_id || "",
      baseUrl: payload.baseurl || "",
      userId: payload.ilink_user_id || ""
    };
  }

  async function startLogin() {
    const payload = await loginRequest(
      "get_bot_qrcode",
      { bot_type: DEFAULT_ILINK_BOT_TYPE },
      { apiBase: FIXED_QR_BASE_URL }
    );
    const picked = pickQrcode(payload);
    if (!picked.qrcode || !picked.qrcodeImgContent) {
      throw new Error(t("channel.qrResponseIncomplete"));
    }

    return setLoginState({
      qrcode: picked.qrcode,
      qrcodeImgContent: picked.qrcodeImgContent,
      qrcodeUrl: createQrcodeDataUrl(picked.qrcodeImgContent),
      currentApiBaseUrl: FIXED_QR_BASE_URL,
      status: "pending",
      refreshCount: 1,
      message: t("channel.hint"),
      startedAt: Date.now()
    });
  }

  async function checkLoginStatus() {
    const login = await getLoginState();
    if (!login.qrcode) {
      throw new Error(t("channel.loginNotStarted"));
    }
    if (!isLoginFresh(login)) {
      return setLoginState({
        qrcode: "",
        qrcodeUrl: "",
        qrcodeImgContent: "",
        currentApiBaseUrl: "",
        status: "expired",
        message: t("channel.qrExpired")
      });
    }

    const payload = await loginRequest(
      "get_qrcode_status",
      { qrcode: login.qrcode },
      {
        apiBase: login.currentApiBaseUrl || FIXED_QR_BASE_URL,
        timeoutMs: QR_LONG_POLL_TIMEOUT_MS
      }
    ).catch((error) => {
      if (error?.name === "AbortError") {
        return { status: "wait" };
      }
      return {
        status: "wait",
        message: error?.message || String(error)
      };
    });
    const tokenInfo = pickLoginToken(payload);
    const status = payload.status || "";
    const message = payload.message || "";

    if (status === "scaned_but_redirect" && payload.redirect_host) {
      return setLoginState({
        status,
        currentApiBaseUrl: `https://${payload.redirect_host}`,
        message: t("channel.redirecting"),
        lastStatusPayload: {
          status,
          hasBotToken: Boolean(payload.bot_token),
          hasBotId: Boolean(payload.ilink_bot_id),
          redirectHost: payload.redirect_host || ""
        }
      });
    }

    if (status === "expired") {
      return setLoginState({
        status,
        message: t("channel.qrExpired")
      });
    }

    if (status === "confirmed" && tokenInfo.token && tokenInfo.accountId) {
      const current = await getConfig();
      await setConfig({
        ...current,
        enabled: true,
        token: tokenInfo.token,
        accountId: tokenInfo.accountId,
        apiBase: tokenInfo.baseUrl || current.apiBase
      });
      await setState({ getUpdatesBuf: "" });
      return setLoginState({
        status: "confirmed",
        message: t("channel.wechatConfigured"),
        lastStatusPayload: {
          status,
          hasBotToken: Boolean(payload.bot_token),
          hasBotId: Boolean(payload.ilink_bot_id),
          redirectHost: payload.redirect_host || ""
        }
      });
    }

    return setLoginState({
      status: String(status || "pending"),
      message: message || (status === "scaned" ? t("channel.scanned") : t("channel.waitingScan")),
      lastStatusPayload: {
        status,
        hasBotToken: Boolean(payload.bot_token),
        hasBotId: Boolean(payload.ilink_bot_id),
        redirectHost: payload.redirect_host || ""
      }
    });
  }

  async function waitForLogin(options = {}) {
    let login = await getLoginState();
    if (!login.qrcode) {
      return {
        connected: false,
        status: login.status || "",
        message: t("channel.noLogin")
      };
    }
    if (!isLoginFresh(login)) {
      await setLoginState({
        qrcode: "",
        qrcodeUrl: "",
        qrcodeImgContent: "",
        currentApiBaseUrl: "",
        status: "expired",
        message: t("channel.qrExpired")
      });
      return {
        connected: false,
        status: "expired",
        message: t("channel.qrExpired")
      };
    }

    const timeoutMs = Math.max(Number(options.timeoutMs) || DEFAULT_LOGIN_WAIT_TIMEOUT_MS, 1000);
    const deadline = Date.now() + timeoutMs;
    let qrRefreshCount = Number(login.refreshCount || 1) || 1;

    await setLoginState({ currentApiBaseUrl: FIXED_QR_BASE_URL });

    while (Date.now() < deadline) {
      const state = await checkLoginStatus();
      if (state.status === "confirmed") {
        const config = await getConfig();
        return {
          connected: Boolean(config.enabled && config.token),
          status: "confirmed",
          accountId: config.accountId,
          baseUrl: config.apiBase,
          message: t("channel.wechatConfigured")
        };
      }

      if (state.status === "expired") {
        qrRefreshCount += 1;
        if (qrRefreshCount > MAX_QR_REFRESH_COUNT) {
          return {
            connected: false,
            status: "expired",
            message: t("channel.loginExpired")
          };
        }
        const next = await startLogin();
        await setLoginState({ refreshCount: qrRefreshCount });
        login = next;
      }

      await sleep(1000);
    }

    return {
      connected: false,
      status: "timeout",
      message: t("channel.loginTimeout")
    };
  }

  function generateClientId() {
    return `dogeclaw-wechat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function buildSendMessagePayload({ toUser, item, contextToken, clientId, extra }) {
    return {
      msg: {
        from_user_id: "",
        to_user_id: toUser,
        client_id: clientId || generateClientId(),
        message_type: MESSAGE_TYPE.BOT,
        message_state: MESSAGE_STATE.FINISH,
        item_list: item ? [item] : undefined,
        context_token: contextToken || undefined
      },
      base_info: {
        channel_version: CHANNEL_VERSION
      },
      ...(extra && typeof extra === "object" ? extra : {})
    };
  }

  function normalizeMediaList(message = {}) {
    const list = [];
    const append = (item) => {
      if (item && typeof item === "object") {
        list.push(item);
      }
    };

    append(message.media);
    append(message.attachment);
    (Array.isArray(message.mediaList) ? message.mediaList : []).forEach(append);
    (Array.isArray(message.attachments) ? message.attachments : []).forEach(append);
    (Array.isArray(message.mediaUrls) ? message.mediaUrls : []).forEach((url) => append({ url }));
    (Array.isArray(message.mediaDataUrls) ? message.mediaDataUrls : []).forEach((dataUrl) => append({ dataUrl }));
    if (message.mediaUrl) append({ url: message.mediaUrl });
    if (message.mediaDataUrl || message.dataUrl) append({ dataUrl: message.mediaDataUrl || message.dataUrl });
    return list;
  }

  async function sendMessage(message = {}) {
    if (!MEDIA?.uploadMedia || !MEDIA?.buildMediaItem || !MEDIA?.buildTextItem) {
      throw new Error(t("channel.mediaRuntimeUnavailable"));
    }

    const toUser = message.toUser || message.touser || message.openid || "";
    const content = String(message.content || message.text || "");
    const mediaList = normalizeMediaList(message);
    const contextToken = message.contextToken || message.context_token || "";
    if (!toUser) {
      throw new Error(t("channel.toUserRequired"));
    }
    if (!content && !mediaList.length) {
      throw new Error(t("channel.textOrMediaRequired"));
    }

    let lastResponse = null;
    if (!mediaList.length) {
      lastResponse = await request(
        "sendmessage",
        buildSendMessagePayload({
          toUser,
          item: MEDIA.buildTextItem(content),
          contextToken,
          clientId: message.clientId,
          extra: message.extra
        })
      );
      return lastResponse;
    }

    let captionSent = false;
    for (const media of mediaList) {
      if (content && !captionSent) {
        lastResponse = await request(
          "sendmessage",
          buildSendMessagePayload({
            toUser,
            item: MEDIA.buildTextItem(content),
            contextToken,
            extra: message.extra
          })
        );
        captionSent = true;
      }

      const source = await MEDIA.sourceToMediaData(media);
      const kind = MEDIA.inferMediaKind(media, source.mimeType);
      const uploaded = await MEDIA.uploadMedia({
        request,
        config: {
          channelVersion: CHANNEL_VERSION,
          cdnBaseUrl: (await getConfig()).cdnBaseUrl || DEFAULT_CDN_BASE_URL
        },
        toUserId: toUser,
        media: {
          ...media,
          bytes: source.bytes,
          mimeType: source.mimeType,
          fileName: source.fileName
        },
        mediaType: MEDIA.getUploadMediaType(kind)
      });
      lastResponse = await request(
        "sendmessage",
        buildSendMessagePayload({
          toUser,
          item: MEDIA.buildMediaItem(uploaded, kind),
          contextToken,
          extra: message.extra
        })
      );
    }

    return lastResponse || { ret: 0 };
  }

  async function getBotConfig(options = {}) {
    const userId = String(options.ilinkUserId || options.userId || options.fromUser || options.toUser || "").trim();
    if (!userId) {
      throw new Error(t("channel.ilinkUserIdRequired"));
    }

    return request(
      "getconfig",
      {
        ilink_user_id: userId,
        context_token: options.contextToken || options.context_token || undefined,
        base_info: {
          channel_version: CHANNEL_VERSION
        }
      },
      {
        timeoutMs: Number(options.timeoutMs) || CONFIG_TIMEOUT_MS
      }
    );
  }

  async function sendTyping(options = {}) {
    const userId = String(options.ilinkUserId || options.userId || options.toUser || options.touser || options.openid || "").trim();
    const typingTicket = String(options.typingTicket || options.typing_ticket || options.ticket || "").trim();
    const payload = {
      ilink_user_id: userId,
      typing_ticket: typingTicket,
      status: Number(options.status) || TYPING_STATUS.TYPING,
      base_info: {
        channel_version: CHANNEL_VERSION
      }
    };

    if (!payload.ilink_user_id) {
      throw new Error(t("channel.ilinkUserIdRequired"));
    }
    if (!payload.typing_ticket) {
      throw new Error(t("channel.typingTicketRequired"));
    }

    return request("sendtyping", payload, {
      timeoutMs: Number(options.timeoutMs) || CONFIG_TIMEOUT_MS
    });
  }

  async function execute(args = {}) {
    const action = String(args.action || "").trim();
    if (action === "get_config") return getConfig({ masked: true });
    if (action === "set_config") return setConfig(args.config || args);
    if (action === "start_login") return startLogin(args);
    if (action === "check_login") return checkLoginStatus(args);
    if (action === "wait_login") return waitForLogin(args);
    if (action === "get_login_state") return getLoginState();
    if (action === "get_updates") return getUpdates(args);
    if (action === "prepare_incoming") return prepareIncomingMessage(args.message || args.raw || args);
    if (action === "send_text") return sendMessage({ ...args, msgtype: "text" });
    if (action === "send_media") return sendMessage(args);
    if (action === "get_bot_config") return getBotConfig(args);
    if (action === "send_typing") return sendTyping(args);
    if (action === "get_state") return getState();
    if (action === "set_state") return setState(args.state || args);
    throw new Error(t("channel.unknownWechatAction", { action: action || t("common.empty") }));
  }

  globalThis.DogeclawWechatChannel = {
    getConfig,
    setConfig,
    getState,
    setState,
    getUpdates,
    prepareIncomingMessage,
    startLogin,
    checkLoginStatus,
    waitForLogin,
    getLoginState,
    sendMessage,
    sendTyping,
    getBotConfig,
    execute
  };
})();

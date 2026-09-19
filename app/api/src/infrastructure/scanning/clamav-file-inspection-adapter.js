import net from "node:net";
import yauzl from "yauzl";

const MIME = {
  word: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xl: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function clamScan(bytes, host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = "";
    socket.setTimeout(30_000, () =>
      socket.destroy(new Error("ClamAV timeout")),
    );
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      response += chunk.toString();
    });
    socket.on("end", () =>
      response.includes("OK")
        ? resolve(false)
        : response.includes("FOUND")
          ? resolve(true)
          : reject(new Error("ClamAV scan failed")),
    );
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
        const chunk = bytes.subarray(offset, offset + 64 * 1024);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
      socket.end();
    });
  });
}

function zipEntries(bytes) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const names = [];
      zip.readEntry();
      zip.on("entry", (entry) => {
        names.push(entry.fileName);
        zip.readEntry();
      });
      zip.on("end", () => resolve(names));
      zip.on("error", reject);
    });
  });
}

async function detectMime(bytes) {
  if (bytes.subarray(0, 5).toString() === "%PDF-")
    return {
      mime: "application/pdf",
      encrypted: bytes.includes(Buffer.from("/Encrypt")),
    };
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { mime: "image/png", encrypted: false };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { mime: "image/jpeg", encrypted: false };
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    return { mime: "image/webp", encrypted: false };
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const names = await zipEntries(bytes);
    if (names.includes("EncryptedPackage") || names.includes("EncryptionInfo"))
      return { mime: null, encrypted: true };
    const family = Object.keys(MIME).find((prefix) =>
      names.some((name) => name.startsWith(`${prefix}/`)),
    );
    return { mime: family ? MIME[family] : null, encrypted: false };
  }
  const text = bytes.toString("utf8");
  const hasUnsafeControl = [...text].some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 && ![9, 10, 13].includes(code);
  });
  if (!text.includes("\uFFFD") && !hasUnsafeControl)
    return {
      mime:
        text.includes(",") && text.includes("\n") ? "text/csv" : "text/plain",
      encrypted: false,
    };
  return { mime: null, encrypted: false };
}

export class ClamAvFileInspectionAdapter {
  constructor({ host, port, allowedMimeTypes }) {
    this.host = host;
    this.port = port;
    this.allowed = new Set(allowedMimeTypes.split(",").map((x) => x.trim()));
  }
  async inspect(bytes) {
    const infected = await clamScan(bytes, this.host, this.port);
    if (infected)
      return {
        accepted: false,
        reason: "MALWARE_DETECTED",
        detectedContentType: null,
      };
    const detected = await detectMime(bytes);
    if (detected.encrypted)
      return {
        accepted: false,
        reason: "ENCRYPTED_FILE",
        detectedContentType: detected.mime,
      };
    if (!detected.mime || !this.allowed.has(detected.mime))
      return {
        accepted: false,
        reason: "FILE_TYPE_NOT_ALLOWED",
        detectedContentType: detected.mime,
      };
    return { accepted: true, detectedContentType: detected.mime };
  }
}

/** Minimal first-sheet XLSX reader for customer imports (browser only). */

const decoder = new TextDecoder("utf-8");

function findEndOfCentralDirectory(view: DataView): number {
  const min = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= min; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("Invalid XLSX file: ZIP directory not found");
}

async function decompress(method: number, bytes: Uint8Array): Promise<Uint8Array> {
  if (method === 0) return bytes;
  if (method !== 8) throw new Error(`Unsupported XLSX compression method: ${method}`);
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot read compressed XLSX files. Use CSV instead.");
  }
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer: ArrayBuffer): Promise<Map<string, string>> {
  const view = new DataView(buffer);
  const eocd = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files = new Map<string, string>();

  for (let index = 0; index < entryCount; index++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Invalid XLSX directory entry");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));

    if (name.endsWith(".xml")) {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("Invalid XLSX local entry");
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = new Uint8Array(buffer, dataOffset, compressedSize);
      files.set(name, decoder.decode(await decompress(method, compressed)));
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result - 1;
}

function excelDate(serial: string): string {
  const value = Number(serial);
  if (!Number.isFinite(value) || value < 1) return serial;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function parseXml(xml: string): XMLDocument {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Invalid XML in XLSX file");
  return document;
}

export async function parseXlsx(file: File): Promise<Record<string, string>[]> {
  const files = await unzip(await file.arrayBuffer());
  const sharedXml = files.get("xl/sharedStrings.xml");
  const shared = sharedXml
    ? Array.from(parseXml(sharedXml).querySelectorAll("si")).map((item) =>
        Array.from(item.querySelectorAll("t")).map((text) => text.textContent ?? "").join(""),
      )
    : [];
  const sheetEntry = Array.from(files.keys()).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetEntry) throw new Error("The workbook has no readable worksheet");
  const rows = Array.from(parseXml(files.get(sheetEntry)!).querySelectorAll("sheetData > row"));
  if (rows.length === 0) return [];

  const values = rows.map((row) => {
    const cells: string[] = [];
    for (const cell of Array.from(row.querySelectorAll("c"))) {
      const index = columnIndex(cell.getAttribute("r") ?? "A1");
      const type = cell.getAttribute("t");
      const raw = cell.querySelector("v")?.textContent ?? cell.querySelector("is > t")?.textContent ?? "";
      cells[index] = type === "s" ? (shared[Number(raw)] ?? "") : raw;
    }
    return cells;
  });

  const headers = values[0]!.map((value) => value.trim());
  return values.slice(1).filter((row) => row.some(Boolean)).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      const raw = row[index] ?? "";
      record[header] = header === "dob" || header === "passportExpiry" ? excelDate(raw) : raw;
    });
    return record;
  });
}

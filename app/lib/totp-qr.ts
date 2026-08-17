const QR_VERSION = 6;
const QR_SIZE = 41;
const QR_DATA_CODEWORDS = 136;
const QR_BLOCK_DATA_CODEWORDS = 68;
const QR_ECC_CODEWORDS = 18;
const QR_MAX_BYTE_PAYLOAD = 134;
const TOTP_SECRET = /^[A-Z2-7]{32}$/;

const GF_EXP = new Array<number>(512).fill(0);
const GF_LOG = new Array<number>(256).fill(0);
{
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    GF_EXP[index] = value;
    GF_LOG[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) GF_EXP[index] = GF_EXP[index - 255];
}

function gfMultiply(left: number, right: number) {
  if (left === 0 || right === 0) return 0;
  return GF_EXP[GF_LOG[left] + GF_LOG[right]];
}

function reedSolomonGenerator(degree: number) {
  let polynomial = [1];
  for (let power = 0; power < degree; power += 1) {
    const next = new Array<number>(polynomial.length + 1).fill(0);
    for (let index = 0; index < polynomial.length; index += 1) {
      next[index] ^= polynomial[index];
      next[index + 1] ^= gfMultiply(polynomial[index], GF_EXP[power]);
    }
    polynomial = next;
  }
  return polynomial;
}

function reedSolomonRemainder(data: readonly number[], degree: number) {
  const generator = reedSolomonGenerator(degree);
  const remainder = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[degree - 1] = 0;
    for (let index = 0; index < degree; index += 1) {
      remainder[index] ^= gfMultiply(generator[index + 1], factor);
    }
  }
  return remainder;
}

function appendBits(target: number[], value: number, length: number) {
  for (let bit = length - 1; bit >= 0; bit -= 1) target.push((value >>> bit) & 1);
}

function dataCodewords(payload: string) {
  const bytes = new TextEncoder().encode(payload);
  if (bytes.length > QR_MAX_BYTE_PAYLOAD) throw new Error("TOTP_QR_PAYLOAD_TOO_LONG");
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) appendBits(bits, byte, 8);
  const capacity = QR_DATA_CODEWORDS * 8;
  const terminator = Math.min(4, capacity - bits.length);
  for (let index = 0; index < terminator; index += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const output: number[] = [];
  for (let offset = 0; offset < bits.length; offset += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | bits[offset + bit];
    output.push(byte);
  }
  const pads = [0xec, 0x11] as const;
  let pad = 0;
  while (output.length < QR_DATA_CODEWORDS) {
    output.push(pads[pad % 2]);
    pad += 1;
  }
  return output;
}

function finalCodewords(payload: string) {
  const data = dataCodewords(payload);
  const first = data.slice(0, QR_BLOCK_DATA_CODEWORDS);
  const second = data.slice(QR_BLOCK_DATA_CODEWORDS);
  const firstEcc = reedSolomonRemainder(first, QR_ECC_CODEWORDS);
  const secondEcc = reedSolomonRemainder(second, QR_ECC_CODEWORDS);
  const output: number[] = [];
  for (let index = 0; index < QR_BLOCK_DATA_CODEWORDS; index += 1) output.push(first[index], second[index]);
  for (let index = 0; index < QR_ECC_CODEWORDS; index += 1) output.push(firstEcc[index], secondEcc[index]);
  return output;
}

function setFunctionModule(
  modules: boolean[][],
  functions: boolean[][],
  x: number,
  y: number,
  dark: boolean,
) {
  if (x < 0 || y < 0 || x >= QR_SIZE || y >= QR_SIZE) return;
  modules[y][x] = dark;
  functions[y][x] = true;
}

function drawFinder(modules: boolean[][], functions: boolean[][], left: number, top: number) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const dark = inside && (
        dx === 0 || dx === 6 || dy === 0 || dy === 6
        || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
      );
      setFunctionModule(modules, functions, left + dx, top + dy, dark);
    }
  }
}

function drawAlignment(modules: boolean[][], functions: boolean[][], centerX: number, centerY: number) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunctionModule(
        modules,
        functions,
        centerX + dx,
        centerY + dy,
        Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
      );
    }
  }
}

function formatBits() {
  const data = 0b01000; // error correction L (01), mask 0 (000)
  let remainder = data;
  for (let index = 0; index < 10; index += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  return ((data << 10) | remainder) ^ 0x5412;
}

function drawFormat(modules: boolean[][], functions: boolean[][]) {
  const bits = formatBits();
  const getBit = (index: number) => ((bits >>> index) & 1) !== 0;
  for (let index = 0; index < 6; index += 1) setFunctionModule(modules, functions, 8, index, getBit(index));
  setFunctionModule(modules, functions, 8, 7, getBit(6));
  setFunctionModule(modules, functions, 8, 8, getBit(7));
  setFunctionModule(modules, functions, 7, 8, getBit(8));
  for (let index = 9; index < 15; index += 1) setFunctionModule(modules, functions, 14 - index, 8, getBit(index));
  for (let index = 0; index < 8; index += 1) setFunctionModule(modules, functions, QR_SIZE - 1 - index, 8, getBit(index));
  for (let index = 8; index < 15; index += 1) setFunctionModule(modules, functions, 8, QR_SIZE - 15 + index, getBit(index));
  setFunctionModule(modules, functions, 8, QR_SIZE - 8, true);
}

function qrMatrix(payload: string) {
  const modules = Array.from({ length: QR_SIZE }, () => new Array<boolean>(QR_SIZE).fill(false));
  const functions = Array.from({ length: QR_SIZE }, () => new Array<boolean>(QR_SIZE).fill(false));
  drawFinder(modules, functions, 0, 0);
  drawFinder(modules, functions, QR_SIZE - 7, 0);
  drawFinder(modules, functions, 0, QR_SIZE - 7);
  for (let index = 8; index < QR_SIZE - 8; index += 1) {
    setFunctionModule(modules, functions, 6, index, index % 2 === 0);
    setFunctionModule(modules, functions, index, 6, index % 2 === 0);
  }
  drawAlignment(modules, functions, 34, 34);
  drawFormat(modules, functions);

  const bits: number[] = [];
  for (const byte of finalCodewords(payload)) appendBits(bits, byte, 8);
  let bitIndex = 0;
  let right = QR_SIZE - 1;
  let upward = true;
  while (right >= 1) {
    if (right === 6) right -= 1;
    for (let rowIndex = 0; rowIndex < QR_SIZE; rowIndex += 1) {
      const y = upward ? QR_SIZE - 1 - rowIndex : rowIndex;
      for (const x of [right, right - 1]) {
        if (functions[y][x]) continue;
        let bit = bitIndex < bits.length ? bits[bitIndex] : 0;
        bitIndex += 1;
        if ((x + y) % 2 === 0) bit ^= 1; // mask pattern 0
        modules[y][x] = bit !== 0;
      }
    }
    upward = !upward;
    right -= 2;
  }
  return modules.map((row) => Object.freeze([...row]));
}

export function buildTotpEnrollmentUri(secret: string) {
  if (!TOTP_SECRET.test(secret)) throw new Error("INVALID_TOTP_SECRET");
  const label = encodeURIComponent("DizyTrades:Account");
  return `otpauth://totp/${label}?secret=${secret}&issuer=DizyTrades&algorithm=SHA1&digits=6&period=30`;
}

export function totpEnrollmentQrMatrix(secret: string) {
  const uri = buildTotpEnrollmentUri(secret);
  if (QR_VERSION !== 6) throw new Error("UNSUPPORTED_QR_VERSION");
  return Object.freeze(qrMatrix(uri));
}

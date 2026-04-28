'use client';

import { useMemo } from 'react';

interface QrCodeProps {
    value: string;
    className?: string;
}

const DATA_CODEWORDS: Record<number, number> = {
    1: 19,
    2: 34,
    3: 55,
    4: 80,
};

const ECC_CODEWORDS: Record<number, number> = {
    1: 7,
    2: 10,
    3: 15,
    4: 20,
};

const gfExp = new Array<number>(512);
const gfLog = new Array<number>(256);

let value = 1;
for (let i = 0; i < 255; i++) {
    gfExp[i] = value;
    gfLog[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
}
for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];

function gfMultiply(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return gfExp[gfLog[a] + gfLog[b]];
}

function reedSolomonGenerator(degree: number): number[] {
    let result = [1];
    for (let i = 0; i < degree; i++) {
        const next = new Array(result.length + 1).fill(0);
        for (let j = 0; j < result.length; j++) {
            next[j] ^= result[j];
            next[j + 1] ^= gfMultiply(result[j], gfExp[i]);
        }
        result = next;
    }
    return result;
}

function reedSolomonRemainder(data: number[], degree: number): number[] {
    const generator = reedSolomonGenerator(degree);
    const result = new Array(degree).fill(0);
    for (const byte of data) {
        const factor = byte ^ result[0];
        result.copyWithin(0, 1);
        result[degree - 1] = 0;
        for (let i = 0; i < degree; i++) {
            result[i] ^= gfMultiply(generator[i + 1], factor);
        }
    }
    return result;
}

function appendBits(target: number[], data: number, length: number) {
    for (let i = length - 1; i >= 0; i--) {
        target.push((data >>> i) & 1);
    }
}

function makeDataCodewords(text: string, version: number): number[] {
    const bytes = Array.from(new TextEncoder().encode(text));
    const capacityBits = DATA_CODEWORDS[version] * 8;
    const bits: number[] = [];

    appendBits(bits, 0b0100, 4);
    appendBits(bits, bytes.length, 8);
    for (const byte of bytes) appendBits(bits, byte, 8);

    const terminator = Math.min(4, capacityBits - bits.length);
    appendBits(bits, 0, terminator);
    while (bits.length % 8 !== 0) bits.push(0);

    const result: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
        result.push(byte);
    }

    for (let pad = 0xec; result.length < DATA_CODEWORDS[version]; pad ^= 0xfd) {
        result.push(pad);
    }

    return result;
}

function chooseVersion(text: string): number {
    const bytes = new TextEncoder().encode(text).length;
    for (let version = 1; version <= 4; version++) {
        if (4 + 8 + bytes * 8 <= DATA_CODEWORDS[version] * 8) return version;
    }
    return 4;
}

function getFormatBit(bits: number, index: number): boolean {
    return ((bits >>> index) & 1) !== 0;
}

function getFormatBits(mask: number): number {
    const errorCorrectionLevelLow = 1;
    const data = (errorCorrectionLevelLow << 3) | mask;
    let remainder = data;
    for (let i = 0; i < 10; i++) {
        remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) ? 0x537 : 0);
    }
    return ((data << 10) | remainder) ^ 0x5412;
}

function createQrModules(text: string): boolean[][] {
    const version = chooseVersion(text);
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

    const setFunction = (row: number, col: number, isDark: boolean) => {
        if (row < 0 || col < 0 || row >= size || col >= size) return;
        modules[row][col] = isDark;
        reserved[row][col] = true;
    };

    const reserve = (row: number, col: number) => {
        if (row < 0 || col < 0 || row >= size || col >= size) return;
        reserved[row][col] = true;
    };

    const drawFinder = (row: number, col: number) => {
        for (let y = -1; y <= 7; y++) {
            for (let x = -1; x <= 7; x++) {
                const r = row + y;
                const c = col + x;
                if (r < 0 || c < 0 || r >= size || c >= size) continue;
                const isPattern = x >= 0 && x <= 6 && y >= 0 && y <= 6;
                const isDark = isPattern && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
                setFunction(r, c, isDark);
            }
        }
    };

    const drawAlignment = (centerRow: number, centerCol: number) => {
        for (let y = -2; y <= 2; y++) {
            for (let x = -2; x <= 2; x++) {
                const distance = Math.max(Math.abs(x), Math.abs(y));
                setFunction(centerRow + y, centerCol + x, distance !== 1);
            }
        }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    for (let i = 8; i < size - 8; i++) {
        const isDark = i % 2 === 0;
        setFunction(6, i, isDark);
        setFunction(i, 6, isDark);
    }

    if (version > 1) {
        const position = size - 7;
        drawAlignment(position, position);
    }

    setFunction(size - 8, 8, true);

    for (let i = 0; i < 9; i++) {
        if (i !== 6) {
            reserve(8, i);
            reserve(i, 8);
        }
    }
    for (let i = 0; i < 8; i++) reserve(size - 1 - i, 8);
    for (let i = 8; i < 15; i++) reserve(8, size - 15 + i);

    const dataCodewords = makeDataCodewords(text, version);
    const ecc = reedSolomonRemainder(dataCodewords, ECC_CODEWORDS[version]);
    const allCodewords = [...dataCodewords, ...ecc];
    const bits: number[] = [];
    for (const byte of allCodewords) appendBits(bits, byte, 8);

    let bitIndex = 0;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right--;
        for (let vert = 0; vert < size; vert++) {
            const row = upward ? size - 1 - vert : vert;
            for (let col = right; col >= right - 1; col--) {
                if (reserved[row][col]) continue;
                const rawBit = bitIndex < bits.length ? bits[bitIndex++] === 1 : false;
                const mask = (row + col) % 2 === 0;
                modules[row][col] = rawBit !== mask;
            }
        }
        upward = !upward;
    }

    const formatBits = getFormatBits(0);
    for (let i = 0; i <= 5; i++) setFunction(8, i, getFormatBit(formatBits, i));
    setFunction(8, 7, getFormatBit(formatBits, 6));
    setFunction(8, 8, getFormatBit(formatBits, 7));
    setFunction(7, 8, getFormatBit(formatBits, 8));
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, getFormatBit(formatBits, i));
    for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, getFormatBit(formatBits, i));
    for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, getFormatBit(formatBits, i));
    setFunction(size - 8, 8, true);

    return modules;
}

export const QrCode = ({ value, className = 'w-36 h-36' }: QrCodeProps) => {
    const modules = useMemo(() => createQrModules(value), [value]);
    const quietZone = 4;
    const size = modules.length;
    const viewBoxSize = size + quietZone * 2;
    const darkModules = modules.flatMap((row, y) =>
        row.map((isDark, x) => isDark ? `M${x + quietZone},${y + quietZone}h1v1h-1z` : '').filter(Boolean)
    );

    return (
        <svg
            role="img"
            aria-label="QR code"
            viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
            className={className}
            shapeRendering="crispEdges"
        >
            <rect width={viewBoxSize} height={viewBoxSize} fill="#fff" />
            <path d={darkModules.join('')} fill="#000" />
        </svg>
    );
};

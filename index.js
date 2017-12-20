const fs = require('fs');
const path = require('path');
const util = require('util');

const VIDEO_PATH = path.resolve(__dirname, 'video.mov');

const SIZE_BYTES = 4;
const TYPE_BYTES = 4;
const EXTENDED_SIZE_BYTES = 8;

const atomParsersMap = {
    ftyp: parseFtyp,
    free: parseFreeSkip,
    skip: parseFreeSkip,
    moov: parseMoov,
    mvhd: parseMvhd,
    trak: parseTrak,
    tkhd: parseTkhd,
    tapt: parseTapt,
    clef: parseTaptLeaf,
    prof: parseTaptLeaf,
    enof: parseTaptLeaf,
    edts: parseEdts,
    elst: parseElst,
    mdia: parseMdia,
    mdhd: parseMdhd,
    hdlr: parseHdlr,
    minf: parseMinf,
    vmhd: parseVmhd,
    smhd: parseSmhd,
    dinf: parseDinf,
    dref: parseDref,
    stbl: parseStbl,
    udta: parseUdta,
    AllF: parseAllF,
    SelO: parseSelO,
    WLOC: parseWloc
};

fs.readFile(VIDEO_PATH, (err, data) => {
    const atoms = parseAtoms(getAtoms(data));
    console.log(util.inspect(atoms, { depth: null, colors: true }));
});

function iterate(buffer, offset=0) {
    return {
        next(bytes, remain=false) {
            if (offset >= buffer.byteLength) return null;

            const slice = buffer.slice(offset, offset + bytes);
            if (!remain) {
                offset += bytes;
            }
            return slice;
        },
        rest() {
            const slice = buffer.slice(offset);
            offset = buffer.byteLength;
            return slice;
        }
    };
}

function readFixedPointBuffer(buffer, whole=buffer.byteLength / 2, fraction=whole) {
    return buffer.readUIntBE(0, whole + fraction) >> (8 * fraction);
}

function getAtoms(buffer, offset=0) {
    const atoms = [];

    while (true) {
        const size = getAtomSize(buffer, offset);
        const atom = getAtom(buffer, offset, size);
        atoms.push(atom);

        offset += size;
        if (!size || offset >= buffer.byteLength) break;
    }

    return atoms;
}

function getAtom(buffer, offset, size) {
    if (size === 0) {
        return buffer.slice(offset);
    }
    return buffer.slice(offset, offset + size);
}

function getAtomSize(buffer, offset=0) {
    const size = buffer.readUInt32BE(offset);
    if (size !== 1) return size;

    // NOTE: I believe this will cause an error, since `byteLength` argument
    // should be at most `6`.
    const extendedSize = buffer.readUIntBE(offset + TYPE_BYTES, EXTENDED_SIZE_BYTES);
    return extendedSize;
}

function parseAtoms(atoms) {
    return atoms.map(atom => {
        const size = atom.readUInt32BE(0);
        const type = atom.slice(SIZE_BYTES, SIZE_BYTES + TYPE_BYTES).toString('ascii');
        const data = type in atomParsersMap ? atomParsersMap[type](atom) : null;
        const parsed = { size, type, data };
        Object.defineProperty(parsed, 'buffer', {
            value: atom,
            enumerable: false,
            writable: false
        });
        return parsed;
    });
}

function parseFtyp(atom) {
    const iterator = iterate(atom, 8);
    const majorBrand = iterator.next(4).toString('ascii');

    const minorVersionBCD = iterator.next(4);
    const minorVersionCentury = minorVersionBCD[0].toString(16).padStart(2, '0');
    const minorVersionYear = minorVersionBCD[1].toString(16).padStart(2, '0');
    const minorVersionMonth = minorVersionBCD[2].toString(16).padStart(2, '0');
    const minorVersion = `${minorVersionMonth} ${minorVersionCentury}${minorVersionYear}`;

    const compatibleBrands = [];
    const compatibleBrandsIterator = iterate(iterator.rest());
    const placeholderEntry = '00000000';
    while (compatibleBrandsIterator.next(4, true)) {
        const compatibleBrand = compatibleBrandsIterator.next(4);
        if (compatibleBrand.toString('hex') !== placeholderEntry) {
            compatibleBrands.push(compatibleBrand.toString('ascii'));
        }
    }

    return { majorBrand, minorVersion, compatibleBrands };
}

function parseFreeSkip(atom) {
    const atomSize = getAtomSize(atom);
    return { freeSpace: atomSize - 8 };
}

function parseMoov(atom) {
    return parseAtoms(getAtoms(atom, 8));
}

function parseMvhd(atom) {
    const iterator = iterate(atom, 8);
    const version = iterator.next(1).readUInt8(0);
    const flags = Array.from(iterator.next(3));
    const creationTime = iterator.next(4).readUInt32BE(0);
    const modificationTime = iterator.next(4).readUInt32BE(0);
    const timeScale = iterator.next(4).readUInt32BE(0);
    const duration = iterator.next(4).readUInt32BE(0);
    const preferredRate = readFixedPointBuffer(iterator.next(4));
    const preferredVolume = readFixedPointBuffer(iterator.next(2));
    const reserved = Array.from(iterator.next(10));
    const matrixStructure = iterator.next(36);
    const previewTime = iterator.next(4).readUInt32BE(0);
    const previewDuration = iterator.next(4).readUInt32BE(0);
    const posterTime = iterator.next(4).readUInt32BE(0);
    const selectionTime = iterator.next(4).readUInt32BE(0);
    const selectionDuration = iterator.next(4).readUInt32BE(0);
    const currentTime = iterator.next(4).readUInt32BE(0);
    const nextTrackId = iterator.next(4).readUInt32BE(0);

    return {
        version, flags, creationTime, modificationTime, timeScale, duration,
        preferredRate, preferredVolume, previewTime, previewDuration, posterTime,
        selectionTime, selectionDuration, currentTime, nextTrackId
    };
}

function parseTrak(atom) {
    return parseAtoms(getAtoms(atom, 8));
}

function parseTkhd(atom) {
    const iterator = iterate(atom, 8);
    const version = iterator.next(1).readUInt8(0);
    const flags = Array.from(iterator.next(3));
    const creationTime = iterator.next(4).readUInt32BE(0);
    const modificationTime = iterator.next(4).readUInt32BE(0);
    const trackId = iterator.next(4).readUInt32BE(0);
    iterator.next(4);  // Reserved by Apple
    const duration = iterator.next(4).readUInt32BE(0);
    iterator.next(8);  // Reserved by Apple
    const layer = iterator.next(2).readUInt16BE(0);
    const alternateGroup = iterator.next(2).readUInt16BE(0);
    const volume = readFixedPointBuffer(iterator.next(2));
    iterator.next(2);  // Reserved by Apple
    const matrixStructure = iterator.next(36);
    const trackWidth = readFixedPointBuffer(iterator.next(4));
    const trackHeight = readFixedPointBuffer(iterator.next(4));

    return {
        version, flags, creationTime, modificationTime, trackId, duration,
        layer, alternateGroup, volume, trackWidth, trackHeight
    };
}

function parseTapt(atom) {
    return parseAtoms(getAtoms(atom, 8));
}

function parseTaptLeaf(atom) {
    const iterator = iterate(atom, 8);
    const version = iterator.next(1).readUInt8(0);
    const flags = Array.from(iterator.next(3));
    const width = readFixedPointBuffer(iterator.next(4));
    const height = readFixedPointBuffer(iterator.next(4));

    return { version, flags, width, height };
}

function parseEdts(atom) {
    return parseAtoms(getAtoms(atom, 8));
}

function parseElst(atom) {
    const iterator = iterate(atom, 8);
    const version = iterator.next(1).readUInt8(0);
    const flags = Array.from(iterator.next(3));
    const numberOfEntries = iterator.next(4).readUInt32BE(0);

    const entriesIterator = iterate(iterator.rest());
    const entries = [];
    while (entriesIterator.next(12, true)) {
        const entry = {
            trackDuration: entriesIterator.next(4).readInt32BE(0),
            mediaTime: entriesIterator.next(4).readInt32BE(0),
            mediaRate: entriesIterator.next(4).readInt32BE(0)
        };
        entries.push(entry);
    }

    return { version, flags, numberOfEntries, entries };
}

function parseMdia(atom) {
    return parseAtoms(getAtoms(atom, 8));
}

function parseMdhd(atom) {
    const iterator = iterate(atom, 8);
    const version = iterator.next(1).readUInt8(0);
    const flags = Array.from(iterator.next(3));
    const creationTime = iterator.next(4).readUInt32BE(0);
    const modificationTime = iterator.next(4).readUInt32BE(0);
    const timeScale = iterator.next(4).readUInt32BE(0);
    const duration = iterator.next(4).readUInt32BE(0);
    const language = iterator.next(2).readUInt16BE(0);
    const quality = iterator.next(2).readUInt16BE(0);

    return {
        version, flags, creationTime, modificationTime, timeScale,
        language, quality
    };
}

function parseHdlr(atom) {
    const iterator = iterate(atom, 8);
    const version = iterator.next(1).readUInt8(0);
    const flags = Array.from(iterator.next(3));
    const componentType = iterator.next(4).toString('ascii');
    const componentSubtype = iterator.next(4).toString('ascii');

    return { version, flags, componentType, componentSubtype };
}

function parseMinf(atom) {
    return parseAtoms(getAtoms(atom, 8));
}

function parseVmhd(atom) {
    const iterator = iterate(atom, 8);
    const version = iterator.next(1).readUInt8(0);
    const flags = Array.from(iterator.next(3));
    const graphicsMode = iterator.next(2).readUInt16BE(0);
    const opColor = [
        iterator.next(2).readUInt16BE(0),
        iterator.next(2).readUInt16BE(0),
        iterator.next(2).readUInt16BE(0)
    ];

    return { version, flags, graphicsMode, opColor };
}

function parseSmhd(atom) {
    const iterator = iterate(atom, 8);
    const version = iterator.next(1).readUInt8(0);
    const flags = Array.from(iterator.next(3));
    const balance = iterator.next(2).readUInt16BE(0);
    iterator.next(2);  // Reserved by Apple

    return { version, flags, balance };
}

function parseDinf(atom) {
    return parseAtoms(getAtoms(atom, 8));
}

function parseDref(atom) {
    const iterator = iterate(atom, 8);
    const version = iterator.next(1).readUInt8(0);
    const flags = Array.from(iterator.next(3));
    const numberOfEntries = iterator.next(4).readUInt32BE(0);

    const dataReferencesAtoms = getAtoms(iterator.rest());
    const dataReferences = dataReferencesAtoms.map((ref) => {
        const refIterator = iterate(ref);
        return {
            size: refIterator.next(4).readUInt32BE(0),
            type: refIterator.next(4).toString('ascii'),
            version: refIterator.next(1).readUInt8(0),
            flags: Array.from(refIterator.next(3)),
            data: Array.from(refIterator.rest())
        };
    });

    return { version, flags, numberOfEntries, dataReferences };
}

function parseStbl(atom) {
    return parseAtoms(getAtoms(atom, 8));
}

function parseUdta(atom) {
    return parseAtoms(getAtoms(atom, 8))
        .filter(atom => atom.size > 0);
}

function parseAllF(atom) {
    return atom.readUInt8(8);
}

function parseSelO(atom) {
    return atom.readUInt8(8);
}

function parseWloc(atom) {
    const iterator = iterate(atom, 8);
    const values = [];
    while (iterator.next(2, true)) {
        const value = iterator.next(2).readUInt16BE(0);
        values.push(value);
    }
    return values;
}

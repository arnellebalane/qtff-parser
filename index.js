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
    mvhd: parseMvhd
};

fs.readFile(VIDEO_PATH, (err, data) => {
    const atoms = parseAtoms(getAtoms(data));
    console.log(util.inspect(atoms, { depth: null, colors: true }));
});

function bufferIterator(buffer, offset=0) {
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

function getAtoms(buffer, offset=0) {
    const atoms = [];

    while (true) {
        const size = getAtomSize(buffer, offset);
        const atom = buffer.slice(offset, offset + size);
        atoms.push(atom);

        offset += size;
        if (!size || offset >= buffer.byteLength) break;
    }

    return atoms;
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
        return { size, type, data };
    });
}

function parseFtyp(atom) {
    const iterator = bufferIterator(atom);
    const atomSize = iterator.next(4).readUInt32BE(0);
    const atomType = iterator.next(4).toString('ascii');
    const majorBrand = iterator.next(4).toString('ascii');

    const minorVersionBCD = iterator.next(4);
    const minorVersionCentury = minorVersionBCD[0].toString(16).padStart(2, '0');
    const minorVersionYear = minorVersionBCD[1].toString(16).padStart(2, '0');
    const minorVersionMonth = minorVersionBCD[2].toString(16).padStart(2, '0');
    const minorVersion = `${minorVersionMonth} ${minorVersionCentury}${minorVersionYear}`;

    const compatibleBrands = [];
    const compatibleBrandsIterator = bufferIterator(iterator.rest());
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
    const iterator = bufferIterator(atom);
    const atomSize = iterator.next(4).readUInt32BE(0);
    const atomType = iterator.next(4).toString('ascii');
    const version = iterator.next(1).readUInt8(0);
    const flags = Array.from(iterator.next(3));
    const creationTime = iterator.next(4).readUInt32BE(0);
    const modificationTime = iterator.next(4).readUInt32BE(0);
    const timeScale = iterator.next(4).readUInt32BE(0);
    const duration = iterator.next(4).readUInt32BE(0);
    const preferredRate = iterator.next(4);  // TODO
    const preferredVolume = iterator.next(2);  // TODO
    const reserved = iterator.next(10);
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
        preferredRate, preferredVolume, reserved, previewTime, previewDuration,
        posterTime, selectionTime, selectionDuration, currentTime, nextTrackId
    };
}

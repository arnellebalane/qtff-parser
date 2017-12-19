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
    skip: parseFreeSkip
};

fs.readFile(VIDEO_PATH, (err, data) => {
    const atoms = getAtoms(data);

    const parsed = atoms.map(atom => {
        const size = atom.readUInt32BE(0);
        const type = atom.slice(SIZE_BYTES, SIZE_BYTES + TYPE_BYTES).toString('ascii');
        const data = type in atomParsersMap ? atomParsersMap[type](atom) : null;
        return { size, type, data };
    });

    console.log(util.inspect(parsed, { depth: null, colors: true }));
});

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

function parseFtyp(atom) {
    const atomSize = getAtomSize(atom);
    const majorBrandStart = 8;
    const majorBrandEnd = majorBrandStart + 4;
    const minorVersionStart = majorBrandEnd;
    const minorVersionEnd = minorVersionStart + 4;
    const compatibleBrandsStart = minorVersionEnd;
    const compatibleBrandsEnd = compatibleBrandsStart + (atomSize - compatibleBrandsStart);

    const majorBrand = atom.slice(majorBrandStart, majorBrandEnd).toString('ascii');

    const minorVersionBCD = atom.slice(minorVersionStart, minorVersionEnd);
    const minorVersionCentury = minorVersionBCD[0].toString(16).padStart(2, '0');
    const minorVersionYear = minorVersionBCD[1].toString(16).padStart(2, '0');
    const minorVersionMonth = minorVersionBCD[2].toString(16).padStart(2, '0');
    const minorVersion = `${minorVersionMonth} ${minorVersionCentury}${minorVersionYear}`;

    const compatibleBrands = [];
    const placeholderEntry = '00000000';
    for (let i = compatibleBrandsStart; i < compatibleBrandsEnd; i += 4) {
        const compatibleBrandBuffer = atom.slice(i, i + 4);
        if (compatibleBrandBuffer.toString('hex') !== placeholderEntry) {
            compatibleBrands.push(compatibleBrandBuffer.toString('ascii'));
        }
    }

    return { majorBrand, minorVersion, compatibleBrands };
}

function parseFreeSkip(atom) {
    const atomSize = getAtomSize(atom);
    return { freeSpace: atomSize - 8 };
}

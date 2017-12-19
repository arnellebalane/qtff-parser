const fs = require('fs');
const path = require('path');

const VIDEO_PATH = path.resolve(__dirname, 'video.mov');

const SIZE_BYTES = 4;
const TYPE_BYTES = 4;
const EXTENDED_SIZE_BYTES = 8;

const atomParsersMap = {};

fs.readFile(VIDEO_PATH, (err, data) => {
    const atoms = getAtoms(data);

    const parsed = atoms.map(atom => {
        const size = atom.readUInt32BE(0);
        const type = atom.slice(SIZE_BYTES, SIZE_BYTES + TYPE_BYTES).toString('ascii');
        const data = type in atomParsersMap ? atomParsersMap[type](atom) : null;
        return { size, type, data };
    });

    console.log(parsed);
});

function getAtoms(buffer) {
    const atoms = [];
    let offset = 0;

    while (true) {
        const size = getSize(buffer, offset);
        const atom = buffer.slice(offset, offset + size);
        atoms.push(atom);

        offset += size;
        if (!size || offset >= buffer.byteLength) break;
    }

    return atoms;
}

function getSize(buffer, offset) {
    const size = buffer.readUInt32BE(offset);
    if (size !== 1) return size;

    // NOTE: I believe this will cause an error, since `byteLength` argument
    // should be at most `6`.
    const extendedSize = buffer.readUIntBE(offset + TYPE_BYTES, EXTENDED_SIZE_BYTES);
    return extendedSize;
}

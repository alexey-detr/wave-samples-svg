const fs = require('fs');

let header;
const outputWidth = 1200;
const outputHeight = 500;

let svgResult = '';
const svgPointsPerSample = 2;
const inputStream = process.stdin;

function getSvgHeader(width, height) {
    return '<?xml version="1.0" standalone="no"?>' +
        `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" version="1.1">`;
}

function normalize16bitSample(sampleValue) {
    // https://blogs.msdn.microsoft.com/dawate/2009/06/23/intro-to-audio-programming-part-2-demystifying-the-wav-format/
    return Math.abs(sampleValue / 32760);
}

function formatSvgNumber(value) {
    return value.toFixed(0);
}

const svgPathPoints = [];

function getSvgPathStart() {
    return `<path stroke="black" stroke-width="1" d="M 0 ${outputHeight / 2} `;
}

function getSvgPathEnd() {
    return '" />';
}

function getSvgPathPoint(index, sampleValue) {
    const x = formatSvgNumber(index * svgPointsPerSample);
    const yValue = outputHeight / 2 * sampleValue;
    const y = formatSvgNumber(outputHeight / 2 - yValue);
    svgPathPoints.push({x, y});
    return `L ${x} ${y} `;
}

function getSvgPathLastPoint() {
    const y = formatSvgNumber(outputHeight / 2);
    return `L ${outputWidth} ${y}`
}

function getSvgBackPath() {
    let result = '';
    for (let i = svgPathPoints.length - 1; i >= 0; i--) {
        const {x, y} = svgPathPoints[i];
        const middleY = outputHeight / 2;
        const mirrorY = formatSvgNumber(middleY + (middleY - y));
        result += `L ${x} ${mirrorY} `;
    }
    return result.trim();
}

function getSvgRect(index, sampleValue) {
    const width = formatSvgNumber(svgPointsPerSample);
    const height = formatSvgNumber(sampleValue * outputHeight);
    const x = formatSvgNumber(index * svgPointsPerSample);
    const y = formatSvgNumber(outputHeight / 2 - height / 2);

    return `<rect x='${x}' height='${height}' y='${y}' width='${width}' style='fill: black;'/>`;
}

function getSvgClosingTag() {
    return '</svg>';
}

function readHeader(stream) {
    const buffer = process.stdin.read(44);

    const chunkId = buffer.slice(0, 4).toString();
    const chunkSize = buffer.readUInt32LE(4);
    const format = buffer.slice(8, 12).toString();
    const subchunk1Id = buffer.slice(12, 16).toString();
    const subchunk1Size = buffer.readUInt32LE(16);
    const audioFormat = buffer.readUInt16LE(20);
    const numChannels = buffer.readUInt16LE(22);
    const sampleRate = buffer.readUInt32LE(24);
    const byteRate = buffer.readUInt32LE(28);
    const blockAlign = buffer.readUInt16LE(32);
    const bitsPerSample = buffer.readUInt16LE(34);
    const subchunk2Id = buffer.slice(36, 40).toString();
    const subchunk2Size = buffer.readUInt32LE(40);

    return {
        chunkId,
        chunkSize,
        format,
        subchunk1Id,
        subchunk1Size,
        audioFormat,
        numChannels,
        sampleRate,
        byteRate,
        blockAlign,
        bitsPerSample,
        subchunk2Id,
        subchunk2Size,
    };
}

function validateHeader(header) {
    if (header.chunkId !== 'RIFF') {
        throw new Error('Unsupported format: Chunk ID must be "RIFF"');
    }
    if (header.format !== 'WAVE') {
        throw new Error('Unsupported format: Format must be "WAVE"');
    }
    if (header.subchunk1Id !== 'fmt ') {
        throw new Error('Unsupported format: First subchunk ID must be "fmt "');
    }
    if (header.subchunk2Id !== 'data') {
        throw new Error('Unsupported format: Second subchunk ID must be "data"');
    }

    if (![8, 16].includes(header.bitsPerSample)) {
        throw new Error('Unsupported format: Only 8 or 16 bits per sample are supported');
    }
}

svgResult += getSvgHeader(outputWidth, outputHeight);
svgResult += getSvgPathStart();

let accumulator = [];
let svgBlockIndex = 0;
let bytesReadFromStream = 0;

inputStream.on('readable', () => {
    if (!header) {
        header = readHeader(inputStream);
        console.log('Header', header);
        try {
            validateHeader(header);
        } catch (error) {
            console.error(error);
            process.exit(1);
        }
    }

    let buffer;
    const bytesPerSample = header.bitsPerSample / 8;
    const samplesTotal = header.subchunk2Size / bytesPerSample;
    const samplesPerSvgBlock = Math.round(samplesTotal / (outputWidth / svgPointsPerSample));
    while ((buffer = inputStream.read(2048 * header.blockAlign)) !== null) {
        bytesReadFromStream += buffer.length;
        for (let sampleIndex = 0; sampleIndex < buffer.length / bytesPerSample; sampleIndex += 1) {
            const offset = sampleIndex * bytesPerSample;
            const value = normalize16bitSample(buffer.readInt16LE(offset));
            accumulator.push(value);

            if (accumulator.length === samplesPerSvgBlock) {
                const sampleAvgValue = accumulator.reduce((acc, value) => acc + value, 0) / accumulator.length;
                if (svgBlockIndex > 0) {
                    svgResult += getSvgPathPoint(svgBlockIndex, sampleAvgValue);
                }
                svgBlockIndex += 1;
                accumulator = [];
            }
        }
    }
});

process.stdin.on('end', () => {
    console.log('Bytes read from stream', bytesReadFromStream);
    svgResult += getSvgPathLastPoint();
    svgResult += getSvgBackPath();
    svgResult += getSvgPathEnd();
    svgResult += getSvgClosingTag();
    fs.writeFileSync('output.svg', svgResult);
});

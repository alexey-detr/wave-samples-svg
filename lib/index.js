const fs = require('fs');
const SVGO = require('svgo');
const svgo = new SVGO();

let header;
const outputWidth = 1000;
const outputHeight = 200;

let svgResult = '';
const svgStepSize = 10;

const sampleValuesStorage = [];

// Sample accumulator size until it will be flushed into the sample values storage.
// Sample values storage is needed in case when we don't know the length of the audio,
// in cases when it's streaming or when it is an stdout of LAME decoder for example.
// 100 samples for accumulator is enough to view very detailed shape with a width of
// 1000 SVG points for 1 second duration of WAV 44.1 kHz.
// E.g. for 1 minute of audio for width = 1000 it would be okay to have 6000 samples
// for every sample accumulator storage item.
const maxSamplesAccumulatorSize = 100;

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
    return Math.round(value);
}

const svgPathPoints = [];

function getSvgPathStart() {
    return `<path stroke='black' stroke-width='0.5' d="M 0 ${outputHeight / 2} `;
}

function getSvgPathEnd() {
    return '" />';
}

function getSvgPathPoint(index, sampleValue) {
    const x = formatSvgNumber(index);
    const yValue = outputHeight / 2 * sampleValue;
    const y = formatSvgNumber(outputHeight / 2 - yValue);
    svgPathPoints.push({ x, y });
    return `L ${x} ${y} `;
}

function getSvgPathLastPoint() {
    const y = formatSvgNumber(outputHeight / 2);
    return `L ${outputWidth} ${y}`;
}

function getSvgBackPath() {
    let result = '';
    for (let i = svgPathPoints.length - 1; i >= 0; i--) {
        const { x, y } = svgPathPoints[i];
        const mirrorY = formatSvgNumber(outputHeight - y);
        result += `L ${x} ${mirrorY} `;
    }
    return result + 'Z';
}

function getSvgClosingTag() {
    return '</svg>';
}

function readHeader(stream) {
    let buffer = stream.read(44);

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

    // Skip unknown chunks
    let dataSubchunkId = buffer.slice(36, 40).toString();
    let dataSubchunkSize = buffer.readUInt32LE(40);
    while (dataSubchunkId !== 'data') {
        console.log('Skipping unknown subchunk', dataSubchunkId);
        buffer = stream.read(dataSubchunkSize + 8);
        dataSubchunkId = buffer.slice(dataSubchunkSize, dataSubchunkSize + 4).toString();
        dataSubchunkSize = buffer.readUInt32LE(dataSubchunkSize + 4);
    }

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
        dataSubchunkId,
        dataSubchunkSize,
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
    if (header.dataSubchunkId !== 'data') {
        throw new Error('Unsupported format: Subchunk with ID "data" not found');
    }

    if (header.bitsPerSample !== 16) {
        throw new Error('Unsupported format: Only 16 bits per sample are supported');
    }
}

svgResult += getSvgHeader(outputWidth, outputHeight);
svgResult += getSvgPathStart();

let bytesReadFromStream = 0;
let currentAccumulatorSize = 0;
let channelValues;

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
    if (!channelValues) {
        channelValues = new Array(header.numChannels);
    }
    while ((buffer = inputStream.read(2048 * header.blockAlign)) !== null) {
        bytesReadFromStream += buffer.length;
        for (let i = 0; i < buffer.length / bytesPerSample; i += header.numChannels) {
            for (let j = 0; j < header.numChannels; j += 1) {
                const offset = (i + j) * bytesPerSample;
                const currentChannelValue = normalize16bitSample(buffer.readInt16LE(offset));
                if (!channelValues[j]) {
                    channelValues[j] = [];
                }
                channelValues[j].push(currentChannelValue);
            }
            currentAccumulatorSize += 1;
            if (currentAccumulatorSize === maxSamplesAccumulatorSize) {
                sampleValuesStorage.push(channelValues.map(values => {
                    return Math.max(...values);
                    // return (
                    //     values.reduce((acc, value) => acc + value, 0) / values.length
                    // );
                }));
                currentAccumulatorSize = 0;
                channelValues = new Array(header.numChannels);
            }
        }
    }
});

let svgAccumulator = [];

inputStream.on('end', () => {
    const total = sampleValuesStorage.length;
    // if (total >= outputWidth) {
    //     console.log('====>', 'Narrowing mode');
    //     const superSamplesPerStep = total / outputWidth * svgStepSize;
    //     let position = 0;
    //     let index = 0;
    //     while (Math.round(position + superSamplesPerStep) - 1 < total) {
    //         for (let k = position; k < position + superSamplesPerStep; k += 1) {
    //             svgAccumulator.push(sampleValuesStorage[Math.round(position)]);
    //         }
    //         let channelValues = new Array(header.numChannels);
    //         for (let j = 0; j < header.numChannels; j += 1) {
    //             channelValues[j] = svgAccumulator.reduce((acc, value) => acc + value[j], 0) / svgAccumulator.length;
    //         }
    //         const superSampleAvgValue = channelValues.reduce((acc, value) => acc + value, 0) / channelValues.length;
    //         svgResult += getSvgPathPoint(index, superSampleAvgValue);
    //         svgAccumulator = [];
    //         position += superSamplesPerStep;
    //         index += svgStepSize;
    //     }
    // } else {
        let position = 0;
        const positionStep = total / outputWidth * svgStepSize;
        let index = 0;
        while (Math.round(position) < total) {
            const channelValues = sampleValuesStorage[Math.round(position)];
            // const superSampleAvgValue = channelValues.reduce((acc, value) => acc + value, 0) / channelValues.length;
            const superSampleAvgValue = Math.max(...channelValues);
            svgResult += getSvgPathPoint(index, superSampleAvgValue);
            position += positionStep;
            index += svgStepSize;
        }
    // }

    svgResult += getSvgPathLastPoint();
    svgResult += getSvgBackPath();
    svgResult += getSvgPathEnd();
    svgResult += getSvgClosingTag();

    svgo.optimize(svgResult).then(({ data }) => {
        return fs.writeFileSync('output.svg', data);
    });
});
